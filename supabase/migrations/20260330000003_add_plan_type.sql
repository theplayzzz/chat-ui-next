-- ============================================================
-- Migration: RAG Level 4 - Add plan_type to file_items
-- Date: 2026-03-30
-- Purpose: Allow tagging each chunk with its health plan type
--          (e.g. 'enfermaria', 'apartamento', 'odontologico')
--          for scoped retrieval filtering.
-- ============================================================

ALTER TABLE file_items ADD COLUMN IF NOT EXISTS plan_type TEXT;

CREATE INDEX IF NOT EXISTS idx_file_items_plan_type ON file_items(plan_type) WHERE plan_type IS NOT NULL;
