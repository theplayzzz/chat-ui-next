-- Migration: create_erp_health_checks
-- Data: 2025-11-30
-- Task: 17.1 - Migrations SQL para interface administrativa ERP
-- PRD Reference: RF-006 (Integracao com API ERP), RNF-003 (Disponibilidade)

-- ============================================================================
-- TABELA DE HEALTH CHECKS DA API ERP
-- ============================================================================
-- Armazena resultados dos health checks periodicos da API ERP.
-- Usado para calcular uptime, latencia media, e status atual.

CREATE TABLE IF NOT EXISTS erp_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
  latency_ms INTEGER,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comentarios
COMMENT ON TABLE erp_health_checks IS
  'Resultados de health checks periodicos da API ERP por workspace';

COMMENT ON COLUMN erp_health_checks.workspace_id IS
  'Workspace da configuracao ERP sendo testada';

COMMENT ON COLUMN erp_health_checks.timestamp IS
  'Momento do health check';

COMMENT ON COLUMN erp_health_checks.status IS
  'Status do health check: healthy (OK), degraded (lento), down (falha)';

COMMENT ON COLUMN erp_health_checks.latency_ms IS
  'Latencia da resposta em milissegundos';

COMMENT ON COLUMN erp_health_checks.error_details IS
  'Detalhes do erro quando status != healthy';

-- ============================================================================
-- INDICES PARA PERFORMANCE
-- ============================================================================

-- Indice para filtrar por workspace
CREATE INDEX IF NOT EXISTS idx_erp_health_checks_workspace_id
  ON erp_health_checks(workspace_id);

-- Indice para ordenacao por timestamp (DESC para queries recentes)
CREATE INDEX IF NOT EXISTS idx_erp_health_checks_timestamp
  ON erp_health_checks(timestamp DESC);

-- Indice composto para queries comuns: workspace + timestamp
CREATE INDEX IF NOT EXISTS idx_erp_health_checks_workspace_timestamp
  ON erp_health_checks(workspace_id, timestamp DESC);

-- Indice para filtrar por status
CREATE INDEX IF NOT EXISTS idx_erp_health_checks_status
  ON erp_health_checks(status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE erp_health_checks ENABLE ROW LEVEL SECURITY;

-- Politica de SELECT: usuarios podem ver health checks do seu workspace
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'erp_health_checks' AND policyname = 'erp_health_checks_select_policy'
  ) THEN
    CREATE POLICY erp_health_checks_select_policy ON erp_health_checks
      FOR SELECT
      USING (
        workspace_id IN (
          SELECT id FROM workspaces WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Politica de INSERT: apenas via service role (cron job)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'erp_health_checks' AND policyname = 'erp_health_checks_insert_policy'
  ) THEN
    CREATE POLICY erp_health_checks_insert_policy ON erp_health_checks
      FOR INSERT
      WITH CHECK (
        workspace_id IN (
          SELECT id FROM workspaces WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Nao permitimos UPDATE ou DELETE (imutabilidade para auditoria)

-- ============================================================================
-- FUNCAO PARA CALCULAR STATUS ATUAL DO ERP
-- ============================================================================
-- Calcula o status baseado nos ultimos health checks dentro de uma janela

CREATE OR REPLACE FUNCTION calculate_erp_health_status(
  p_workspace_id UUID,
  p_window_hours INTEGER DEFAULT 1
)
RETURNS TEXT AS $$
DECLARE
  total_checks INTEGER;
  error_checks INTEGER;
  error_rate NUMERIC;
BEGIN
  -- Conta total de checks na janela
  SELECT COUNT(*) INTO total_checks
  FROM erp_health_checks
  WHERE workspace_id = p_workspace_id
    AND timestamp > NOW() - (p_window_hours || ' hours')::INTERVAL;

  -- Se nao ha checks, considera down
  IF total_checks = 0 THEN
    RETURN 'down';
  END IF;

  -- Conta checks com erro
  SELECT COUNT(*) INTO error_checks
  FROM erp_health_checks
  WHERE workspace_id = p_workspace_id
    AND timestamp > NOW() - (p_window_hours || ' hours')::INTERVAL
    AND status IN ('down', 'degraded');

  -- Calcula taxa de erro
  error_rate := error_checks::NUMERIC / total_checks::NUMERIC;

  -- Retorna status baseado na taxa de erro
  IF error_rate > 0.5 THEN
    RETURN 'down';      -- >50% erros
  ELSIF error_rate > 0.2 THEN
    RETURN 'degraded';  -- >20% erros
  ELSE
    RETURN 'healthy';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_erp_health_status(UUID, INTEGER) IS
  'Calcula status atual do ERP baseado nos health checks da ultima janela de tempo';

-- ============================================================================
-- FUNCAO PARA OBTER METRICAS DE HEALTH
-- ============================================================================
-- Retorna metricas agregadas para o dashboard

CREATE OR REPLACE FUNCTION get_erp_health_metrics(
  p_workspace_id UUID,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_checks BIGINT,
  healthy_count BIGINT,
  degraded_count BIGINT,
  down_count BIGINT,
  avg_latency_ms NUMERIC,
  min_latency_ms INTEGER,
  max_latency_ms INTEGER,
  current_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_checks,
    COUNT(*) FILTER (WHERE status = 'healthy')::BIGINT as healthy_count,
    COUNT(*) FILTER (WHERE status = 'degraded')::BIGINT as degraded_count,
    COUNT(*) FILTER (WHERE status = 'down')::BIGINT as down_count,
    ROUND(AVG(latency_ms)::NUMERIC, 2) as avg_latency_ms,
    MIN(latency_ms) as min_latency_ms,
    MAX(latency_ms) as max_latency_ms,
    calculate_erp_health_status(p_workspace_id, 1) as current_status
  FROM erp_health_checks
  WHERE workspace_id = p_workspace_id
    AND timestamp > NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_erp_health_metrics(UUID, INTEGER) IS
  'Retorna metricas agregadas de health checks para o dashboard';

-- ============================================================================
-- FUNCAO DE LIMPEZA AUTOMATICA
-- ============================================================================
-- Remove health checks antigos para evitar crescimento indefinido

CREATE OR REPLACE FUNCTION cleanup_old_erp_health_checks(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM erp_health_checks
  WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_erp_health_checks(INTEGER) IS
  'Remove health checks mais antigos que X dias (default: 30)';
