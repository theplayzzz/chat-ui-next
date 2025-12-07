/**
 * Health Plan Agent v2 - Monitoring Module
 *
 * Centraliza exports de funcionalidades de monitoramento e avaliação.
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6D
 */

// RAG Evaluation
export {
  // Main evaluation function
  evaluateRAG,
  // Individual evaluators
  relevanceEvaluator,
  groundednessEvaluator,
  retrievalQualityEvaluator,
  // LangSmith integration
  createLangSmithEvaluators,
  runLangSmithEvaluation,
  // Metrics
  formatMetrics,
  aggregateMetrics,
  // Types
  type RAGEvaluationInput,
  type RAGEvaluationResult,
  type EvaluatorOutput,
  type RAGTestCase
} from "./rag-evaluation"

// LangSmith Dashboards
export {
  RAG_QUALITY_DASHBOARD,
  RAG_PERFORMANCE_DASHBOARD,
  RAG_ALERTS,
  EVALUATION_METRICS,
  USEFUL_FILTERS,
  LANGSMITH_DASHBOARDS,
  LANGSMITH_ALERTS
} from "./langsmith-dashboards"
