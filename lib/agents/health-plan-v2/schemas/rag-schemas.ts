/**
 * RAG Schemas - Schemas Zod para Agentic RAG
 *
 * Centraliza todos os schemas de validação para o sistema de RAG:
 * - QueryItem: Queries geradas para busca
 * - GradeResult: Resultado da avaliação de relevância
 * - SearchMetadata: Metadados da busca
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6B.3
 */

import { z } from "zod"

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Schema para item de query gerada
 */
export const QueryItemSchema = z.object({
  /** Query de busca (10-500 chars) */
  query: z
    .string()
    .min(10, "Query deve ter no mínimo 10 caracteres")
    .max(500, "Query deve ter no máximo 500 caracteres"),

  /** Foco da query */
  focus: z.enum(
    ["profile", "coverage", "price", "dependents", "conditions", "general"],
    {
      errorMap: () => ({
        message:
          "Foco deve ser: profile, coverage, price, dependents, conditions ou general"
      })
    }
  ),

  /** Prioridade (1 = mais alta, 5 = mais baixa) */
  priority: z
    .number()
    .min(1, "Prioridade mínima é 1")
    .max(5, "Prioridade máxima é 5")
})

export type QueryItem = z.infer<typeof QueryItemSchema>

// =============================================================================
// Grading Schemas
// =============================================================================

/**
 * Tipos de classificação de relevância
 */
export const GradeScoreEnum = z.enum(
  ["relevant", "partially_relevant", "irrelevant"],
  {
    errorMap: () => ({
      message: "Score deve ser: relevant, partially_relevant ou irrelevant"
    })
  }
)

export type GradeScore = z.infer<typeof GradeScoreEnum>

/**
 * Schema para resultado da avaliação de um documento
 */
export const GradeResultSchema = z.object({
  /** ID do documento avaliado */
  documentId: z.string().min(1, "ID do documento é obrigatório"),

  /** Classificação de relevância */
  score: GradeScoreEnum,

  /** Razão da classificação (10-300 chars) */
  reason: z
    .string()
    .min(10, "Razão deve ter no mínimo 10 caracteres")
    .max(300, "Razão deve ter no máximo 300 caracteres"),

  /** Informações que faltam no documento (opcional) */
  missingInfo: z.array(z.string()).optional(),

  /** Confiança na classificação (0-1, opcional) */
  confidence: z
    .number()
    .min(0, "Confiança mínima é 0")
    .max(1, "Confiança máxima é 1")
    .optional()
})

export type GradeResult = z.infer<typeof GradeResultSchema>

/**
 * Schema para resposta do LLM ao avaliar batch de documentos
 */
export const GradingResponseSchema = z.object({
  results: z.array(GradeResultSchema)
})

export type GradingResponse = z.infer<typeof GradingResponseSchema>

// =============================================================================
// Search Metadata Schemas
// =============================================================================

/**
 * Schema para metadados da busca
 */
export const SearchMetadataSchema = z.object({
  /** Número de queries geradas */
  queryCount: z.number().min(1, "Deve haver pelo menos 1 query"),

  /** Número de rewrites executados (0-2) */
  rewriteCount: z
    .number()
    .min(0, "Número de rewrites não pode ser negativo")
    .max(2, "Máximo de 2 rewrites permitidos"),

  /** Total de documentos avaliados */
  totalDocs: z.number().min(0, "Total de docs não pode ser negativo"),

  /** Documentos classificados como relevantes */
  relevantDocs: z.number().min(0, "Docs relevantes não pode ser negativo"),

  /** Flag indicando que limite de rewrites foi atingido */
  limitedResults: z.boolean(),

  /** Timestamp da busca */
  timestamp: z.string().datetime().optional()
})

export type SearchMetadata = z.infer<typeof SearchMetadataSchema>

// =============================================================================
// Rewrite Schemas
// =============================================================================

/**
 * Tipos de problemas identificados para rewrite
 */
export const RewriteProblemEnum = z.enum([
  "no_results", // Nenhum resultado encontrado
  "low_similarity", // Baixa similaridade nos resultados
  "too_specific", // Query muito específica
  "missing_context" // Falta contexto do cliente
])

export type RewriteProblem = z.infer<typeof RewriteProblemEnum>

/**
 * Schema para resultado do rewrite de query
 */
export const RewriteResultSchema = z.object({
  /** Query original */
  originalQuery: z.string(),

  /** Query reescrita */
  rewrittenQuery: z.string().min(10, "Query reescrita muito curta"),

  /** Problema identificado */
  problem: RewriteProblemEnum,

  /** Número da tentativa (1-2) */
  attemptCount: z.number().min(1).max(2),

  /** Flag se atingiu limite */
  limitedResults: z.boolean()
})

export type RewriteResult = z.infer<typeof RewriteResultSchema>

// =============================================================================
// Document Schemas (complementar ao result-fusion.ts)
// =============================================================================

/**
 * Schema para documento com resultado de grading
 */
export const GradedDocumentSchema = z.object({
  id: z.string(),
  content: z.string(),
  score: z.number().optional(),
  metadata: z
    .object({
      documentType: z.string().optional(),
      operator: z.string().optional(),
      planCode: z.string().optional(),
      tags: z.array(z.string()).optional(),
      fileId: z.string().optional(),
      fileName: z.string().optional()
    })
    .optional(),
  // Campos adicionados pelo grading
  gradeResult: GradeResultSchema.optional(),
  isRelevant: z.boolean().optional()
})

export type GradedDocument = z.infer<typeof GradedDocumentSchema>

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Valida um QueryItem e retorna resultado tipado
 */
export function validateQueryItem(data: unknown): {
  success: boolean
  data?: QueryItem
  errors?: string[]
} {
  const result = QueryItemSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`)
  }
}

/**
 * Valida um GradeResult e retorna resultado tipado
 */
export function validateGradeResult(data: unknown): {
  success: boolean
  data?: GradeResult
  errors?: string[]
} {
  const result = GradeResultSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`)
  }
}

/**
 * Valida SearchMetadata e retorna resultado tipado
 */
export function validateSearchMetadata(data: unknown): {
  success: boolean
  data?: SearchMetadata
  errors?: string[]
} {
  const result = SearchMetadataSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`)
  }
}

/**
 * Cria SearchMetadata com valores padrão
 */
export function createSearchMetadata(
  partial: Partial<SearchMetadata> = {}
): SearchMetadata {
  return {
    queryCount: partial.queryCount ?? 0,
    rewriteCount: partial.rewriteCount ?? 0,
    totalDocs: partial.totalDocs ?? 0,
    relevantDocs: partial.relevantDocs ?? 0,
    limitedResults: partial.limitedResults ?? false,
    timestamp: partial.timestamp ?? new Date().toISOString()
  }
}
