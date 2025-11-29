-- Migration: create_workspace_audit_config
-- Data: 2025-11-28
-- Task: 13.6 - Job de limpeza automatica e configuracao de retencao
-- PRD Reference: RF-012 (Sistema de auditoria e compliance LGPD)

-- ============================================================================
-- TABELA DE CONFIGURACAO DE AUDITORIA POR WORKSPACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_audit_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  retention_years INTEGER NOT NULL DEFAULT 1
    CHECK (retention_years >= 1 AND retention_years <= 10),
  auto_anonymize_after_days INTEGER NOT NULL DEFAULT 90
    CHECK (auto_anonymize_after_days >= 30 AND auto_anonymize_after_days <= 365),
  hard_delete_enabled BOOLEAN NOT NULL DEFAULT false,
  default_anonymization_level TEXT NOT NULL DEFAULT 'partial'
    CHECK (default_anonymization_level IN ('full', 'partial', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comentarios
COMMENT ON TABLE workspace_audit_config IS
  'Configuracao de auditoria e retencao LGPD por workspace';

COMMENT ON COLUMN workspace_audit_config.retention_years IS
  'Anos para reter dados antes de deletar (1-10, padrao: 1)';

COMMENT ON COLUMN workspace_audit_config.auto_anonymize_after_days IS
  'Dias apos criacao para upgrade de anonimizacao partial→full (30-365, padrao: 90)';

COMMENT ON COLUMN workspace_audit_config.hard_delete_enabled IS
  'Se true, deleta permanentemente; se false, usa soft delete (padrao: false)';

COMMENT ON COLUMN workspace_audit_config.default_anonymization_level IS
  'Nivel padrao de anonimizacao para novos registros (full, partial, none)';

-- ============================================================================
-- TABELA DE LOG DE DELECOES (AUDIT TRAIL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_deletions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deletion_type TEXT NOT NULL
    CHECK (deletion_type IN ('soft', 'hard', 'anonymization_upgrade')),
  original_status TEXT,
  original_anonymization_level TEXT,
  new_anonymization_level TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by TEXT NOT NULL DEFAULT 'system_cleanup'
);

-- Indices para audit_deletions_log
CREATE INDEX IF NOT EXISTS idx_audit_deletions_workspace
  ON audit_deletions_log(workspace_id);

CREATE INDEX IF NOT EXISTS idx_audit_deletions_deleted_at
  ON audit_deletions_log(deleted_at);

CREATE INDEX IF NOT EXISTS idx_audit_deletions_type
  ON audit_deletions_log(deletion_type);

-- Comentarios
COMMENT ON TABLE audit_deletions_log IS
  'Log de todas as operacoes de delecao/anonimizacao em client_recommendations';

COMMENT ON COLUMN audit_deletions_log.recommendation_id IS
  'ID do registro em client_recommendations (pode nao existir mais se hard delete)';

COMMENT ON COLUMN audit_deletions_log.deletion_type IS
  'Tipo de operacao: soft (status=deleted), hard (remove permanente), anonymization_upgrade (partial→full)';

COMMENT ON COLUMN audit_deletions_log.deleted_by IS
  'Quem realizou a operacao (system_cleanup, user_id, etc)';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Habilitar RLS
ALTER TABLE workspace_audit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_deletions_log ENABLE ROW LEVEL SECURITY;

-- Politicas para workspace_audit_config
-- Apenas workspace owners podem ver/editar
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workspace_audit_config' AND policyname = 'workspace_audit_config_select_policy'
  ) THEN
    CREATE POLICY workspace_audit_config_select_policy ON workspace_audit_config
      FOR SELECT
      USING (
        is_global_admin(auth.uid()) OR
        is_workspace_owner(auth.uid(), workspace_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workspace_audit_config' AND policyname = 'workspace_audit_config_insert_policy'
  ) THEN
    CREATE POLICY workspace_audit_config_insert_policy ON workspace_audit_config
      FOR INSERT
      WITH CHECK (
        is_global_admin(auth.uid()) OR
        is_workspace_owner(auth.uid(), workspace_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workspace_audit_config' AND policyname = 'workspace_audit_config_update_policy'
  ) THEN
    CREATE POLICY workspace_audit_config_update_policy ON workspace_audit_config
      FOR UPDATE
      USING (
        is_global_admin(auth.uid()) OR
        is_workspace_owner(auth.uid(), workspace_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workspace_audit_config' AND policyname = 'workspace_audit_config_delete_policy'
  ) THEN
    CREATE POLICY workspace_audit_config_delete_policy ON workspace_audit_config
      FOR DELETE
      USING (
        is_global_admin(auth.uid()) OR
        is_workspace_owner(auth.uid(), workspace_id)
      );
  END IF;
END $$;

-- Politicas para audit_deletions_log
-- Apenas leitura para workspace owners e admins
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_deletions_log' AND policyname = 'audit_deletions_log_select_policy'
  ) THEN
    CREATE POLICY audit_deletions_log_select_policy ON audit_deletions_log
      FOR SELECT
      USING (
        is_global_admin(auth.uid()) OR
        is_workspace_owner(auth.uid(), workspace_id)
      );
  END IF;
END $$;

-- Insert apenas via service role (system_cleanup)
-- Nao criamos politica de INSERT para usuarios normais

-- ============================================================================
-- TRIGGER PARA UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_workspace_audit_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workspace_audit_config_updated_at_trigger
  ON workspace_audit_config;

CREATE TRIGGER workspace_audit_config_updated_at_trigger
  BEFORE UPDATE ON workspace_audit_config
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_audit_config_updated_at();

-- ============================================================================
-- FUNCAO DE CLEANUP (para Edge Function)
-- ============================================================================

/**
 * Funcao que realiza limpeza de registros expirados
 * Chamada pela Edge Function diariamente
 *
 * Operacoes:
 * 1. Hard delete para workspaces com hard_delete_enabled=true
 * 2. Soft delete (status='deleted') para outros
 * 3. Anonimizacao progressiva (partial→full) apos X dias
 * 4. Log de todas as operacoes
 */
CREATE OR REPLACE FUNCTION cleanup_audit_records()
RETURNS TABLE (
  hard_deleted INTEGER,
  soft_deleted INTEGER,
  anonymization_upgraded INTEGER
) AS $$
DECLARE
  v_hard_deleted INTEGER := 0;
  v_soft_deleted INTEGER := 0;
  v_anonymization_upgraded INTEGER := 0;
  v_record RECORD;
  v_config RECORD;
BEGIN
  -- 1. Hard delete para workspaces com hard_delete_enabled
  FOR v_record IN
    SELECT cr.id, cr.workspace_id, cr.status, cr.anonymization_level
    FROM client_recommendations cr
    JOIN workspace_audit_config wac ON cr.workspace_id = wac.workspace_id
    WHERE wac.hard_delete_enabled = true
      AND cr.retention_until < NOW()
      AND cr.status != 'deleted'
  LOOP
    -- Log antes de deletar
    INSERT INTO audit_deletions_log (
      recommendation_id,
      workspace_id,
      deletion_type,
      original_status,
      original_anonymization_level,
      deleted_by
    ) VALUES (
      v_record.id,
      v_record.workspace_id,
      'hard',
      v_record.status,
      v_record.anonymization_level,
      'system_cleanup'
    );

    -- Hard delete
    DELETE FROM client_recommendations WHERE id = v_record.id;
    v_hard_deleted := v_hard_deleted + 1;
  END LOOP;

  -- 2. Soft delete para workspaces sem hard_delete
  FOR v_record IN
    SELECT cr.id, cr.workspace_id, cr.status, cr.anonymization_level
    FROM client_recommendations cr
    LEFT JOIN workspace_audit_config wac ON cr.workspace_id = wac.workspace_id
    WHERE (wac.hard_delete_enabled = false OR wac.hard_delete_enabled IS NULL)
      AND cr.retention_until < NOW()
      AND cr.status != 'deleted'
  LOOP
    -- Log
    INSERT INTO audit_deletions_log (
      recommendation_id,
      workspace_id,
      deletion_type,
      original_status,
      original_anonymization_level,
      deleted_by
    ) VALUES (
      v_record.id,
      v_record.workspace_id,
      'soft',
      v_record.status,
      v_record.anonymization_level,
      'system_cleanup'
    );

    -- Soft delete
    UPDATE client_recommendations
    SET status = 'deleted', updated_at = NOW()
    WHERE id = v_record.id;
    v_soft_deleted := v_soft_deleted + 1;
  END LOOP;

  -- 3. Anonimizacao progressiva (partial → full) apos auto_anonymize_after_days
  FOR v_record IN
    SELECT cr.id, cr.workspace_id, cr.client_info, cr.anonymization_level,
           COALESCE(wac.auto_anonymize_after_days, 90) as days_threshold
    FROM client_recommendations cr
    LEFT JOIN workspace_audit_config wac ON cr.workspace_id = wac.workspace_id
    WHERE cr.anonymization_level = 'partial'
      AND cr.created_at < NOW() - (COALESCE(wac.auto_anonymize_after_days, 90) || ' days')::INTERVAL
      AND cr.status != 'deleted'
  LOOP
    -- Log
    INSERT INTO audit_deletions_log (
      recommendation_id,
      workspace_id,
      deletion_type,
      original_anonymization_level,
      new_anonymization_level,
      deleted_by
    ) VALUES (
      v_record.id,
      v_record.workspace_id,
      'anonymization_upgrade',
      'partial',
      'full',
      'system_cleanup'
    );

    -- Upgrade anonimizacao
    UPDATE client_recommendations
    SET
      client_info = upgrade_anonymization(client_info),
      anonymization_level = 'full',
      updated_at = NOW()
    WHERE id = v_record.id;
    v_anonymization_upgraded := v_anonymization_upgraded + 1;
  END LOOP;

  RETURN QUERY SELECT v_hard_deleted, v_soft_deleted, v_anonymization_upgraded;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentario
COMMENT ON FUNCTION cleanup_audit_records() IS
  'Executa limpeza diaria de registros de auditoria: hard/soft delete de expirados e upgrade de anonimizacao';
