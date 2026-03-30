-- ============================================================
-- Migration: RAG Level 4 - Pipeline Logs
-- Date: 2026-03-30
-- Purpose: Observability table for the RAG ingest and retrieval
--          pipeline. Each stage (analyze, chunk, embed, retrieve,
--          grade) writes a row keyed by correlation_id so the
--          full pipeline execution can be reconstructed.
-- ============================================================

-- ============================================================================
-- TABLE DEFINITION
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag_pipeline_logs (
  -- Identification
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  workspace_id UUID,
  user_id UUID,
  correlation_id UUID NOT NULL,

  -- Pipeline execution
  stage TEXT NOT NULL,            -- e.g. 'analyze', 'chunk', 'embed', 'retrieve', 'grade'
  status TEXT NOT NULL,           -- e.g. 'started', 'success', 'failed', 'skipped'

  -- Payloads
  input_metadata JSONB,
  output_metadata JSONB,
  error_details JSONB,

  -- Metrics
  duration_ms INTEGER,
  chunks_processed INTEGER,
  chunks_created INTEGER,
  model_used TEXT,
  tokens_used INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Reconstruct a full pipeline run
CREATE INDEX idx_rag_logs_correlation ON rag_pipeline_logs(correlation_id);

-- Lookup logs for a specific file
CREATE INDEX idx_rag_logs_file ON rag_pipeline_logs(file_id) WHERE file_id IS NOT NULL;

-- Dashboard: workspace activity over time
CREATE INDEX idx_rag_logs_workspace_date ON rag_pipeline_logs(workspace_id, created_at DESC);

-- Monitoring: find failed stages quickly
CREATE INDEX idx_rag_logs_failed ON rag_pipeline_logs(stage) WHERE status = 'failed';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE rag_pipeline_logs ENABLE ROW LEVEL SECURITY;

-- Policy: service role can insert (system-side logging)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rag_pipeline_logs'
    AND policyname = 'rag_pipeline_logs_service_insert'
  ) THEN
    CREATE POLICY rag_pipeline_logs_service_insert
      ON rag_pipeline_logs
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Policy: service role can read (admin / debug)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rag_pipeline_logs'
    AND policyname = 'rag_pipeline_logs_service_select'
  ) THEN
    CREATE POLICY rag_pipeline_logs_service_select
      ON rag_pipeline_logs
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Policy: allow updates (e.g. completing a "started" row)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rag_pipeline_logs'
    AND policyname = 'rag_pipeline_logs_service_update'
  ) THEN
    CREATE POLICY rag_pipeline_logs_service_update
      ON rag_pipeline_logs
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_rag_pipeline_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rag_pipeline_logs
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE 'Deleted % old RAG pipeline logs (older than % days)', deleted_count, days_to_keep;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
