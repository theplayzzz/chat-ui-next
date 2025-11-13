-- Criação de índices otimizados para sistema de recomendações
-- Migration: add_recommendation_indexes
-- Data: 2025-11-13

-- Índices para client_recommendations para otimizar queries frequentes
CREATE INDEX idx_client_recommendations_workspace ON client_recommendations(workspace_id);
CREATE INDEX idx_client_recommendations_user ON client_recommendations(user_id);
CREATE INDEX idx_client_recommendations_system ON client_recommendations(recommendation_system_id);
CREATE INDEX idx_client_recommendations_status ON client_recommendations(status);
CREATE INDEX idx_client_recommendations_confidence ON client_recommendations(confidence_score DESC);

-- Índice composto para query típica: buscar recomendações ativas por workspace ordenadas por confiança
CREATE INDEX idx_client_recommendations_workspace_status_confidence 
  ON client_recommendations(workspace_id, status, confidence_score DESC);

-- Comentários
COMMENT ON INDEX idx_client_recommendations_workspace IS 'Otimiza queries filtrando por workspace';
COMMENT ON INDEX idx_client_recommendations_user IS 'Otimiza queries filtrando por usuário';
COMMENT ON INDEX idx_client_recommendations_system IS 'Otimiza queries filtrando por sistema de recomendação';
COMMENT ON INDEX idx_client_recommendations_status IS 'Otimiza queries filtrando por status (active/archived/superseded)';
COMMENT ON INDEX idx_client_recommendations_confidence IS 'Otimiza ordenação por score de confiança (DESC)';
COMMENT ON INDEX idx_client_recommendations_workspace_status_confidence IS 'Índice composto para query típica: workspace + status + ordenação por confiança';
