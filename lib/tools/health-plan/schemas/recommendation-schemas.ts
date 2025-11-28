/**
 * Schemas Zod para Geração de Recomendação
 *
 * Validação de inputs e outputs das funções de recomendação
 *
 * Referência: PRD health-plan-agent-prd.md (RF-007)
 * Task Master: Task #9.2
 */

import { z } from "zod"

// =============================================================================
// SCHEMAS - Recomendação Principal
// =============================================================================

/**
 * Schema para resposta de recomendação principal do GPT-4o
 */
export const MainRecommendationResponseSchema = z.object({
  planName: z.string().describe("Nome do plano recomendado"),
  operadora: z.string().optional().describe("Nome da operadora"),
  justification: z
    .string()
    .min(50)
    .max(500)
    .describe("Justificativa humanizada e empática para a recomendação"),
  keyBenefits: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe("Lista de benefícios principais para o perfil do cliente"),
  personalizedNote: z
    .string()
    .max(200)
    .describe("Nota personalizada para o cliente baseada no perfil"),
  technicalTermsExplained: z
    .array(
      z.object({
        term: z.string(),
        explanation: z.string()
      })
    )
    .optional()
    .describe("Termos técnicos que precisam de explicação")
})

export type MainRecommendationResponse = z.infer<
  typeof MainRecommendationResponseSchema
>

// =============================================================================
// SCHEMAS - Alternativas
// =============================================================================

/**
 * Schema para alternativa econômica
 */
export const BudgetAlternativeSchema = z.object({
  planName: z.string(),
  reasonForBudget: z.string().describe("Por que é mais econômico"),
  tradeoffs: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("O que você abre mão em relação ao recomendado"),
  bestFor: z.string().describe("Perfil ideal para esta opção"),
  comparisonSummary: z.string().max(150)
})

/**
 * Schema para alternativa premium
 */
export const PremiumAlternativeSchema = z.object({
  planName: z.string(),
  reasonForPremium: z.string().describe("Por que é mais completo"),
  extraBenefits: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("Benefícios extras em relação ao recomendado"),
  bestFor: z.string().describe("Perfil ideal para esta opção"),
  comparisonSummary: z.string().max(150)
})

/**
 * Schema para resposta de alternativas do GPT-4o
 */
export const AlternativesResponseSchema = z.object({
  hasBudgetAlternative: z.boolean(),
  budget: BudgetAlternativeSchema.optional(),
  hasPremiumAlternative: z.boolean(),
  premium: PremiumAlternativeSchema.optional(),
  noAlternativesReason: z
    .string()
    .optional()
    .describe("Razão se não houver alternativas")
})

export type AlternativesResponse = z.infer<typeof AlternativesResponseSchema>

// =============================================================================
// SCHEMAS - Alertas Formatados
// =============================================================================

/**
 * Schema para alerta formatado para o cliente
 */
export const FormattedAlertSchema = z.object({
  title: z.string().max(60),
  description: z.string().max(200),
  impact: z.string().max(100).describe("Impacto no perfil do cliente"),
  urgency: z.enum(["critico", "importante", "informativo"])
})

/**
 * Schema para resposta de alertas do GPT-4o
 */
export const AlertsFormattedResponseSchema = z.object({
  hasCriticalAlerts: z.boolean(),
  alerts: z.array(FormattedAlertSchema),
  summary: z.string().max(200).optional().describe("Resumo geral dos alertas")
})

export type AlertsFormattedResponse = z.infer<
  typeof AlertsFormattedResponseSchema
>

// =============================================================================
// SCHEMAS - Próximos Passos
// =============================================================================

/**
 * Schema para item de próximo passo
 */
export const NextStepItemSchema = z.object({
  step: z.number().min(1).max(10),
  action: z.string().max(50),
  description: z.string().max(150),
  timeline: z.string().max(30).optional()
})

/**
 * Schema para resposta de próximos passos do GPT-4o
 */
export const NextStepsResponseSchema = z.object({
  steps: z.array(NextStepItemSchema).min(3).max(6),
  requiredDocuments: z.array(z.string()).min(2).max(8),
  estimatedTimeline: z.string().max(100),
  additionalNotes: z.string().max(200).optional()
})

export type NextStepsResponse = z.infer<typeof NextStepsResponseSchema>

// =============================================================================
// SCHEMAS - Introdução Empática
// =============================================================================

/**
 * Schema para introdução empática do GPT-4o
 */
