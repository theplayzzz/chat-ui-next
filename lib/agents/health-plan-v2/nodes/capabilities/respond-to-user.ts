/**
 * Capacidade: respondToUser
 *
 * Responde conversas gerais, dúvidas educativas e perguntas sobre planos.
 * Integra glossário de termos técnicos e contexto da conversa.
 * Não invalida caches.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-008
 *
 * Fase 9: Implementação completa com GPT-5-mini
 */

import { AIMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import type { HealthPlanState } from "../../state/state-annotation"
import {
  HEALTH_PLAN_GLOSSARY,
  addAllTermExplanations
} from "../../../../tools/health-plan/templates/recommendation-template"

// =============================================================================
// SCHEMAS
// =============================================================================

const RespondToUserSchema = z.object({
  response: z
    .string()
    .describe("Resposta contextual em markdown, clara e educativa"),
  topicCategory: z
    .enum([
      "glossary",
      "plan_comparison",
      "coverage",
      "pricing",
      "general_health",
      "process",
      "other"
    ])
    .describe("Categoria do tópico da pergunta"),
  termsExplained: z
    .array(z.string())
    .describe("Termos técnicos que foram explicados na resposta")
})

// =============================================================================
// PROMPTS
// =============================================================================

const RESPOND_TO_USER_SYSTEM_PROMPT = `Você é Bia, uma consultora simpática e experiente em planos de saúde no Brasil.
Responda perguntas do usuário de forma educativa, clara e acessível.

## Regras
1. SEMPRE explique termos técnicos de forma simples quando usá-los
2. Use o contexto da conversa (dados do cliente, planos buscados, análises) quando relevante
3. Seja objetiva mas completa - prefira respostas de 2-4 parágrafos
4. Se não souber algo, diga honestamente e sugira buscar mais informações
5. NÃO invente dados de planos, preços ou coberturas
6. NÃO modifique dados do cliente (idade, orçamento, etc.)
7. Se a pergunta for sobre planos específicos e houver análise disponível, use os dados reais
8. Tom: profissional mas acolhedor, em português brasileiro informal-profissional`

// =============================================================================
// HELPERS
// =============================================================================

function buildConversationContext(state: HealthPlanState): string {
  const parts: string[] = []
  const clientInfo = state.clientInfo || {}

  // Dados do cliente
  const clientParts: string[] = []
  if (clientInfo.name) clientParts.push(`Nome: ${clientInfo.name}`)
  if (clientInfo.age !== undefined) clientParts.push(`Idade: ${clientInfo.age}`)
  if (clientInfo.city) clientParts.push(`Cidade: ${clientInfo.city}`)
  if (clientInfo.state) clientParts.push(`Estado: ${clientInfo.state}`)
  if (clientInfo.budget !== undefined)
    clientParts.push(`Orçamento: R$${clientInfo.budget}/mês`)
  if (clientInfo.dependents && clientInfo.dependents.length > 0)
    clientParts.push(`Dependentes: ${clientInfo.dependents.length}`)

  if (clientParts.length > 0) {
    parts.push(`## Dados do Cliente\n${clientParts.join("\n")}`)
  }

  // Contexto RAG se disponível
  if (state.ragAnalysisContext) {
    const truncated = state.ragAnalysisContext.substring(0, 2000)
    parts.push(`## Planos Encontrados (resumo)\n${truncated}`)
  }

  // Análise de compatibilidade se disponível
  if (state.compatibilityAnalysis) {
    const topPlans = state.compatibilityAnalysis.analyses.slice(0, 3)
    if (topPlans.length > 0) {
      const plansSummary = topPlans
        .map(p => `- ${p.planId}: score ${p.score}/100 (${p.compatibility})`)
        .join("\n")
      parts.push(`## Top Planos Analisados\n${plansSummary}`)
    }
  }

  // Glossário
  const glossary = Object.values(HEALTH_PLAN_GLOSSARY)
    .map(entry => `- **${entry.term}**: ${entry.explanation}`)
    .join("\n")
  parts.push(`## Glossário de Termos\n${glossary}`)

  return parts.join("\n\n")
}

function isHumanMessage(msg: any): boolean {
  const type = String(msg._getType?.() || msg.constructor?.name || "")
  return type === "human" || type === "HumanMessage"
}

function extractLastUserMessage(state: HealthPlanState): string {
  const messages = Array.isArray(state.messages) ? state.messages : []

  // Percorrer de trás para frente buscando mensagem humana
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (isHumanMessage(msg)) {
      return typeof msg.content === "string" ? msg.content : String(msg.content)
    }
  }

  return ""
}

