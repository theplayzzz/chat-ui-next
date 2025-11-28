-- Migration: Fix health_plan_sessions trigger for last_updated_at
-- Description: The original trigger used update_updated_at_column() which updates 'updated_at',
--              but the table uses 'last_updated_at'. This creates a proper trigger function.
-- Reference: Task #10 bugfix

-- =============================================================================
-- DROP OLD TRIGGER (uses wrong function)
-- =============================================================================

DROP TRIGGER IF EXISTS update_health_plan_sessions_updated_at ON health_plan_sessions;

-- =============================================================================
-- CREATE PROPER TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION update_health_plan_sessions_last_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_health_plan_sessions_last_updated_at()
  IS 'Trigger function to auto-update last_updated_at on health_plan_sessions';

-- =============================================================================
-- CREATE NEW TRIGGER
-- =============================================================================

CREATE TRIGGER update_health_plan_sessions_last_updated_at_trigger
  BEFORE UPDATE ON health_plan_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_health_plan_sessions_last_updated_at();
