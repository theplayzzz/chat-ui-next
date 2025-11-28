-- Migration: Create health_plan_sessions table
-- Description: Stores workflow session state for health plan recommendation agent
-- Reference: Task #10 - RF-008

-- =============================================================================
-- TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS health_plan_sessions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Workflow state
  current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step >= 1 AND current_step <= 5),

  -- Step data (JSONB for flexibility)
  client_info JSONB,
  search_results JSONB,
  compatibility_analysis JSONB,
  erp_prices JSONB,
  recommendation JSONB,

  -- Error tracking
  errors JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Workspace lookup
CREATE INDEX idx_health_plan_sessions_workspace
  ON health_plan_sessions(workspace_id);

-- User lookup
CREATE INDEX idx_health_plan_sessions_user
  ON health_plan_sessions(user_id);

-- Expiration cleanup
CREATE INDEX idx_health_plan_sessions_expires
  ON health_plan_sessions(expires_at);

-- Active sessions (partial index for performance)
CREATE INDEX idx_health_plan_sessions_active
  ON health_plan_sessions(workspace_id, user_id)
  WHERE completed_at IS NULL AND expires_at > NOW();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE health_plan_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view own health plan sessions"
  ON health_plan_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can create their own sessions
CREATE POLICY "Users can create own health plan sessions"
  ON health_plan_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
CREATE POLICY "Users can update own health plan sessions"
  ON health_plan_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their expired sessions
CREATE POLICY "Users can delete expired health plan sessions"
  ON health_plan_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND expires_at < NOW());

-- =============================================================================
-- TRIGGER: Auto-update last_updated_at
-- =============================================================================

CREATE TRIGGER update_health_plan_sessions_updated_at
  BEFORE UPDATE ON health_plan_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE health_plan_sessions IS 'Stores workflow session state for health plan recommendation agent with 1-hour TTL';
COMMENT ON COLUMN health_plan_sessions.current_step IS 'Workflow step: 1=extractClientInfo, 2=searchHealthPlans, 3=analyzeCompatibility, 4=fetchERPPrices, 5=generateRecommendation';
COMMENT ON COLUMN health_plan_sessions.expires_at IS 'Session TTL - automatically set to 1 hour from creation';
