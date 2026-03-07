-- Migration: Auto-provision Health Plan Agent v2 for ALL workspaces
-- Description: Makes the Health Plan v2 assistant available to all accounts
--   1. Backfills existing workspaces (creates assistant + association)
--   2. Adds trigger to auto-provision for new workspaces

-- =============================================================================
-- 1. Trigger function: auto-create health plan assistant on workspace creation
-- =============================================================================
CREATE OR REPLACE FUNCTION auto_provision_health_plan_assistant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Reuse the existing function that creates the assistant per-user
    -- and associates it with the workspace
    PERFORM create_health_plan_v2_assistant(NEW.user_id, NEW.id);
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. Trigger: fire on new workspace creation
-- =============================================================================
DROP TRIGGER IF EXISTS auto_provision_health_plan_on_workspace_create ON workspaces;

CREATE TRIGGER auto_provision_health_plan_on_workspace_create
    AFTER INSERT ON workspaces
    FOR EACH ROW
    EXECUTE FUNCTION auto_provision_health_plan_assistant();

-- =============================================================================
-- 3. Backfill: provision for ALL existing workspaces that don't have it yet
-- =============================================================================
DO $$
DECLARE
    ws RECORD;
BEGIN
    FOR ws IN
        SELECT w.id, w.user_id
        FROM workspaces w
        WHERE NOT EXISTS (
            SELECT 1
            FROM assistant_workspaces aw
            JOIN assistants a ON a.id = aw.assistant_id
            WHERE aw.workspace_id = w.id
              AND a.name = 'Health Plan v2'
              AND a.user_id = w.user_id
        )
    LOOP
        PERFORM create_health_plan_v2_assistant(ws.user_id, ws.id);
    END LOOP;

    RAISE NOTICE 'Health Plan v2 assistant provisioned for all workspaces';
END;
$$;
