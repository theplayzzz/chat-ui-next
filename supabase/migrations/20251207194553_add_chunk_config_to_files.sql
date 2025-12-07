-- Migration: Add chunk_size and chunk_overlap to files table
-- This moves chunking configuration from collections to individual files

ALTER TABLE files
  ADD COLUMN chunk_size INT DEFAULT 4000 CHECK (chunk_size > 0),
  ADD COLUMN chunk_overlap INT DEFAULT 200 CHECK (chunk_overlap >= 0 AND chunk_overlap < chunk_size);

COMMENT ON COLUMN files.chunk_size IS 'Tamanho do chunk para processamento de embeddings (padrão: 4000)';
COMMENT ON COLUMN files.chunk_overlap IS 'Sobreposição entre chunks consecutivos (padrão: 200)';
