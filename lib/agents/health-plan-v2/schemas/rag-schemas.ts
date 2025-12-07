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
