-- Migration: Create LangGraph Checkpoint Tables
-- Description: Creates the schema and tables required for LangGraph state persistence
-- PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
-- Task: #19 Fase 1 - Subtask 8
--
-- These tables are used by @langchain/langgraph-checkpoint-postgres
-- to persist the state of LangGraph workflows between requests.
--
-- The PostgresSaver.setup() method will also create these tables,
-- but having them in a migration ensures they exist before deployment
-- and allows for proper version control.

-- Create the langgraph schema
CREATE SCHEMA IF NOT EXISTS langgraph;

-- Grant usage on schema to authenticated users
GRANT USAGE ON SCHEMA langgraph TO authenticated;
GRANT USAGE ON SCHEMA langgraph TO service_role;

-- Checkpoints table: stores the state at each checkpoint
-- Based on @langchain/langgraph-checkpoint-postgres schema
CREATE TABLE IF NOT EXISTS langgraph.checkpoints (
    -- Primary identification
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,

    -- Checkpoint type (determines how data is stored)
    type TEXT,

    -- The actual checkpoint data (serialized state)
    checkpoint JSONB NOT NULL,

    -- Metadata about the checkpoint
    metadata JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Primary key is composite of thread, namespace, and checkpoint
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- Checkpoint blobs table: stores large binary data separately
CREATE TABLE IF NOT EXISTS langgraph.checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    version TEXT NOT NULL,
    type TEXT NOT NULL,
    blob BYTEA,

    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

-- Checkpoint writes table: stores pending writes before they're committed
CREATE TABLE IF NOT EXISTS langgraph.checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    type TEXT,
    blob BYTEA NOT NULL,

    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- Create indexes for performance

-- Index for fetching checkpoints by thread
CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id
    ON langgraph.checkpoints(thread_id);

-- Index for fetching checkpoints by thread and namespace
CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_ns
    ON langgraph.checkpoints(thread_id, checkpoint_ns);

-- Index for parent checkpoint lookups (for history traversal)
CREATE INDEX IF NOT EXISTS idx_checkpoints_parent
    ON langgraph.checkpoints(thread_id, checkpoint_ns, parent_checkpoint_id)
    WHERE parent_checkpoint_id IS NOT NULL;

-- Index for writes by thread
CREATE INDEX IF NOT EXISTS idx_checkpoint_writes_thread
    ON langgraph.checkpoint_writes(thread_id);

-- Index for blobs by thread
CREATE INDEX IF NOT EXISTS idx_checkpoint_blobs_thread
    ON langgraph.checkpoint_blobs(thread_id);

-- Grant permissions on tables
GRANT ALL ON langgraph.checkpoints TO service_role;
GRANT ALL ON langgraph.checkpoint_blobs TO service_role;
GRANT ALL ON langgraph.checkpoint_writes TO service_role;

-- Authenticated users need insert/update/select for their own threads
-- (RLS policies will be added if needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON langgraph.checkpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON langgraph.checkpoint_blobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON langgraph.checkpoint_writes TO authenticated;

-- Add comments for documentation
COMMENT ON SCHEMA langgraph IS
'Schema for LangGraph checkpoint persistence. Used by the Health Plan Agent v2.';

COMMENT ON TABLE langgraph.checkpoints IS
'Stores checkpoints (saved states) of LangGraph workflows. Each checkpoint represents the state at a particular point in the conversation.';

COMMENT ON TABLE langgraph.checkpoint_blobs IS
'Stores large binary data associated with checkpoints, stored separately for efficiency.';

COMMENT ON TABLE langgraph.checkpoint_writes IS
'Stores pending writes that have not yet been committed to a checkpoint. Used for crash recovery.';

COMMENT ON COLUMN langgraph.checkpoints.thread_id IS
'Unique identifier for the conversation thread (typically chatId)';

COMMENT ON COLUMN langgraph.checkpoints.checkpoint_ns IS
'Namespace for the checkpoint, allows multiple checkpoints per thread';

COMMENT ON COLUMN langgraph.checkpoints.checkpoint_id IS
'Unique identifier for this specific checkpoint';

COMMENT ON COLUMN langgraph.checkpoints.checkpoint IS
'JSONB containing the serialized state of the LangGraph at this checkpoint';

COMMENT ON COLUMN langgraph.checkpoints.metadata IS
'Additional metadata about the checkpoint (timing, version, etc.)';
