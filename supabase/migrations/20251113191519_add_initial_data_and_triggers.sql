-- Dados iniciais e triggers para sistema de recomendações
-- Migration: add_initial_data_and_triggers
-- Data: 2025-11-13

-- Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para recommendation_systems
CREATE TRIGGER update_recommendation_systems_updated_at
  BEFORE UPDATE ON recommendation_systems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para client_recommendations
CREATE TRIGGER update_client_recommendations_updated_at
  BEFORE UPDATE ON client_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir sistema inicial: health_plan_agent
INSERT INTO recommendation_systems (system_name, description, config_schema)
VALUES (
  'health_plan_agent',
  'Sistema de recomendação de planos de saúde baseado em perfil do cliente',
  '{"required_fields": ["age", "location", "coverage_type"], "optional_fields": ["income", "family_size", "medical_history", "preferred_providers"]}'::jsonb
) ON CONFLICT (system_name) DO NOTHING;

-- Comentários
COMMENT ON FUNCTION update_updated_at_column() IS 'Função trigger para atualizar automaticamente a coluna updated_at';
