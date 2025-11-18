/**
 * Schemas Zod para validação de respostas GPT-4o
 * na análise de compatibilidade de planos de saúde
 */

import { z } from "zod"

/**
 * Schema para resposta de análise de elegibilidade
 */
export const EligibilityAnalysisResponseSchema = z.object({
  isEligible: z.boolean(),
  confidence: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  blockers: z.array(z.string()).nullable().optional(),
  warnings: z.array(z.string()).nullable().optional()
})

export type EligibilityAnalysisResponse = z.infer<
  typeof EligibilityAnalysisResponseSchema
>

/**
 * Schema para cobertura de uma condição específica
 */
export const ConditionCoverageSchema = z.object({
  condition: z.string(),
  isCovered: z.boolean(),
  coverageLevel: z.enum(["full", "partial", "excluded", "unclear"]),
  details: z.string(),
  relevantClauses: z.array(z.string()).nullable().optional(),
  waitingPeriod: z.number().nullable().optional()
})

/**
 * Schema para resposta de avaliação de coberturas
 */
export const CoverageEvaluationResponseSchema = z.object({
  overallAdequacy: z.number().min(0).max(100),
  conditionsCoverage: z.array(ConditionCoverageSchema),
  generalCoverageHighlights: z.array(z.string()),
  missingCriticalCoverages: z.array(z.string()).nullable().optional()
})

export type CoverageEvaluationResponse = z.infer<
  typeof CoverageEvaluationResponseSchema
>

/**
 * Schema para um alerta de exclusão/limitação
 */
export const ExclusionAlertSchema = z.object({
  type: z.enum([
    "carencia",
    "exclusao",
    "limitacao",
    "restricao_regional",
    "idade",
    "pre_existente"
  ]),
  severity: z.enum(["high", "medium", "low"]),
  title: z.string(),
  description: z.string(),
  affectedConditions: z.array(z.string()).nullable().optional(),
  impactScore: z.number().min(0).max(10)
})

/**
 * Schema para array de alertas
 */
export const ExclusionAlertsResponseSchema = z.array(ExclusionAlertSchema)

export type ExclusionAlertResponse = z.infer<typeof ExclusionAlertSchema>
export type ExclusionAlertsResponse = z.infer<
  typeof ExclusionAlertsResponseSchema
>
