/**
 * RAG Schemas - Schemas Zod para RAG Simplificado
 *
 * Schemas de validação para o sistema de RAG:
 * - GradeResult: Resultado da avaliação de relevância
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

import { z } from "zod"

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
// Legacy Types (para compatibilidade com rag-evaluation.ts)
// =============================================================================

/**
 * @deprecated Use FileGradingResult de grade-documents.ts
 * Mantido para compatibilidade com rag-evaluation.ts
 */
export interface GradedDocument {
  id: string
  content: string
  score: GradeScore
  reason: string
  /** Flag indicando se o documento é relevante */
  isRelevant?: boolean
  /** Resultado detalhado do grading */
  gradeResult?: {
    score: GradeScore
    reason: string
    missingInfo?: string[]
    confidence?: number
  }
  metadata?: {
    operator?: string
    planName?: string
    [key: string]: unknown
  }
}

/**
 * @deprecated Use SearchMetadata de search-plans-graph.ts
 * Mantido para compatibilidade com rag-evaluation.ts
 */
export interface SearchMetadata {
  query?: string
  totalFiles?: number
  filesWithResults?: number
  totalChunks?: number
  ragModel?: string
  executionTimeMs?: number
  /** Legacy: número de documentos relevantes */
  relevantDocs?: number
  /** Legacy: número de rewrites da query */
  rewriteCount?: number
  /** Legacy: flag indicando se resultados foram limitados */
  limitedResults?: boolean
  gradingStats?: {
    highRelevance: number
    mediumRelevance: number
    lowRelevance: number
    irrelevant: number
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

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
