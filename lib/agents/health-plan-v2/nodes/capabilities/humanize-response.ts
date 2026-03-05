/**
 * Utility: humanizeResponse
 *
 * Fundação central de humanização para TODAS as capabilities do agente.
 * Cada chamada = 1 span rastreável no LangSmith.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: Fase 9 - Conversa Geral + Finalização
 */

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

const HumanizedResponseSchema = z.object({
  response: z.string().describe("Resposta humanizada em markdown"),
  detectedTerms: z
    .array(z.string())
    .describe("Termos técnicos detectados e explicados"),
  tone: z.enum([
    "greeting",
    "informative",
    "educational",
    "farewell",
    "neutral"
  ])
})

// =============================================================================
// TYPES
// =============================================================================

export type HumanizeMessageType =
  | "greeting"
  | "follow_up_question"
  | "confirmation"
  | "search_status"
  | "analysis_result"
  | "recommendation"
  | "educational"
  | "error"
  | "farewell"

export interface HumanizeOptions {
  /** Texto bruto a humanizar */
  rawResponse: string
  /** Estado completo para contexto */
  state: HealthPlanState
  /** Tipo de interação (para system prompt) */
  messageType: HumanizeMessageType
  /** Pula LLM, só aplica glossário */
  glossaryOnly?: boolean
}

export interface HumanizedResult {
  response: string
  detectedTerms: string[]
  tone: string
}

// =============================================================================
// SYSTEM PROMPTS POR TIPO
// =============================================================================

const SYSTEM_PROMPTS: Record<HumanizeMessageType, string> = {
  greeting: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva a mensagem de saudação de forma acolhedora e natural.
- Use o nome do cliente se disponível
- Tom caloroso mas profissional
- Mantenha todas as informações/perguntas da mensagem original
- NÃO invente dados que não estão na mensagem original
- Mantenha em português brasileiro informal-profissional`,

  follow_up_question: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva a pergunta de forma gentil e paciente.
- Mantenha EXATAMENTE os campos que estão sendo perguntados
- Tom encorajador e natural
- Se houver resumo dos dados já coletados, mantenha os valores exatos
- NÃO invente dados que não estão na mensagem original
- Mantenha em português brasileiro informal-profissional`,

  confirmation: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva a confirmação de dados de forma profissional e clara.
- PRESERVE TODOS os dados numéricos exatamente (idade, orçamento, dependentes)
- Mantenha a estrutura de lista/resumo
- Tom confiante e organizado
- NÃO altere valores, nomes ou dados do cliente
- Mantenha em português brasileiro informal-profissional`,

  search_status: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva a mensagem de status de busca de forma natural.
- Se encontrou planos, transmita entusiasmo moderado
- Se não encontrou, seja empática e sugira alternativas
- Mantenha números exatos (quantidade de planos)
- Mantenha em português brasileiro informal-profissional`,

  analysis_result: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva o resultado da análise de forma clara e informativa.
- PRESERVE TODOS os scores, nomes de planos e dados numéricos exatamente
- Explique termos técnicos de saúde de forma acessível
- Tom informativo e consultivo
- Mantenha a estrutura de ranking se houver
- Mantenha em português brasileiro informal-profissional`,

  recommendation: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva a recomendação de forma humanizada.
- PRESERVE TODOS os dados numéricos, nomes e scores
- Tom consultivo e empático
- Mantenha a estrutura de recomendação
- Mantenha em português brasileiro informal-profissional`,

  educational: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva a resposta educativa de forma clara e didática.
- Explique termos técnicos de forma acessível
- Use analogias quando apropriado
- Tom educativo e paciente
- Mantenha em português brasileiro informal-profissional`,

  error: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva a mensagem de erro de forma empática.
- Nunca culpe o usuário
- Ofereça alternativa ou próximo passo
- Tom compreensivo e solícito
- Mantenha em português brasileiro informal-profissional`,

  farewell: `Você é uma consultora simpática de planos de saúde chamada Bia.
Reescreva a despedida de forma calorosa e personalizada.
- Se houver resumo do que foi discutido, mantenha
- Tom caloroso e genuíno
- Deixe porta aberta para retorno
- Mantenha em português brasileiro informal-profissional`
}

// =============================================================================
// GLOSSARY HELPER
// =============================================================================

function buildGlossaryContext(): string {
  const terms = Object.values(HEALTH_PLAN_GLOSSARY)
    .map(entry => `- **${entry.term}**: ${entry.explanation}`)
    .join("\n")

  return `\n## Glossário de Termos (use quando aparecerem no texto)\n${terms}`
}

function buildStateContext(state: HealthPlanState): string {
  const parts: string[] = []
  const clientInfo = state.clientInfo || {}

  if (clientInfo.name) parts.push(`Nome do cliente: ${clientInfo.name}`)
  if (clientInfo.age !== undefined) parts.push(`Idade: ${clientInfo.age} anos`)
  if (clientInfo.city) parts.push(`Cidade: ${clientInfo.city}`)
  if (clientInfo.state) parts.push(`Estado: ${clientInfo.state}`)
  if (clientInfo.budget !== undefined)
    parts.push(`Orçamento: R$${clientInfo.budget}/mês`)
  if (clientInfo.dependents && clientInfo.dependents.length > 0)
    parts.push(`Dependentes: ${clientInfo.dependents.length}`)

  if (parts.length === 0) return ""

  return `\n## Contexto do Cliente\n${parts.join("\n")}`
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Humaniza uma resposta usando GPT-5-mini com LangSmith tracing.
 *
 * Cada chamada gera um span `humanize_response` rastreável no LangSmith,
 * filho do nó que a chamou.
 *
 * @param options - Opções de humanização
 * @returns Resultado humanizado com resposta, termos detectados e tom
 */
export async function humanizeResponse(
  options: HumanizeOptions
): Promise<HumanizedResult> {
  const { rawResponse, state, messageType, glossaryOnly } = options

  // Modo glossário: sem LLM, só aplica explicações de termos
  if (glossaryOnly) {
    const enriched = addAllTermExplanations(rawResponse)
    return {
      response: enriched,
      detectedTerms: [],
      tone: "neutral"
    }
  }

  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-5-mini",
      temperature: 1,
      timeout: 15000,
      maxRetries: 2,
      tags: ["humanize-response", "health-plan-v2"],
      modelKwargs: {
        max_completion_tokens: 2048,
        reasoning_effort: "low"
      }
    })

    const structuredLLM = llm.withStructuredOutput(HumanizedResponseSchema, {
      name: "humanize_response"
    })

    const systemPrompt =
      SYSTEM_PROMPTS[messageType] +
      buildGlossaryContext() +
      buildStateContext(state)

    const result = await structuredLLM.invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Reescreva esta mensagem mantendo o conteúdo e dados exatos:\n\n${rawResponse}`
      }
    ])

    return {
      response: result.response,
      detectedTerms: result.detectedTerms,
      tone: result.tone
    }
  } catch (error) {
    console.error(
      "[humanizeResponse] LLM failed, using glossary fallback:",
      error
    )

    // Fallback: aplica glossário sem LLM
    const enriched = addAllTermExplanations(rawResponse)
    return {
      response: enriched,
      detectedTerms: [],
      tone: "neutral"
    }
  }
}
