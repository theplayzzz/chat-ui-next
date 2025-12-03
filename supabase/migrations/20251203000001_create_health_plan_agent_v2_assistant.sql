-- Migration: Create Health Plan Agent v2 Assistant
-- Description: Creates the Health Plan v2 assistant for conversational health plan recommendations
-- PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
-- Task: #19 Fase 1

-- Note: This migration creates a function to create the assistant
-- The assistant will be created per-user/per-workspace as needed
-- Run the function manually or via the application to create the assistant

-- Function to create Health Plan v2 assistant for a specific user
CREATE OR REPLACE FUNCTION create_health_plan_v2_assistant(
    p_user_id UUID,
    p_workspace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assistant_id UUID;
    v_existing_id UUID;
BEGIN
    -- Check if assistant already exists for this user
    SELECT id INTO v_existing_id
    FROM assistants
    WHERE user_id = p_user_id
      AND name = 'Health Plan v2'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- If workspace_id provided, ensure association exists
        IF p_workspace_id IS NOT NULL THEN
            INSERT INTO assistant_workspaces (user_id, assistant_id, workspace_id)
            VALUES (p_user_id, v_existing_id, p_workspace_id)
            ON CONFLICT (assistant_id, workspace_id) DO NOTHING;
        END IF;
        RETURN v_existing_id;
    END IF;

    -- Create new assistant
    INSERT INTO assistants (
        user_id,
        name,
        description,
        model,
        context_length,
        temperature,
        embeddings_provider,
        include_profile_context,
        include_workspace_instructions,
        sharing,
        prompt,
        image_path
    ) VALUES (
        p_user_id,
        'Health Plan v2',
        'Assistente conversacional com LangGraph para recomendação de planos de saúde. Permite iteração contínua, alteração de dados e múltiplas recomendações.',
        'gpt-4o',
        128000,
        0.1,
        'openai',
        true,
        true,
        'private',
        'Você é um assistente especializado em planos de saúde. Ajude o usuário a encontrar o melhor plano baseado em suas necessidades, orçamento e preferências. Seja conversacional, empático e informe que o usuário pode adicionar ou alterar informações a qualquer momento.',
        ''
    )
    RETURNING id INTO v_assistant_id;

    -- Associate with workspace if provided
    IF p_workspace_id IS NOT NULL THEN
        INSERT INTO assistant_workspaces (user_id, assistant_id, workspace_id)
        VALUES (p_user_id, v_assistant_id, p_workspace_id);
    END IF;

    RETURN v_assistant_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_health_plan_v2_assistant(UUID, UUID) TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION create_health_plan_v2_assistant IS
'Creates or retrieves the Health Plan v2 assistant for a user.
Use this function to ensure the assistant exists before using the v2 endpoint.
Parameters:
  p_user_id: The user ID who will own the assistant
  p_workspace_id: Optional workspace to associate the assistant with
Returns: The assistant UUID';

-- Also create a simpler version that uses the current authenticated user
CREATE OR REPLACE FUNCTION create_my_health_plan_v2_assistant(
    p_workspace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT create_health_plan_v2_assistant(auth.uid(), p_workspace_id);
$$;

GRANT EXECUTE ON FUNCTION create_my_health_plan_v2_assistant(UUID) TO authenticated;

COMMENT ON FUNCTION create_my_health_plan_v2_assistant IS
'Creates or retrieves the Health Plan v2 assistant for the current authenticated user.
Call this from the client to ensure the assistant exists.';
