/**
 * RAG Nodes - Agentic RAG para Health Plan Agent v2
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

// Multi-Query Generation (Fase 6A.4)
export {
  generateQueries,
  extractQueryStrings,
  GeneratedQueriesSchema,
  type GeneratedQueries,
  type QueryFocus,
  type ClientInfoForQueries
} from "./generate-queries"

// Reciprocal Rank Fusion (Fase 6A.5)
export {
  reciprocalRankFusion,
  fusionSimple,
  calculateFusionStats,
  filterByDocumentType,
  groupByOperator,
  SearchDocumentSchema,
  QueryResultSchema,
  type SearchDocument,
  type QueryResult,
  type FusedDocument,
  type RRFOptions,
  type FusionStats
} from "./result-fusion"
