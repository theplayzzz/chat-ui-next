-- ============================================================
-- Migration: RAG Level 3 - Add metadata columns to file_items
-- Adds: section_type, tags, weight, page_number, document_context
-- ============================================================

ALTER TABLE file_items
  ADD COLUMN IF NOT EXISTS section_type TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS weight NUMERIC(3,1) DEFAULT 1.0 CHECK (weight >= 0.1 AND weight <= 5.0),
  ADD COLUMN IF NOT EXISTS page_number INT,
  ADD COLUMN IF NOT EXISTS document_context TEXT;

-- Índice GIN para filtragem por tag (arrays)
CREATE INDEX IF NOT EXISTS idx_file_items_tags ON file_items USING gin(tags);

-- Índice para filtragem por section_type
CREATE INDEX IF NOT EXISTS idx_file_items_section_type ON file_items(section_type) WHERE section_type IS NOT NULL;

-- Índice composto para filtragem por arquivo + seção
CREATE INDEX IF NOT EXISTS idx_file_items_file_section ON file_items(file_id, section_type);

-- Índice HNSW para busca vetorial (mais rápido que ivfflat para < 1M registros)
CREATE INDEX IF NOT EXISTS idx_file_items_embedding_hnsw ON file_items
  USING hnsw (openai_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
