-- ============================================================
-- Migration: RAG Level 4 - Update existing RPCs
-- Date: 2026-03-30
-- Purpose: Add filter_plan_type parameter and HNSW iterative
--          scan to existing match RPCs for backward-compatible
--          plan-scoped retrieval with improved recall.
--
-- Updated functions:
--   1. match_file_items_enriched  (from 20260320000001)
--   2. match_file_items_weighted  (from 20260321000005)
--   3. match_files_by_embedding   (from 20260321000006)
--
-- NOTE: CREATE OR REPLACE preserves existing grants.
--       New parameter has DEFAULT NULL so existing callers
--       are not affected.
-- ============================================================


-- ============================================================
-- 1. match_file_items_enriched
-- ============================================================

-- Drop the old signature so we can add the new parameter
-- (CREATE OR REPLACE cannot add parameters to an existing function)
DROP FUNCTION IF EXISTS match_file_items_enriched(vector(1536), int, UUID[]);

CREATE OR REPLACE FUNCTION match_file_items_enriched(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  file_ids UUID[] DEFAULT NULL,
  filter_plan_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  chunk_content TEXT,
  chunk_tokens INT,
  similarity FLOAT,
  file_id UUID,
  file_name TEXT,
  file_description TEXT,
  collection_id UUID,
  collection_name TEXT,
  collection_description TEXT
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  -- Improve HNSW recall with iterative scan
  SET LOCAL hnsw.iterative_scan = relaxed_order;
  SET LOCAL hnsw.ef_search = 200;

  RETURN QUERY
  SELECT
    fi.id AS chunk_id,
    fi.content AS chunk_content,
    fi.tokens AS chunk_tokens,
    (1 - (fi.openai_embedding <=> query_embedding))::FLOAT AS similarity,
    f.id AS file_id,
    f.name AS file_name,
    f.description AS file_description,
    c.id AS collection_id,
    c.name AS collection_name,
    c.description AS collection_description
  FROM file_items fi
  INNER JOIN files f ON f.id = fi.file_id
  LEFT JOIN collection_files cf ON cf.file_id = f.id
  LEFT JOIN collections c ON c.id = cf.collection_id
  WHERE
    (file_ids IS NULL OR fi.file_id = ANY(file_ids))
    AND (filter_plan_type IS NULL OR fi.plan_type = filter_plan_type)
  ORDER BY fi.openai_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Re-grant after drop + create
GRANT EXECUTE ON FUNCTION match_file_items_enriched(vector(1536), int, UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION match_file_items_enriched(vector(1536), int, UUID[], TEXT) TO service_role;

COMMENT ON FUNCTION match_file_items_enriched IS
  'Vector search with enriched file and collection metadata for RAG pipeline. Supports plan_type filtering and HNSW iterative scan.';


-- ============================================================
-- 2. match_file_items_weighted
-- ============================================================

-- Drop the old signature to add the new parameter
DROP FUNCTION IF EXISTS match_file_items_weighted(vector(1536), int, UUID[], TEXT[], JSONB);

CREATE OR REPLACE FUNCTION match_file_items_weighted(
  query_embedding vector(1536),
  match_count int DEFAULT 20,
  file_ids UUID[] DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL,
  tag_weights JSONB DEFAULT NULL,
  filter_plan_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  chunk_content TEXT,
  chunk_tokens INT,
  base_similarity FLOAT,
  weighted_score FLOAT,
  chunk_weight NUMERIC,
  chunk_tags TEXT[],
  section_type TEXT,
  page_number INT,
  document_context TEXT,
  file_id UUID,
  file_name TEXT,
  file_description TEXT,
  collection_id UUID,
  collection_name TEXT,
  collection_description TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Improve HNSW recall with iterative scan
  SET LOCAL hnsw.iterative_scan = relaxed_order;
  SET LOCAL hnsw.ef_search = 200;

  RETURN QUERY
  WITH ranked_chunks AS (
    SELECT
      fi.id AS chunk_id,
      fi.content AS chunk_content,
      fi.tokens AS chunk_tokens,
      (1 - (fi.openai_embedding <=> query_embedding))::FLOAT AS base_similarity,
      fi.weight AS chunk_weight,
      fi.tags AS chunk_tags,
      fi.section_type,
      fi.page_number,
      fi.document_context,
      f.id AS file_id,
      f.name AS file_name,
      f.description AS file_description,
      c.id AS collection_id,
      c.name AS collection_name,
      c.description AS collection_description,
      GREATEST(1.0, COALESCE(
        (SELECT MAX((tag_weights->>t)::FLOAT)
         FROM unnest(fi.tags) AS t
         WHERE tag_weights ? t),
        1.0
      )) AS computed_tag_boost
    FROM file_items fi
    INNER JOIN files f ON f.id = fi.file_id
    LEFT JOIN collection_files cf ON cf.file_id = f.id
    LEFT JOIN collections c ON c.id = cf.collection_id
    WHERE
      (file_ids IS NULL OR fi.file_id = ANY(file_ids))
      AND (filter_tags IS NULL OR fi.tags && filter_tags)
      AND (filter_plan_type IS NULL OR fi.plan_type = filter_plan_type)
  )
  SELECT
    rc.chunk_id, rc.chunk_content, rc.chunk_tokens,
    rc.base_similarity,
    (rc.base_similarity * rc.chunk_weight * rc.computed_tag_boost)::FLOAT AS weighted_score,
    rc.chunk_weight, rc.chunk_tags, rc.section_type, rc.page_number, rc.document_context,
    rc.file_id, rc.file_name, rc.file_description,
    rc.collection_id, rc.collection_name, rc.collection_description
  FROM ranked_chunks rc
  ORDER BY weighted_score DESC
  LIMIT match_count;
END;
$$;

-- Re-grant after drop + create
GRANT EXECUTE ON FUNCTION match_file_items_weighted(
  vector(1536), int, UUID[], TEXT[], JSONB, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION match_file_items_weighted(
  vector(1536), int, UUID[], TEXT[], JSONB, TEXT
) TO service_role;

COMMENT ON FUNCTION match_file_items_weighted IS
  'Weighted vector search with tag boosting, pre-filtering, plan_type filtering, and HNSW iterative scan.';


-- ============================================================
-- 3. match_files_by_embedding
-- ============================================================

-- Drop the old signature to add the new parameter
DROP FUNCTION IF EXISTS match_files_by_embedding(vector(1536), UUID, int, FLOAT, TEXT[]);

CREATE OR REPLACE FUNCTION match_files_by_embedding(
  query_embedding vector(1536),
  assistant_id UUID,
  match_count int DEFAULT 10,
  min_similarity FLOAT DEFAULT 0.50,
  filter_tags TEXT[] DEFAULT NULL,
  filter_plan_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  file_id UUID,
  file_name TEXT,
  file_description TEXT,
  file_tags TEXT[],
  collection_id UUID,
  collection_name TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Improve HNSW recall with iterative scan
  SET LOCAL hnsw.iterative_scan = relaxed_order;
  SET LOCAL hnsw.ef_search = 200;

  RETURN QUERY
  SELECT
    f.id AS file_id,
    f.name AS file_name,
    f.description AS file_description,
    f.file_tags,
    c.id AS collection_id,
    c.name AS collection_name,
    (1 - (f.file_embedding <=> query_embedding))::FLOAT AS similarity
  FROM files f
  INNER JOIN collection_files cf ON cf.file_id = f.id
  INNER JOIN collections c ON c.id = cf.collection_id
  INNER JOIN assistant_collections ac ON ac.collection_id = c.id
  WHERE
    ac.assistant_id = match_files_by_embedding.assistant_id
    AND f.file_embedding IS NOT NULL
    AND (1 - (f.file_embedding <=> query_embedding)) >= min_similarity
    AND (filter_tags IS NULL OR f.file_tags && filter_tags)
    AND (filter_plan_type IS NULL OR EXISTS (
      SELECT 1 FROM file_items fi
      WHERE fi.file_id = f.id AND fi.plan_type = filter_plan_type
      LIMIT 1
    ))
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Re-grant after drop + create
GRANT EXECUTE ON FUNCTION match_files_by_embedding(
  vector(1536), UUID, int, FLOAT, TEXT[], TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION match_files_by_embedding(
  vector(1536), UUID, int, FLOAT, TEXT[], TEXT
) TO service_role;

COMMENT ON FUNCTION match_files_by_embedding IS
  'File-level embedding search for pre-filtering with tag filtering, plan_type filtering, and HNSW iterative scan.';
