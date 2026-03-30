-- ============================================================
-- Migration: RAG Level 4 - tsvector column for hybrid search
-- Date: 2026-03-30
-- Purpose: Add a pre-computed tsvector column to file_items so
--          we can combine BM25 full-text search with vector
--          similarity (hybrid retrieval with RRF fusion).
-- ============================================================

-- Add tsvector column for full-text search
ALTER TABLE file_items ADD COLUMN IF NOT EXISTS content_tsvector tsvector;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_file_items_tsvector ON file_items USING gin(content_tsvector);

-- Auto-populate trigger (Portuguese language config)
CREATE OR REPLACE FUNCTION file_items_tsvector_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.content_tsvector := to_tsvector('portuguese', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_file_items_tsvector ON file_items;
CREATE TRIGGER trg_file_items_tsvector
  BEFORE INSERT OR UPDATE OF content ON file_items
  FOR EACH ROW EXECUTE FUNCTION file_items_tsvector_trigger();

-- Backfill existing rows
UPDATE file_items SET content_tsvector = to_tsvector('portuguese', COALESCE(content, ''))
WHERE content_tsvector IS NULL;
