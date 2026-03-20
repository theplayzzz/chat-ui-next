-- Migration: agent_workflow_logs
-- Data: 2026-03-20
-- Objetivo: Tabela de logs de workflow do agente v2 para debugging e análise
-- Armazena todas as execuções de workflow com detalhes de cada step, rotas,
-- tempos de execução e erros, recebidos via LangSmith tracing.

-- ============================================================================
-- TABLE DEFINITION
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_workflow_logs (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  chat_id TEXT NOT NULL,
  assistant_id TEXT NOT NULL,

  -- LangSmith
  langsmith_run_id TEXT,
  langsmith_trace_url TEXT,

  -- Workflow execution
  intent TEXT,
  intent_confidence NUMERIC(4,3),
  routed_capability TEXT,
  was_redirected BOOLEAN DEFAULT FALSE,
  redirect_reason TEXT,

  -- State snapshot
  client_info JSONB DEFAULT '{}'::jsonb,
  client_info_version INTEGER DEFAULT 0,
  search_results_count INTEGER DEFAULT 0,
  has_compatibility_analysis BOOLEAN DEFAULT FALSE,
  has_recommendation BOOLEAN DEFAULT FALSE,
  loop_iterations INTEGER DEFAULT 0,

  -- Execution details
  execution_time_ms INTEGER,
  checkpointer_enabled BOOLEAN DEFAULT FALSE,
  errors JSONB DEFAULT '[]'::jsonb,

  -- Node execution trace (array of { node, duration_ms, input_summary, output_summary })
  node_trace JSONB DEFAULT '[]'::jsonb,

  -- Raw response (truncated for storage)
  response_preview TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Busca por workspace + data (dashboard principal)
CREATE INDEX IF NOT EXISTS idx_agent_workflow_logs_workspace_created
  ON agent_workflow_logs(workspace_id, created_at DESC);

-- Busca por chat_id (debug de conversa específica)
CREATE INDEX IF NOT EXISTS idx_agent_workflow_logs_chat_id
  ON agent_workflow_logs(chat_id);

-- Busca por intent (análise de distribuição)
CREATE INDEX IF NOT EXISTS idx_agent_workflow_logs_intent
  ON agent_workflow_logs(intent);

-- Busca por erros (monitoramento)
CREATE INDEX IF NOT EXISTS idx_agent_workflow_logs_errors
  ON agent_workflow_logs(errors)
  WHERE errors != '[]'::jsonb;

-- Busca por LangSmith run_id (correlação)
CREATE INDEX IF NOT EXISTS idx_agent_workflow_logs_langsmith_run_id
  ON agent_workflow_logs(langsmith_run_id)
  WHERE langsmith_run_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE agent_workflow_logs ENABLE ROW LEVEL SECURITY;

-- Policy: service role pode inserir (sistema)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_workflow_logs'
    AND policyname = 'agent_workflow_logs_service_insert'
  ) THEN
    CREATE POLICY agent_workflow_logs_service_insert
      ON agent_workflow_logs
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Policy: service role pode ler (admin/debug)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_workflow_logs'
    AND policyname = 'agent_workflow_logs_service_select'
  ) THEN
    CREATE POLICY agent_workflow_logs_service_select
      ON agent_workflow_logs
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_agent_workflow_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM agent_workflow_logs
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE 'Deleted % old agent workflow logs (older than % days)', deleted_count, days_to_keep;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