export const IntroResponseSchema = z.object({
  greeting: z.string().max(100).describe("Saudação personalizada"),
  clientSummary: z.string().max(200).describe("Resumo do perfil do cliente"),
  analysisHighlight: z
    .string()
    .max(150)
    .describe("Destaque da análise realizada")
})

export type IntroResponse = z.infer<typeof IntroResponseSchema>

// =============================================================================
// SCHEMAS - Parâmetros de Entrada
// =============================================================================

/**
 * Schema para parâmetros de geração de recomendação
 */
export const GenerateRecommendationParamsSchema = z.object({
  rankedAnalysis: z.object({
    clientProfile: z.object({
      age: z.number(),
      dependents: z
        .array(
          z.object({
            relationship: z.string(),
            age: z.number()
          })
        )
        .optional(),
      preExistingConditions: z.array(z.string()).optional(),
      medications: z.array(z.string()).optional(),
      city: z.string(),
      state: z.string(),
      budget: z.number(),
      preferences: z
        .object({
          networkType: z.enum(["broad", "restricted"]).optional(),
          coParticipation: z.boolean().optional(),
          specificHospitals: z.array(z.string()).optional()
        })
        .optional()
    }),
    rankedPlans: z.array(
      z.object({
        planId: z.string(),
        planName: z.string(),
        operadora: z.string().optional(),
        score: z.object({
          overall: z.number(),
          breakdown: z.object({
            eligibility: z.number(),
            coverage: z.number(),
            budget: z.number(),
            network: z.number(),
            preferences: z.number()
          })
        }),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        reasoning: z.string()
      })
    ),
    recommended: z.object({
      main: z.any(),
      alternatives: z.array(z.any())
    }),
    badges: z.record(z.array(z.string())),
    criticalAlerts: z.object({
      all: z.array(z.any()),
      byUrgency: z.object({
        critico: z.array(z.any()),
        importante: z.array(z.any()),
        informativo: z.array(z.any())
      }),
      byPlan: z.record(z.array(z.any()))
    }),
    budget: z.any().nullable(),
    premium: z.any().nullable()
  }),
  erpPrices: z
    .object({
      success: z.boolean(),
      prices: z
        .array(
          z.object({
            titular: z.number(),
            dependentes: z.array(
              z.object({
                relacao: z.string(),
                idade: z.number(),
                preco: z.number()
              })
            ),
            subtotal: z.number(),
            descontos: z.number(),
            total: z.number()
          })
        )
        .optional()
    })
    .optional(),
  options: z
    .object({
      includeAlternatives: z.boolean().optional().default(true),
      includeAlerts: z.boolean().optional().default(true),
      includeNextSteps: z.boolean().optional().default(true),
      explainTechnicalTerms: z.boolean().optional().default(true),
      language: z.enum(["pt-BR", "en-US"]).optional().default("pt-BR")
    })
    .optional()
})

export type GenerateRecommendationParams = z.infer<
  typeof GenerateRecommendationParamsSchema
>

// =============================================================================
// SCHEMAS - Resultado Final
// =============================================================================

/**
 * Schema para alerta estruturado na UI
 */
export const StructuredAlertSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
  impact: z.string()
})

/**
 * Schema para seção de alertas estruturados
 */
export const StructuredAlertsSchema = z.object({
  hasCriticalAlerts: z.boolean(),
  critical: z.array(StructuredAlertSchema),
  important: z.array(StructuredAlertSchema),
  informative: z.array(StructuredAlertSchema),
  summary: z.string().optional()
})

export type StructuredAlert = z.infer<typeof StructuredAlertSchema>
export type StructuredAlerts = z.infer<typeof StructuredAlertsSchema>

/**
 * Schema para resultado da geração de recomendação
 */
export const GenerateRecommendationResultSchema = z.object({
  success: z.boolean(),
  markdown: z.string().describe("Recomendação completa em Markdown"),
  sections: z.object({
    intro: z.string(),
    mainRecommendation: z.string(),
    alternatives: z.string(),
    comparisonTable: z.string(),
    alerts: z.string(),
    nextSteps: z.string()
  }),
  structuredAlerts: StructuredAlertsSchema.optional().describe(
    "Alertas estruturados para renderização com componentes visuais"
  ),
  metadata: z.object({
    generatedAt: z.string(),
    version: z.string(),
    modelUsed: z.string(),
    tokensUsed: z.number().optional(),
    executionTimeMs: z.number()
  }),
  error: z.string().optional()
})

export type GenerateRecommendationResult = z.infer<
  typeof GenerateRecommendationResultSchema
>
