-- Migration: Shared Health Plan v2 assistant
-- Data: 2026-03-20
-- Objetivo: Um único assistente Health Plan v2 compartilhado por todos os usuários
--           Cada usuário vê o mesmo assistente via assistant_workspaces
--           Apenas o histórico de chat é separado por conta

-- ============================================================================
-- STEP 1: Atualizar auto-provisioning para usar assistente compartilhado
-- Em vez de criar um novo assistente por usuário, vincula o existente
-- ============================================================================

DROP FUNCTION IF EXISTS create_health_plan_v2_assistant(UUID, UUID);

CREATE OR REPLACE FUNCTION create_health_plan_v2_assistant(
  p_user_id UUID,
  p_workspace_id UUID
) RETURNS UUID AS $$
DECLARE
  v_shared_assistant_id UUID;
BEGIN
  -- Buscar o assistente Health Plan v2 compartilhado (o mais antigo)
  SELECT id INTO v_shared_assistant_id
  FROM assistants
  WHERE LOWER(name) LIKE '%health plan v2%'
  ORDER BY created_at ASC
  LIMIT 1;

  -- Se não existe nenhum, criar um novo (primeira vez)
  IF v_shared_assistant_id IS NULL THEN
    INSERT INTO assistants (
      user_id, name, description, model, prompt,
      temperature, context_length,
      include_profile_context, include_workspace_instructions
    ) VALUES (
      p_user_id,
      'Health Plan v2',
      'Assistente conversacional com LangGraph para recomendação de planos de saúde. Permite iteração contínua, alteração de dados e múltiplas recomendações.',
      'gpt-5-mini',
      'Você é um assistente especializado em planos de saúde no Brasil.',
      1.0, 272000, TRUE, TRUE
    )
    RETURNING id INTO v_shared_assistant_id;
  END IF;

  -- Vincular ao workspace do usuário (idempotente)
  INSERT INTO assistant_workspaces (user_id, assistant_id, workspace_id)
  VALUES (p_user_id, v_shared_assistant_id, p_workspace_id)
  ON CONFLICT DO NOTHING;

  RETURN v_shared_assistant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
