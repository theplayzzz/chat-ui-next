-- ============================================================
-- Migration: RAG Level 3 - Add file-level embedding and metadata
-- ============================================================

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS file_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS file_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ingestion_status TEXT DEFAULT 'pending'
    CHECK (ingestion_status IN ('pending', 'analyzing', 'chunking', 'embedding', 'done', 'error')),
  ADD COLUMN IF NOT EXISTS ingestion_metadata JSONB;

-- Índice HNSW para busca de arquivos por embedding
CREATE INDEX IF NOT EXISTS idx_files_embedding_hnsw ON files
  USING hnsw (file_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice GIN para filtragem por tags de arquivo
CREATE INDEX IF NOT EXISTS idx_files_tags ON files USING gin(file_tags);
