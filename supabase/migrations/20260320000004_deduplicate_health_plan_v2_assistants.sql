-- Migration: Deduplicate Health Plan v2 assistants
-- Data: 2026-03-20
-- Problema: Múltiplos "Health Plan v2" foram criados por auto-provisioning
--           e aparecem duplicados na UI devido a RLS policy aberta
-- Solução: Manter apenas o mais antigo (original) e remover duplicados

-- ============================================================================
-- STEP 1: Remover assistentes duplicados "Health Plan v2"
-- Mantém o mais antigo (menor created_at) de cada workspace
-- ============================================================================

DO $$
DECLARE
  deleted_count INTEGER := 0;
  dup_record RECORD;
BEGIN
  -- Para cada workspace, encontrar duplicatas de Health Plan v2
  FOR dup_record IN (
    SELECT a.id, a.name, a.user_id, a.created_at
    FROM assistants a
    WHERE LOWER(a.name) LIKE '%health plan v2%'
      AND a.id NOT IN (
        -- Subquery: pegar o ID do mais antigo por user_id
        SELECT DISTINCT ON (sub.user_id) sub.id
        FROM assistants sub
        WHERE LOWER(sub.name) LIKE '%health plan v2%'
        ORDER BY sub.user_id, sub.created_at ASC
      )
  )
  LOOP
    -- Remover dos assistant_workspaces primeiro (FK)
    DELETE FROM assistant_workspaces WHERE assistant_id = dup_record.id;
    -- Remover o assistente duplicado
    DELETE FROM assistants WHERE id = dup_record.id;
    deleted_count := deleted_count + 1;

    RAISE NOTICE 'Removed duplicate Health Plan v2: id=%, name=%, user=%, created=%',
      dup_record.id, dup_record.name, dup_record.user_id, dup_record.created_at;
  END LOOP;

  RAISE NOTICE 'Total duplicates removed: %', deleted_count;
END $$;

-- ============================================================================
-- STEP 2: Garantir que o auto-provisioning não crie duplicatas no futuro
-- Atualizar a função create_health_plan_v2_assistant para ser idempotente
-- ============================================================================

CREATE OR REPLACE FUNCTION create_health_plan_v2_assistant(
  p_user_id UUID,
  p_workspace_id UUID
) RETURNS UUID AS $$
DECLARE
  v_assistant_id UUID;
  v_existing_id UUID;
BEGIN
  -- Verificar se já existe um Health Plan v2 para este usuário
  SELECT id INTO v_existing_id
  FROM assistants
  WHERE user_id = p_user_id
    AND LOWER(name) LIKE '%health plan v2%'
  LIMIT 1;

  -- Se já existe, retornar o existente (idempotente)
  IF v_existing_id IS NOT NULL THEN
    -- Garantir que está vinculado ao workspace
    INSERT INTO assistant_workspaces (user_id, assistant_id, workspace_id)
    VALUES (p_user_id, v_existing_id, p_workspace_id)
    ON CONFLICT DO NOTHING;

    RETURN v_existing_id;
  END IF;

  -- Criar novo assistente
  INSERT INTO assistants (
    user_id,
    name,
    description,
    model,
    prompt,
    temperature,
    context_length,
    include_profile_context,
    include_workspace_instructions
  ) VALUES (
    p_user_id,
    'Health Plan v2',
    'Assistente conversacional com LangGraph para recomendação de planos de saúde. Permite iteração contínua, alteração de dados e múltiplas recomendações.',
    'gpt-5-mini',
    'Você é um assistente especializado em planos de saúde no Brasil.',
    1.0,
    272000,
    TRUE,
    TRUE
  )
  RETURNING id INTO v_assistant_id;

  -- Vincular ao workspace
  INSERT INTO assistant_workspaces (user_id, assistant_id, workspace_id)
  VALUES (p_user_id, v_assistant_id, p_workspace_id)
  ON CONFLICT DO NOTHING;

  RETURN v_assistant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
