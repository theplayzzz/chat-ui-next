-- Extensão da tabela file_items para suportar metadados de planos
-- Migration: extend_file_items_for_recommendations
-- Data: 2025-11-13

-- Adicionar coluna JSONB para metadados específicos de planos
ALTER TABLE file_items
  ADD COLUMN plan_metadata JSONB,
  ADD CONSTRAINT valid_plan_metadata
    CHECK (jsonb_typeof(plan_metadata) = 'object' OR plan_metadata IS NULL);

-- Criar índice GIN para otimizar queries JSONB
CREATE INDEX idx_file_items_plan_metadata ON file_items USING gin(plan_metadata);

-- Comentário para documentação
COMMENT ON COLUMN file_items.plan_metadata IS 'Metadados específicos do plano (JSONB) - pode incluir preço, cobertura, operadora, etc.';
