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

// Document Grading (Fase 6B.1)
export {
  gradeDocuments,
  filterRelevantDocuments,
  countByScore,
  type GradeDocumentsOptions,
  type GradeDocumentsResult
} from "./grade-documents"

// Query Rewriting (Fase 6B.2)
export {
  rewriteQuery,
  detectProblem,
  shouldRewrite,
  createRewriteContext,
  MAX_REWRITE_ATTEMPTS,
  MIN_RELEVANT_DOCS,
  type RewriteQueryOptions,
  type RewriteContext
} from "./rewrite-query"

// Hierarchical Retrieval (Fase 6C.1)
export {
  retrieveHierarchical,
  retrieveHierarchicalWithQuery,
  extractOperatorsFromDocs,
  combineWithWeights,
  createDebugHeaders,
  type HierarchicalRetrieveOptions,
  type HierarchicalRetrieveResult,
  type HierarchicalDocument,
  type HierarchicalMetadata
} from "./retrieve-hierarchical"