function extractRecentMessages(state: HealthPlanState): string {
  const messages = Array.isArray(state.messages) ? state.messages : []
  const recent = messages.slice(-5)

  return recent
    .map(msg => {
      const role = isHumanMessage(msg) ? "Usuário" : "Assistente"
      const content =
        typeof msg.content === "string" ? msg.content : String(msg.content)
      return `${role}: ${content.substring(0, 200)}`
    })
    .join("\n")
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Responde perguntas gerais e educativas do usuário usando GPT-5-mini.
 *
 * Integra:
 * - Glossário de termos de saúde
 * - Dados do cliente quando disponíveis
 * - Contexto RAG e análises quando disponíveis
 * - Histórico recente da conversa
 *
 * NÃO modifica campos de cache/versão.
 *
 * LangSmith: span `respond_to_user` com tags ["respond-to-user", "health-plan-v2"]
 */
export async function respondToUser(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const userMessage = extractLastUserMessage(state)

  console.log(
    `[respondToUser] Processing: "${userMessage.substring(0, 80)}..."`
  )

  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-5.4-mini",
      temperature: 1,
      timeout: 15000,
      maxRetries: 2,
      maxCompletionTokens: 2048,
      tags: ["respond-to-user", "health-plan-v2"],
      modelKwargs: {
        reasoning_effort: "low"
      }
    })

    const structuredLLM = llm.withStructuredOutput(RespondToUserSchema, {
      name: "respond_to_user"
    })

    const conversationContext = buildConversationContext(state)
    const recentMessages = extractRecentMessages(state)

    const userPrompt = `## Histórico Recente
${recentMessages}

## Pergunta Atual do Usuário
${userMessage}

Responda a pergunta do usuário de forma educativa e contextual.`

    const result = await structuredLLM.invoke([
      {
        role: "system",
        content: RESPOND_TO_USER_SYSTEM_PROMPT + "\n\n" + conversationContext
      },
      { role: "user", content: userPrompt }
    ])

    console.log(
      `[respondToUser] Response generated, topic: ${result.topicCategory}, terms: ${result.termsExplained.length}`
    )

    // Guard: add disclaimer when topic requires RAG data and none is available
    const TOPICS_REQUIRING_RAG: readonly string[] = [
      "plan_comparison",
      "coverage",
      "pricing"
    ]
    const hasRAGContext = Boolean(
      state.ragAnalysisContext ||
        (state.searchResults && state.searchResults.length > 0) ||
        state.compatibilityAnalysis
    )

    let finalResponse = result.response
    if (TOPICS_REQUIRING_RAG.includes(result.topicCategory) && !hasRAGContext) {
      const disclaimer =
        "\n\n> **Nota:** Ainda não busquei planos específicos para seu perfil. " +
        "Para informações mais precisas sobre coberturas e preços, me forneça seus dados " +
        "(idade, cidade, orçamento) e farei uma busca personalizada."
      finalResponse += disclaimer
      console.log(
        "[respondToUser] Added RAG grounding disclaimer (no search results available)"
      )
    }

    return {
      currentResponse: finalResponse,
      messages: [new AIMessage(finalResponse)]
    }
  } catch (error) {
    console.error("[respondToUser] LLM failed, using fallback:", error)

    // Fallback: glossário + mensagem genérica
    const fallback = userMessage
      ? addAllTermExplanations(
          "Essa é uma ótima pergunta! Infelizmente não consegui processar uma resposta completa agora. " +
            "Posso ajudar com informações sobre planos de saúde, coberturas, carências e muito mais. " +
            "Pode reformular sua pergunta?"
        )
      : "Olá! Sou a Bia, consultora de planos de saúde. " +
        "Posso ajudar com dúvidas sobre planos, coberturas, carências e muito mais. " +
        "Como posso te ajudar?"

    return {
      currentResponse: fallback,
      messages: [new AIMessage(fallback)]
    }
  }
}
