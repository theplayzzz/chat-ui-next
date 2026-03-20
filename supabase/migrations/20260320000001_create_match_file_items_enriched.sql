-- Migration: Create match_file_items_enriched RPC
--
-- This function returns file items with enriched metadata from files and collections.
-- Used by the Health Plan Agent v2 RAG pipeline (retrieve-simple.ts).
--
-- Returns: chunk data + file name/description + collection name/description

CREATE OR REPLACE FUNCTION match_file_items_enriched(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  file_ids UUID[] DEFAULT NULL
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
  WHERE (file_ids IS NULL OR fi.file_id = ANY(file_ids))
  ORDER BY fi.openai_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION match_file_items_enriched(vector(1536), int, UUID[]) TO authenticated;
-- Grant to service_role for server-side calls
GRANT EXECUTE ON FUNCTION match_file_items_enriched(vector(1536), int, UUID[]) TO service_role;

COMMENT ON FUNCTION match_file_items_enriched IS 'Vector search with enriched file and collection metadata for RAG pipeline';
