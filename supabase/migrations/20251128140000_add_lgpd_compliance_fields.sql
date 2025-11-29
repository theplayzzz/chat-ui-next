-- Migration: add_lgpd_compliance_fields
-- Data: 2025-11-28
-- Task: 13.1 - Estender tabela client_recommendations para compliance LGPD
-- PRD Reference: RF-012 (Sistema de auditoria e compliance)

-- ============================================================================
-- CAMPOS LGPD PARA CLIENT_RECOMMENDATIONS
-- ============================================================================

-- Adicionar campos para compliance LGPD
ALTER TABLE client_recommendations
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 year'),
  ADD COLUMN IF NOT EXISTS anonymization_level TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS consent_given BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_subject_rights_metadata JSONB DEFAULT '{}'::JSONB;

-- Constraint para validar níveis de anonimização (drop se existir antes de criar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_anonymization_level'
  ) THEN
    ALTER TABLE client_recommendations
      ADD CONSTRAINT valid_anonymization_level
      CHECK (anonymization_level IN ('full', 'partial', 'none'));
  END IF;
END $$;

-- Constraint para validar metadata de direitos do titular
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_data_subject_rights_metadata'
  ) THEN
    ALTER TABLE client_recommendations
      ADD CONSTRAINT valid_data_subject_rights_metadata
      CHECK (jsonb_typeof(data_subject_rights_metadata) = 'object');
  END IF;
END $$;

-- ============================================================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON COLUMN client_recommendations.retention_until IS
  'Data até quando o registro deve ser retido (padrão: 1 ano). Após esta data, o registro pode ser deletado automaticamente pelo job de cleanup.';

COMMENT ON COLUMN client_recommendations.anonymization_level IS
  'Nível de anonimização aplicado aos dados: full (dados pessoais removidos), partial (CPF hasheado, apenas primeiro nome), none (dados originais).';

COMMENT ON COLUMN client_recommendations.consent_given IS
  'Indica se o titular dos dados deu consentimento para processamento conforme LGPD Art. 7º.';

COMMENT ON COLUMN client_recommendations.consent_timestamp IS
  'Timestamp de quando o consentimento foi registrado.';

COMMENT ON COLUMN client_recommendations.data_subject_rights_metadata IS
  'Metadados sobre exercício de direitos LGPD (portabilidade, exclusão, correção, etc.). Formato: { "right_type": "portability|deletion|correction", "requested_at": "timestamp", "fulfilled_at": "timestamp" }';

-- ============================================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================================

-- Índice para queries de cleanup por data de retenção
CREATE INDEX IF NOT EXISTS idx_client_recommendations_retention
  ON client_recommendations (retention_until)
  WHERE status != 'archived';

-- Índice para queries por nível de anonimização (usado no job de anonimização progressiva)
CREATE INDEX IF NOT EXISTS idx_client_recommendations_anonymization
  ON client_recommendations (anonymization_level, created_at)
  WHERE anonymization_level = 'partial';

-- Índice para filtros de auditoria por período
CREATE INDEX IF NOT EXISTS idx_client_recommendations_audit_period
  ON client_recommendations (workspace_id, created_at DESC);

-- ============================================================================
-- ATUALIZAR REGISTROS EXISTENTES
-- ============================================================================

-- Definir retention_until para registros existentes que não têm valor
UPDATE client_recommendations
SET retention_until = created_at + INTERVAL '1 year'
WHERE retention_until IS NULL;

-- Definir anonymization_level para registros existentes
UPDATE client_recommendations
SET anonymization_level = 'none'
WHERE anonymization_level IS NULL;

-- ============================================================================
-- FUNÇÃO HELPER PARA WORKSPACE OWNER (is_global_admin já existe)
-- ============================================================================

-- Função helper para verificar se usuário é owner do workspace
CREATE OR REPLACE FUNCTION is_workspace_owner(check_user_id UUID, ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspaces
    WHERE id = ws_id AND user_id = check_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- POLÍTICAS RLS ADICIONAIS (para admins verem histórico de auditoria)
-- ============================================================================

-- Política para admins globais verem todas as recomendações (para auditoria)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Global admins can view all recommendations for audit'
    AND tablename = 'client_recommendations'
  ) THEN
    CREATE POLICY "Global admins can view all recommendations for audit"
      ON client_recommendations FOR SELECT
      TO authenticated
      USING (is_global_admin(auth.uid()));
  END IF;
END $$;

-- Política para workspace owners verem recomendações do workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Workspace owners can view workspace recommendations'
    AND tablename = 'client_recommendations'
  ) THEN
    CREATE POLICY "Workspace owners can view workspace recommendations"
      ON client_recommendations FOR SELECT
      TO authenticated
      USING (is_workspace_owner(auth.uid(), workspace_id));
  END IF;
END $$;
