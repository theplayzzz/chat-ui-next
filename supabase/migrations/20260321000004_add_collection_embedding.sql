-- ============================================================
-- Migration: RAG Level 3 - Add collection-level embedding and tags
-- ============================================================

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS collection_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS collection_tags TEXT[] DEFAULT '{}';

-- Índice HNSW para seleção de collections por embedding
CREATE INDEX IF NOT EXISTS idx_collections_embedding_hnsw ON collections
  USING hnsw (collection_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
