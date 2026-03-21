-- ============================================================
-- Migration: RAG Level 3 - RPC match_files_by_embedding
-- File-level embedding search for pre-filtering
-- ============================================================

CREATE OR REPLACE FUNCTION match_files_by_embedding(
  query_embedding vector(1536),
  assistant_id UUID,
  match_count int DEFAULT 10,
  min_similarity FLOAT DEFAULT 0.50,
  filter_tags TEXT[] DEFAULT NULL
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
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
