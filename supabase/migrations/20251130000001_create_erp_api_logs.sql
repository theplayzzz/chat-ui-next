-- Migration: create_erp_api_logs
-- Data: 2025-11-30
-- Task: 17.1 - Migrations SQL para interface administrativa ERP
-- PRD Reference: RF-006 (Integracao com API ERP), RNF-003 (Disponibilidade)

-- ============================================================================
-- TABELA DE LOGS DE CHAMADAS API ERP
-- ============================================================================
-- Armazena historico de todas as chamadas a API ERP para monitoramento
-- e debugging. Inclui tempo de resposta, status, e informacoes de cache.

CREATE TABLE IF NOT EXISTS erp_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  response_time_ms INTEGER,
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  request_params JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comentarios
COMMENT ON TABLE erp_api_logs IS
  'Log de todas as chamadas API ERP para monitoramento e debugging';

COMMENT ON COLUMN erp_api_logs.workspace_id IS
  'Workspace que realizou a chamada';

COMMENT ON COLUMN erp_api_logs.timestamp IS
  'Momento exato da chamada API';

COMMENT ON COLUMN erp_api_logs.status IS
  'Resultado da chamada: success, error, ou timeout';

COMMENT ON COLUMN erp_api_logs.response_time_ms IS
  'Tempo de resposta em milissegundos';

COMMENT ON COLUMN erp_api_logs.cache_hit IS
  'Se a resposta veio do cache (true) ou da API real (false)';

COMMENT ON COLUMN erp_api_logs.error_message IS
  'Mensagem de erro quando status != success';

COMMENT ON COLUMN erp_api_logs.request_params IS
  'Parametros da requisicao (plan_ids, etc) para debugging';

-- ============================================================================
-- INDICES PARA PERFORMANCE
-- ============================================================================

-- Indice para filtrar por workspace (mais comum)
CREATE INDEX IF NOT EXISTS idx_erp_api_logs_workspace_id
  ON erp_api_logs(workspace_id);

-- Indice para ordenacao por timestamp (DESC para queries recentes primeiro)
CREATE INDEX IF NOT EXISTS idx_erp_api_logs_timestamp
  ON erp_api_logs(timestamp DESC);

-- Indice para filtrar por status (ex: ver apenas erros)
CREATE INDEX IF NOT EXISTS idx_erp_api_logs_status
  ON erp_api_logs(status);

-- Indice composto para queries comuns: workspace + timestamp
CREATE INDEX IF NOT EXISTS idx_erp_api_logs_workspace_timestamp
  ON erp_api_logs(workspace_id, timestamp DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE erp_api_logs ENABLE ROW LEVEL SECURITY;

-- Politica de SELECT: usuarios podem ver logs do seu workspace
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'erp_api_logs' AND policyname = 'erp_api_logs_select_policy'
  ) THEN
    CREATE POLICY erp_api_logs_select_policy ON erp_api_logs
      FOR SELECT
      USING (
        workspace_id IN (
          SELECT id FROM workspaces WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Politica de INSERT: apenas via service role (sistema)
-- Logs sao inseridos automaticamente pelo ERPClient, nao por usuarios
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'erp_api_logs' AND policyname = 'erp_api_logs_insert_policy'
  ) THEN
    CREATE POLICY erp_api_logs_insert_policy ON erp_api_logs
      FOR INSERT
      WITH CHECK (
        workspace_id IN (
          SELECT id FROM workspaces WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Nao permitimos UPDATE ou DELETE de logs (imutabilidade para auditoria)

-- ============================================================================
-- FUNCAO DE LIMPEZA AUTOMATICA (OPCIONAL)
-- ============================================================================
-- Remove logs antigos (mais de 90 dias) para evitar crescimento indefinido

CREATE OR REPLACE FUNCTION cleanup_old_erp_api_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM erp_api_logs
  WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_erp_api_logs(INTEGER) IS
  'Remove logs de API ERP mais antigos que X dias (default: 90)';
