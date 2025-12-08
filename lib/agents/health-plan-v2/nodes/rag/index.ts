/**
 * RAG Nodes - Sistema RAG por Arquivo para Health Plan Agent v2
 *
 * Módulos:
 * - retrieve-simple: Busca vetorial top K por arquivo com contexto enriquecido
 * - grade-documents: Avaliação de arquivos como unidade com contexto de conversa
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

// Busca Vetorial por Arquivo
export {
  retrieveSimple,
  formatEnrichedContext,
  concatenateFileChunks,
  getAllChunks,
  filterEmptyFiles,
  type EnrichedChunk,
  type ClientInfo,
  type RetrieveSimpleOptions,
  type RetrieveSimpleResult,
  type RetrieveByFileResult
} from "./retrieve-simple"

// Grading por Arquivo como Unidade
export {
  gradeByFile,
  type FileGradingResult,
  type FileRelevance,
  type GradeByFileResult,
  type GradeByFileOptions
} from "./grade-documents"
