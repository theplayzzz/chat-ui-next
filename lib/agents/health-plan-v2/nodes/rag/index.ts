/**
 * RAG Nodes - Sistema RAG Simplificado para Health Plan Agent v2
 *
 * Módulos:
 * - retrieve-simple: Busca vetorial única com contexto enriquecido
 * - grade-documents: Avaliação de relevância com LLM
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

// Busca Vetorial Simplificada
export {
  retrieveSimple,
  enrichedChunksToGradableDocuments,
  formatEnrichedContext,
  formatChunksForGrading,
  type EnrichedChunk,
  type ClientInfo,
  type RetrieveSimpleOptions,
  type RetrieveSimpleResult
} from "./retrieve-simple"

// Document Grading
export {
  gradeDocuments,
  convertFusedToEnriched,
  type GradeDocumentsOptions,
  type GradeDocumentsResult,
  type GradedChunk,
  // Tipos legados para compatibilidade
  type FusedDocument,
  type ClientInfoForQueries
} from "./grade-documents"
