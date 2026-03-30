/**
 * Capacidade: endConversation
 *
 * Finaliza a conversa quando o usuário pede.
 * Gera farewell personalizado via GPT-5-mini e salva audit LGPD.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-011
 *
 * Fase 9: Implementação completa com GPT-5-mini + audit LGPD
 */

import { AIMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import type { HealthPlanState } from "../../state/state-annotation"
import { saveConversationAuditV2 } from "../../audit/save-conversation-audit"

// =============================================================================
// SCHEMAS
// =============================================================================

const EndConversationSchema = z.object({
  farewell: z
    .string()
    .describe(
      "Mensagem de despedida personalizada com resumo do que foi discutido"
    ),
  conversationSummary: z
    .string()
    .describe("Resumo breve do que foi abordado na conversa"),
  hasRecommendation: z
    .boolean()
    .describe("Se uma recomendação foi gerada durante a conversa")
})

// =============================================================================
// PROMPTS
// =============================================================================

const END_CONVERSATION_SYSTEM_PROMPT = `Você é Bia, uma consultora simpática de planos de saúde.
Gere uma mensagem de despedida personalizada e calorosa.

## Regras
1. Resuma brevemente o que foi discutido/alcançado na conversa
2. Se uma recomendação foi feita, lembre os próximos passos
3. Se não houve recomendação, convide o usuário a retornar quando quiser
4. Tom caloroso e genuíno - como se fosse uma amiga profissional
5. NÃO invente dados que não estão no contexto
6. Mantenha em português brasileiro informal-profissional
7. Mensagem com 2-4 parágrafos no máximo`

// =============================================================================
// HELPERS
// =============================================================================

function buildConversationSummary(state: HealthPlanState): string {
  const parts: string[] = []
  const clientInfo = state.clientInfo || {}

  // Dados coletados
  const dataParts: string[] = []
  if (clientInfo.age !== undefined) dataParts.push(`idade ${clientInfo.age}`)
  if (clientInfo.city) dataParts.push(`cidade ${clientInfo.city}`)
  if (clientInfo.budget !== undefined)
    dataParts.push(`orçamento R$${clientInfo.budget}`)
  if (clientInfo.dependents && clientInfo.dependents.length > 0)
    dataParts.push(`${clientInfo.dependents.length} dependente(s)`)

  if (dataParts.length > 0) {
    parts.push(`Dados coletados: ${dataParts.join(", ")}`)
  }

  // Planos encontrados
  if (state.searchResults && state.searchResults.length > 0) {
    parts.push(`Planos encontrados: ${state.searchResults.length}`)
  }

  // Análise feita
  if (state.compatibilityAnalysis) {
    const topPlan = state.compatibilityAnalysis.analyses[0]
    if (topPlan) {
      parts.push(`Melhor plano: ${topPlan.planId} (score ${topPlan.score}/100)`)
    }
  }

  // Recomendação gerada
  if (state.recommendation) {
    parts.push(
      `Recomendação gerada: sim (plano ${state.recommendation.topPlanId})`
    )
  }

  // Mensagens trocadas
  const msgCount = Array.isArray(state.messages) ? state.messages.length : 0
  parts.push(`Mensagens na conversa: ${msgCount}`)

  return parts.join("\n")
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Finaliza a conversa com farewell personalizado e audit LGPD.
 *
 * Proteção acidental: se messages.length <= 2 sem recommendation, pede confirmação.
 *
 * LangSmith: span `end_conversation` com tags ["end-conversation", "health-plan-v2"]
 */
export async function endConversation(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const messageCount = Array.isArray(state.messages) ? state.messages.length : 0

  console.log(
    `[endConversation] Finalizing conversation (${messageCount} messages)`
  )

  // Proteção contra finalização acidental
  if (messageCount <= 2 && !state.recommendation) {
    const confirmResponse =
      "Parece que acabamos de começar! Tem certeza que deseja encerrar? " +
      "Posso ajudar com informações sobre planos de saúde, buscar opções " +
      "para o seu perfil e muito mais."

    return {
      currentResponse: confirmResponse,
      messages: [new AIMessage(confirmResponse)]
    }
  }

  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-5.1-mini",
      temperature: 1,
      timeout: 30000,
      maxRetries: 2,
      maxCompletionTokens: 4096,
      tags: ["end-conversation", "health-plan-v2"],
      modelKwargs: {
        reasoning_effort: "low"
      }
    })

    const structuredLLM = llm.withStructuredOutput(EndConversationSchema, {
      name: "end_conversation"
    })

    const conversationSummary = buildConversationSummary(state)

    const result = await structuredLLM.invoke([
      { role: "system", content: END_CONVERSATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: `## Resumo da Conversa\n${conversationSummary}\n\nGere uma mensagem de despedida personalizada.`
      }
    ])

    const response = result.farewell

    console.log(
      `[endConversation] Farewell generated, hasRecommendation: ${result.hasRecommendation}`
    )

    // Salvar audit (non-blocking)
    saveConversationAuditV2({
      state,
      farewellMessage: response
    }).catch(err => {
      console.error("[endConversation] Audit save failed (non-blocking):", err)
    })

    return {
      isConversationActive: false,
      currentResponse: response,
      messages: [new AIMessage(response)]
    }
  } catch (error) {
    console.error("[endConversation] LLM failed, using fallback:", error)

    const fallbackResponse =
      "Foi um prazer ajudar você! Se precisar de mais informações sobre " +
      "planos de saúde no futuro, estarei por aqui. Tenha um ótimo dia!"

    // Ainda salvar audit no fallback (non-blocking)
    saveConversationAuditV2({
      state,
      farewellMessage: fallbackResponse
    }).catch(err => {
      console.error("[endConversation] Audit save failed (non-blocking):", err)
    })

    return {
      isConversationActive: false,
      currentResponse: fallbackResponse,
      messages: [new AIMessage(fallbackResponse)]
    }
  }
}
