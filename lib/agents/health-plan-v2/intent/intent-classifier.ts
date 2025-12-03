/**
 * Intent Classifier - Classificador de intenções via GPT-4o
 *
 * Responsável por:
 * - Classificar a intenção do usuário
 * - Extrair dados relevantes da mensagem
 * - Retornar confiança e alternativas quando ambíguo
 *
 * Integra com LangSmith para tracing automático.
 */

import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import type { BaseMessage } from "@langchain/core/messages"

import type { UserIntent } from "../types"
import type { HealthPlanState } from "../state/state-annotation"
import {
  type IntentClassificationInput,
  type IntentClassificationOutput,
  type ExtractedClientData,
  type AlternativeIntent,
  MIN_CONFIDENCE_THRESHOLD,
  VALID_INTENTS
} from "./intent-classification-types"
import {
  buildClassificationPrompt,
  extractConversationContext
} from "./prompts/intent-classification-prompt"

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/**
 * Schema Zod para validar output do GPT-4o
 */
const DependentSchema = z.object({
  age: z.number().optional(),
  relationship: z.enum(["spouse", "child", "parent", "other"]).optional()
})

const ScenarioChangeSchema = z.object({
  type: z
    .enum([
      "add_dependent",
      "remove_dependent",
      "change_budget",
      "change_location",
      "other"
    ])
    .optional(),
  details: z.record(z.unknown()).optional()
})

const ExtractedDataSchema = z.object({
  name: z.string().optional(),
  age: z.number().min(0).max(120).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  budget: z.number().positive().optional(),
  dependents: z.array(DependentSchema).optional(),
  dependentCount: z.number().optional(),
  preferences: z.array(z.string()).optional(),
  healthConditions: z.array(z.string()).optional(),
  currentPlan: z.string().optional(),
  employer: z.string().optional(),
  scenarioChange: ScenarioChangeSchema.optional(),
  planName: z.string().optional(),
  questionTopic: z.string().optional()
})

const AlternativeIntentSchema = z.object({
  intent: z.enum(VALID_INTENTS as [string, ...string[]]),
  confidence: z.number().min(0).max(1)
})

const IntentClassificationResponseSchema = z.object({
  intent: z.enum(VALID_INTENTS as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  extractedData: ExtractedDataSchema.optional(),
  reasoning: z.string(),
  alternativeIntents: z.array(AlternativeIntentSchema).optional()
})

// ============================================================================
// CLASSIFIER IMPLEMENTATION
// ============================================================================

/**
 * Classifica a intenção do usuário usando GPT-4o
 *
 * O tracing para LangSmith é feito automaticamente pelo LangChain
 * quando LANGCHAIN_TRACING_V2=true está configurado.
 *
 * @param input - Mensagem, histórico e estado atual
 * @returns Classificação com intent, confidence, dados extraídos e reasoning
 */
export async function classifyIntent(
  input: IntentClassificationInput
): Promise<IntentClassificationOutput> {
  const startTime = Date.now()

  try {
    // Extrair contexto da conversa
    const conversationContext = extractContextFromMessages(
      input.conversationHistory
    )

    // Adicionar contexto do estado atual (clientInfo já coletado)
    const stateContext = buildStateContext(input.currentState)

    // Construir prompt completo
    const fullContext = [conversationContext, stateContext]
      .filter(Boolean)
      .join("\n\n")

    const prompt = buildClassificationPrompt(input.message, fullContext)

    // Inicializar ChatOpenAI com tags para LangSmith
    const model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.1, // Baixa temperatura para consistência
      timeout: 5000, // 5s timeout
      maxRetries: 2,
      // Tags para identificar no LangSmith
      tags: ["intent-classifier", "health-plan-v2"]
    })

    // Invocar modelo com runName para LangSmith
    const response = await model.invoke([{ role: "system", content: prompt }], {
      runName: "intent-classifier"
    })

    // Extrair conteúdo da resposta
    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content)

    // Parse JSON da resposta
    const parsed = parseJsonResponse(content)

    // Validar com Zod
    const validated = IntentClassificationResponseSchema.safeParse(parsed)

    if (!validated.success) {
      console.warn(
        "[intent-classifier] Validation failed:",
        validated.error.errors
      )
      return createFallbackResponse(
        input.message,
        "Erro de validação do output",
        Date.now() - startTime
      )
    }

    const result = validated.data

    // Aplicar threshold de confiança
    const finalIntent =
      result.confidence < MIN_CONFIDENCE_THRESHOLD
        ? "conversar"
        : (result.intent as UserIntent)

    const latencyMs = Date.now() - startTime

    // Log para debug
    console.log("[intent-classifier] Classification result:", {
      message: input.message.substring(0, 50),
      intent: finalIntent,
      confidence: result.confidence,
      extractedDataKeys: Object.keys(result.extractedData || {}),
      latencyMs
    })

    return {
      intent: finalIntent,
      confidence:
        result.confidence < MIN_CONFIDENCE_THRESHOLD
          ? result.confidence
          : result.confidence,
      extractedData: result.extractedData as ExtractedClientData | undefined,
      reasoning: result.reasoning,
      alternativeIntents: result.alternativeIntents as
        | AlternativeIntent[]
        | undefined,
      latencyMs
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime
    console.error("[intent-classifier] Error:", error)

    return createFallbackResponse(
      input.message,
      error instanceof Error ? error.message : "Erro desconhecido",
      latencyMs
    )
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extrai contexto de mensagens do LangChain
 */
function extractContextFromMessages(messages: BaseMessage[]): string {
  if (!messages || messages.length === 0) {
    return ""
  }

  // Pegar últimas 5 mensagens
  const recentMessages = messages.slice(-5)

  const formatted = recentMessages
    .map(msg => {
      const role = msg._getType() === "human" ? "Usuário" : "Assistente"
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content)
      return `${role}: ${content}`
    })
    .join("\n")

  return `Histórico recente:\n${formatted}`
}

/**
 * Constrói contexto a partir do estado atual
 */
function buildStateContext(state: Partial<HealthPlanState>): string {
  const parts: string[] = []

  if (state.clientInfo && Object.keys(state.clientInfo).length > 0) {
    parts.push(
      `Dados já coletados do cliente: ${JSON.stringify(state.clientInfo)}`
    )
  }

  if (state.searchResults && state.searchResults.length > 0) {
    parts.push(`Planos já encontrados: ${state.searchResults.length} planos`)
  }

  if (state.compatibilityAnalysis) {
    parts.push("Análise de compatibilidade já realizada")
  }

  if (state.recommendation) {
    parts.push("Recomendação já gerada")
  }

  return parts.length > 0 ? `Estado atual:\n${parts.join("\n")}` : ""
}

/**
 * Parse JSON da resposta do modelo
 */
function parseJsonResponse(content: string): unknown {
  // Tentar extrair JSON de markdown code block
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()

  try {
    return JSON.parse(jsonStr)
  } catch {
    // Tentar encontrar objeto JSON na string
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return JSON.parse(objectMatch[0])
    }
    throw new Error(`Failed to parse JSON: ${jsonStr.substring(0, 100)}`)
  }
}

/**
 * Cria resposta de fallback em caso de erro
 */
function createFallbackResponse(
  message: string,
  errorReason: string,
  latencyMs: number
): IntentClassificationOutput {
  return {
    intent: "conversar",
    confidence: 0.3,
    reasoning: `Fallback para 'conversar' devido a: ${errorReason}`,
    latencyMs
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  IntentClassificationResponseSchema,
  ExtractedDataSchema,
  extractContextFromMessages,
  buildStateContext
}
