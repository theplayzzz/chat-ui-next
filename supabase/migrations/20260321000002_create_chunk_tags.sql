-- ============================================================
-- Migration: RAG Level 3 - Create chunk_tags table + system tags
-- ============================================================

CREATE TABLE IF NOT EXISTS chunk_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  weight_boost NUMERIC(3,1) DEFAULT 1.0,
  parent_tag_id UUID REFERENCES chunk_tags(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#6b7280',
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (workspace_id, slug)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chunk_tags_workspace ON chunk_tags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chunk_tags_parent ON chunk_tags(parent_tag_id) WHERE parent_tag_id IS NOT NULL;

-- RLS
ALTER TABLE chunk_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chunk_tags in their workspaces"
  ON chunk_tags FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert chunk_tags in their workspaces"
  ON chunk_tags FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update non-system chunk_tags in their workspaces"
  ON chunk_tags FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete non-system chunk_tags in their workspaces"
  ON chunk_tags FOR DELETE
  USING (
    NOT is_system
    AND workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

-- Tags do sistema (inseridas para cada workspace existente)
INSERT INTO chunk_tags (workspace_id, name, slug, weight_boost, color, is_system)
  SELECT w.id, t.name, t.slug, t.weight_boost, t.color, TRUE
  FROM workspaces w
  CROSS JOIN (
    VALUES
      ('Preço',            'preco',            2.0, '#22c55e'),
      ('Cobertura',        'cobertura',        1.8, '#3b82f6'),
      ('Rede Credenciada', 'rede_credenciada', 1.6, '#8b5cf6'),
      ('Exclusão',         'exclusao',         1.5, '#ef4444'),
      ('Carência',         'carencia',         1.5, '#f97316'),
      ('Coparticipação',   'coparticipacao',   1.5, '#eab308'),
      ('Reembolso',        'reembolso',        1.4, '#14b8a6'),
      ('Documentação',     'documentacao',     1.2, '#6b7280'),
      ('Regras Gerais',    'regras_gerais',    1.0, '#94a3b8')
  ) AS t(name, slug, weight_boost, color)
  ON CONFLICT (workspace_id, slug) DO NOTHING;
