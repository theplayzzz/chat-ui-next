-- Migration: Add chat_id to health_plan_sessions
-- Purpose: Link sessions to specific chats to prevent memory leakage between conversations
-- Reference: Session isolation fix for health-plan-agent
-- Date: 2025-12-02

-- ============================================================================
-- 1. ADD CHAT_ID COLUMN
-- ============================================================================

-- Add chat_id column with foreign key to chats table
-- ON DELETE CASCADE ensures session is deleted when chat is deleted
ALTER TABLE health_plan_sessions
ADD COLUMN chat_id UUID REFERENCES chats(id) ON DELETE CASCADE;

-- Add comment explaining the column purpose
COMMENT ON COLUMN health_plan_sessions.chat_id IS
'Links session to specific chat. Ensures session isolation between different conversations. NULL for legacy sessions.';

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for chat-based lookups (partial index for non-null chat_id)
CREATE INDEX idx_health_plan_sessions_chat
ON health_plan_sessions(chat_id)
WHERE chat_id IS NOT NULL;

-- Drop existing active sessions index and recreate with chat_id
DROP INDEX IF EXISTS idx_health_plan_sessions_active;

-- New composite index for session lookups by workspace/user/chat
-- Queries will still filter by expires_at and completed_at at runtime
-- Note: Partial index with NOW() not possible (NOW is not IMMUTABLE)
CREATE INDEX idx_health_plan_sessions_active
ON health_plan_sessions(workspace_id, user_id, chat_id, completed_at, expires_at);

-- ============================================================================
-- 3. LOGGING
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 20251202000001: Added chat_id to health_plan_sessions';
  RAISE NOTICE 'Existing sessions without chat_id will expire naturally (1h TTL)';
END $$;
