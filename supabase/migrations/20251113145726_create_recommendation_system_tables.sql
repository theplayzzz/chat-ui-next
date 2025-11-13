-- Criação das tabelas do sistema de recomendações multi-nicho
-- Migration: create_recommendation_system_tables
-- Data: 2025-11-13

-- Tabela de Sistemas de Recomendação (definição de diferentes nichos)
CREATE TABLE recommendation_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  config_schema JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_config_schema CHECK (jsonb_typeof(config_schema) = 'object')
);

-- Tabela de Recomendações para Clientes
CREATE TABLE client_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_system_id UUID NOT NULL REFERENCES recommendation_systems(id),
  client_info JSONB NOT NULL,
  analyzed_data JSONB,
  recommended_item JSONB,
  reasoning TEXT NOT NULL,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  langsmith_run_id TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  -- Constraints para validação JSONB
  CONSTRAINT valid_client_info CHECK (jsonb_typeof(client_info) = 'object'),
  CONSTRAINT valid_analyzed_data CHECK (jsonb_typeof(analyzed_data) = 'object' OR analyzed_data IS NULL),
  CONSTRAINT valid_recommended_item CHECK (jsonb_typeof(recommended_item) = 'object' OR recommended_item IS NULL)
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE recommendation_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_recommendations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas
CREATE POLICY "Allow authenticated users to read active systems"
  ON recommendation_systems FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can view their own recommendations"
  ON client_recommendations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recommendations"
  ON client_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recommendations"
  ON client_recommendations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
