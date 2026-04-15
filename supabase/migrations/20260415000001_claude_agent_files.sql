-- Reset existing RAG files/vectors and create simple claude_agent_files table.
-- Claude Code in Docker reads PDFs directly from /app/documents — no chunking/embeddings needed.

-- 1. Reset: wipe files, chunks, and all junction tables.
--    Trigger `delete_old_file` on files table removes storage objects automatically.
TRUNCATE file_items, assistant_files, collection_files,
         assistant_collections, file_workspaces CASCADE;
TRUNCATE files CASCADE;

-- 2. Simple metadata table for Claude Agent files
CREATE TABLE IF NOT EXISTS claude_agent_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL UNIQUE,
  size_bytes BIGINT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claude_agent_files_uploaded_at_idx
  ON claude_agent_files (uploaded_at DESC);

-- 3. RLS: global access for authenticated users (mirrors Docker's /app/documents global scope)
ALTER TABLE claude_agent_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select" ON claude_agent_files;
CREATE POLICY "authenticated_select" ON claude_agent_files
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert" ON claude_agent_files;
CREATE POLICY "authenticated_insert" ON claude_agent_files
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete" ON claude_agent_files;
CREATE POLICY "authenticated_delete" ON claude_agent_files
  FOR DELETE TO authenticated USING (true);
