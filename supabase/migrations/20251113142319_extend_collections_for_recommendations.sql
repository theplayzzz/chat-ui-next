-- Extensão da tabela collections para suportar sistema de recomendações multi-nicho
-- Migration: extend_collections_for_recommendations
-- Data: 2025-11-13

-- Adicionar colunas para configuração de chunks e tipo de coleção
ALTER TABLE collections
  ADD COLUMN chunk_size INT DEFAULT 4000 CHECK (chunk_size > 0),
  ADD COLUMN chunk_overlap INT DEFAULT 200 CHECK (chunk_overlap >= 0 AND chunk_overlap < chunk_size),
  ADD COLUMN collection_type TEXT CHECK (collection_type IN ('health_plan', 'insurance', 'financial', 'general'));

-- Criar índice para otimizar queries por tipo de coleção
CREATE INDEX idx_collections_type ON collections(collection_type);

-- Comentários para documentação
COMMENT ON COLUMN collections.chunk_size IS 'Tamanho do chunk para processamento de embeddings (padrão: 4000)';
COMMENT ON COLUMN collections.chunk_overlap IS 'Overlap entre chunks consecutivos (padrão: 200)';
COMMENT ON COLUMN collections.collection_type IS 'Tipo de nicho da coleção: health_plan, insurance, financial, general';
