-- ============================================================
-- Migration: RAG Level 3 - RPC match_file_items_weighted
-- Weighted vector search with tag boosting and pre-filtering
-- ============================================================

CREATE OR REPLACE FUNCTION match_file_items_weighted(
  query_embedding vector(1536),
  match_count int DEFAULT 20,
  file_ids UUID[] DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL,
  tag_weights JSONB DEFAULT NULL
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
