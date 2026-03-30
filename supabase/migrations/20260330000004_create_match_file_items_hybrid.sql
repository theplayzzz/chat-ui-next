-- ============================================================
-- Migration: RAG Level 4 - Hybrid search RPC (vector + BM25)
-- Date: 2026-03-30
-- Purpose: Reciprocal Rank Fusion (RRF) of cosine-similarity
--          vector search and BM25 full-text search via tsvector.
--          Supports tag filtering, plan_type filtering, and
--          tag-based weight boosting.
-- ============================================================

CREATE OR REPLACE FUNCTION match_file_items_hybrid(
  query_embedding vector(1536),
  query_text TEXT,
  match_count int DEFAULT 20,
  file_ids UUID[] DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL,
  filter_plan_type TEXT DEFAULT NULL,
  tag_weights JSONB DEFAULT NULL,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  content TEXT,
  tokens INT,
  similarity FLOAT,
  fts_rank FLOAT,
  rrf_score FLOAT,
  tags TEXT[],
  section_type TEXT,
  weight NUMERIC,
  page_number INT,
  document_context TEXT,
  plan_type TEXT,
  file_name TEXT,
  file_description TEXT,
  collection_name TEXT,
  collection_description TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  fts_count INT;
BEGIN
  -- Enable iterative scan for better HNSW recall
  SET LOCAL hnsw.iterative_scan = relaxed_order;
  SET LOCAL hnsw.ef_search = 200;

  -- ----------------------------------------------------------------
  -- CTE 1: Vector similarity results (cosine)
  -- ----------------------------------------------------------------
  -- CTE 2: Full-text search results (BM25 via ts_rank_cd)
  -- ----------------------------------------------------------------
  -- We fetch a generous over-sample (match_count * 3) from each
  -- retriever so the RRF fusion has enough candidates.
  -- ----------------------------------------------------------------

  -- Check if FTS will return any results
  SELECT count(*) INTO fts_count
  FROM file_items fi
  WHERE fi.content_tsvector @@ plainto_tsquery('portuguese', query_text)
    AND (file_ids IS NULL OR fi.file_id = ANY(file_ids))
  LIMIT 1;

  RETURN QUERY
  WITH vector_results AS (
    SELECT
      fi.id,
      fi.file_id,
      fi.content,
      fi.tokens,
      (1 - (fi.openai_embedding <=> query_embedding))::FLOAT AS v_similarity,
      fi.tags,
      fi.section_type,
      fi.weight,
      fi.page_number,
      fi.document_context,
      fi.plan_type,
      f.name AS file_name,
      f.description AS file_description,
      c.name AS collection_name,
      c.description AS collection_description,
      ROW_NUMBER() OVER (ORDER BY fi.openai_embedding <=> query_embedding) AS v_rank,
      -- Tag boost factor
      GREATEST(1.0, COALESCE(
        (SELECT MAX((tag_weights->>t)::FLOAT)
         FROM unnest(fi.tags) AS t
         WHERE tag_weights IS NOT NULL AND tag_weights ? t),
        1.0
      )) AS tag_boost
    FROM file_items fi
    INNER JOIN files f ON f.id = fi.file_id
    LEFT JOIN collection_files cf ON cf.file_id = f.id
    LEFT JOIN collections c ON c.id = cf.collection_id
    WHERE
      (file_ids IS NULL OR fi.file_id = ANY(file_ids))
      AND (filter_tags IS NULL OR fi.tags && filter_tags)
      AND (filter_plan_type IS NULL OR fi.plan_type = filter_plan_type)
    ORDER BY fi.openai_embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  fts_results AS (
    SELECT
      fi.id,
      ts_rank_cd(fi.content_tsvector, plainto_tsquery('portuguese', query_text))::FLOAT AS f_rank_score,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(fi.content_tsvector, plainto_tsquery('portuguese', query_text)) DESC
      ) AS f_rank
    FROM file_items fi
    WHERE
      fi.content_tsvector @@ plainto_tsquery('portuguese', query_text)
      AND (file_ids IS NULL OR fi.file_id = ANY(file_ids))
      AND (filter_tags IS NULL OR fi.tags && filter_tags)
      AND (filter_plan_type IS NULL OR fi.plan_type = filter_plan_type)
    ORDER BY f_rank_score DESC
    LIMIT match_count * 3
  ),
  fused AS (
    SELECT
      vr.id,
      vr.file_id,
      vr.content,
      vr.tokens,
      vr.v_similarity AS similarity,
      COALESCE(fr.f_rank_score, 0.0)::FLOAT AS fts_rank,
      vr.tags,
      vr.section_type,
      vr.weight,
      vr.page_number,
      vr.document_context,
      vr.plan_type,
      vr.file_name,
      vr.file_description,
      vr.collection_name,
      vr.collection_description,
      -- RRF fusion: combine vector rank and FTS rank
      -- When FTS has no results, fall back to vector-only scoring
      CASE
        WHEN fts_count = 0 THEN
          (1.0 / (rrf_k + vr.v_rank)) * vr.tag_boost * vr.weight
        ELSE
          (
            (1.0 / (rrf_k + vr.v_rank)) +
            (1.0 / (rrf_k + COALESCE(fr.f_rank, match_count * 3 + 1)))
          ) * vr.tag_boost * vr.weight
      END::FLOAT AS rrf_score
    FROM vector_results vr
    LEFT JOIN fts_results fr ON fr.id = vr.id
  )
  SELECT
    fused.id,
    fused.file_id,
    fused.content,
    fused.tokens,
    fused.similarity,
    fused.fts_rank,
    fused.rrf_score,
    fused.tags,
    fused.section_type,
    fused.weight,
    fused.page_number,
    fused.document_context,
    fused.plan_type,
    fused.file_name,
    fused.file_description,
    fused.collection_name,
    fused.collection_description
  FROM fused
  ORDER BY fused.rrf_score DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION match_file_items_hybrid(
  vector(1536), TEXT, int, UUID[], TEXT[], TEXT, JSONB, int
) TO authenticated;

GRANT EXECUTE ON FUNCTION match_file_items_hybrid(
  vector(1536), TEXT, int, UUID[], TEXT[], TEXT, JSONB, int
) TO service_role;

COMMENT ON FUNCTION match_file_items_hybrid IS
  'Hybrid search combining vector cosine similarity with BM25 full-text search via Reciprocal Rank Fusion (RRF). Supports tag/plan_type filtering and tag-based weight boosting.';
