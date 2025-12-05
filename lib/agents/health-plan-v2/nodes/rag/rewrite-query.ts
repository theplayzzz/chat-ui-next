/**
 * Rewrite Query - Query Rewriting para Corrective RAG
 *
 * Reformula queries quando há poucos resultados relevantes.
 * Implementa padrão Corrective RAG com limite de 2 tentativas.
 *
 * Features:
 * - Identifica tipo de problema (no_results, low_similarity, etc)
 * - Limite de 2 tentativas de rewrite
 * - Flag limitedResults após esgotar tentativas
 * - Suporte a GPT-5 (modelKwargs) e outros modelos
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: RF-006, Fase 6B.2
 */

import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"

import type { ClientInfoForQueries } from "./generate-queries"
import type { RewriteProblem, RewriteResult } from "../../schemas/rag-schemas"
import {
  REWRITE_QUERY_PROMPT,
  REWRITING_TEMPERATURE,
  formatClientInfoForPrompt,
  formatProblemForPrompt
} from "../../prompts/rag-prompts"

// =============================================================================
// Constants
// =============================================================================

/** Máximo de tentativas de rewrite */
export const MAX_REWRITE_ATTEMPTS = 2

/** Mínimo de documentos relevantes para considerar busca bem-sucedida */
export const MIN_RELEVANT_DOCS = 3

// =============================================================================
// Types
// =============================================================================

export interface RewriteQueryOptions {
  /** Modelo LLM a usar (default: gpt-5-mini) */
  model?: string
  /** Timeout em ms (default: 10000) */
  timeout?: number
}

export interface RewriteContext {
  /** Query original que não funcionou */
  originalQuery: string
  /** Problema identificado */
  problem: RewriteProblem
  /** Número da tentativa atual (1 ou 2) */
  attemptCount: number
  /** Dados do cliente para contexto */
  clientInfo: ClientInfoForQueries
}

/**
 * Schema para resposta do LLM
 */
const RewriteResponseSchema = z.object({
  rewrittenQuery: z.string().min(10),
  changes: z.string().optional()
})

const DEFAULT_OPTIONS: Required<RewriteQueryOptions> = {
  model: "gpt-5-mini",
  timeout: 10000
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Reescreve uma query para melhorar resultados de busca
 *
 * @param context - Contexto com query original, problema e dados do cliente
 * @param options - Configurações do rewrite
 * @returns Query reescrita e metadados
 */
export async function rewriteQuery(
  context: RewriteContext,
  options: RewriteQueryOptions = {}
): Promise<RewriteResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { originalQuery, problem, attemptCount, clientInfo } = context

  // Verificar limite de tentativas
  if (attemptCount > MAX_REWRITE_ATTEMPTS) {
    console.log(
      `[rewriteQuery] Limite de ${MAX_REWRITE_ATTEMPTS} tentativas atingido`
    )
    return {
      originalQuery,
      rewrittenQuery: originalQuery,
      problem,
      attemptCount,
      limitedResults: true
    }
  }

  console.log(
    `[rewriteQuery] Tentativa ${attemptCount}/${MAX_REWRITE_ATTEMPTS} - Problema: ${problem}`
  )

  try {
    const rewrittenQuery = await callRewriteLLM(context, opts)

    // Validar que a query realmente mudou
    if (rewrittenQuery === originalQuery) {
      console.warn("[rewriteQuery] Query não foi alterada pelo LLM")
    }

    return {
      originalQuery,
      rewrittenQuery,
      problem,
      attemptCount,
      limitedResults: false
    }
  } catch (error) {
    console.error("[rewriteQuery] Erro ao reescrever query:", error)

    // Fallback: tentar estratégia simples de rewrite
    const fallbackQuery = applySimpleRewrite(originalQuery, problem, clientInfo)

    return {
      originalQuery,
      rewrittenQuery: fallbackQuery,
      problem,
      attemptCount,
      limitedResults: attemptCount >= MAX_REWRITE_ATTEMPTS
    }
  }
}

// =============================================================================
// LLM Call
// =============================================================================

/**
 * Chama LLM para reescrever query
 */
async function callRewriteLLM(
  context: RewriteContext,
  options: Required<RewriteQueryOptions>
): Promise<string> {
  const { originalQuery, problem, clientInfo } = context

  // Configurar LLM
  const isGpt5Model = options.model.startsWith("gpt-5")

  const llm = new ChatOpenAI({
    modelName: options.model,
    timeout: options.timeout,
    maxRetries: 2,
    tags: ["rewrite-query", "health-plan-v2", "rag"],
    ...(isGpt5Model
      ? {
          modelKwargs: {
            reasoning: { effort: "low" },
            text: { verbosity: "medium" }
          }
        }
      : {
          temperature: REWRITING_TEMPERATURE
        })
  })

  // Preparar prompt
  const prompt = REWRITE_QUERY_PROMPT.replace(
    "{problem}",
    formatProblemForPrompt(problem)
  )
    .replace("{originalQuery}", originalQuery)
    .replace("{clientInfo}", formatClientInfoForPrompt(clientInfo))

  // Chamar LLM
  const response = await llm.invoke(prompt)
  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content)

  // Extrair JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn("[callRewriteLLM] Não foi possível extrair JSON")
    throw new Error("Resposta inválida do LLM")
  }

  const parsed = JSON.parse(jsonMatch[0])
  const validated = RewriteResponseSchema.parse(parsed)

  console.log(
    `[callRewriteLLM] Query reescrita: "${validated.rewrittenQuery.substring(0, 50)}..."`
  )

  if (validated.changes) {
    console.log(`[callRewriteLLM] Mudanças: ${validated.changes}`)
  }

  return validated.rewrittenQuery
}

// =============================================================================
// Fallback Strategies
// =============================================================================

/**
 * Aplica rewrite simples sem LLM (fallback)
 */
function applySimpleRewrite(
  query: string,
  problem: RewriteProblem,
  clientInfo: ClientInfoForQueries
): string {
  switch (problem) {
    case "no_results":
      // Simplificar query - manter apenas palavras-chave principais
      return simplifyQuery(query)

    case "too_specific":
      // Remover termos muito específicos
      return removeSpecificTerms(query)

    case "missing_context":
      // Adicionar contexto do cliente
      return addClientContext(query, clientInfo)

    case "low_similarity":
      // Adicionar sinônimos comuns
      return addSynonyms(query)

    default:
      return query
  }
}

/**
 * Simplifica query removendo modificadores
 */
function simplifyQuery(query: string): string {
  // Remover palavras comuns que não ajudam na busca
  const stopWords = [
    "melhor",
    "ideal",
    "perfeito",
    "excelente",
    "específico",
    "especial",
    "único",
    "exclusivo",
    "completo",
    "total"
  ]

  const words = query.toLowerCase().split(/\s+/)
  const filtered = words.filter(word => !stopWords.includes(word))

  // Manter pelo menos 3 palavras
  if (filtered.length < 3) {
    return query
  }

  return filtered.join(" ")
}

/**
 * Remove termos muito específicos (códigos, nomes de planos específicos)
 */
function removeSpecificTerms(query: string): string {
  // Remover códigos ANS, códigos de planos, etc
  let simplified = query
    .replace(/\b(ANS|código|cod\.?)\s*[\d\-\.]+/gi, "")
    .replace(/\b[A-Z]\d{3,}/g, "") // Códigos de plano como S450, E100
    .replace(/\s+/g, " ")
    .trim()

  // Se ficou muito curto, manter original
  if (simplified.length < 15) {
    return query
  }

  return simplified
}

/**
 * Adiciona contexto do cliente à query
 */
function addClientContext(
  query: string,
  clientInfo: ClientInfoForQueries
): string {
  const additions: string[] = []

  if (clientInfo.city) {
    additions.push(clientInfo.city)
  } else if (clientInfo.state) {
    additions.push(clientInfo.state)
  }

  if (clientInfo.age !== undefined) {
    if (clientInfo.age < 30) {
      additions.push("jovem")
    } else if (clientInfo.age >= 60) {
      additions.push("idoso senior")
    }
  }

  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    additions.push("familiar")
  }

  if (additions.length === 0) {
    return query
  }

  return `${query} ${additions.join(" ")}`
}

/**
 * Adiciona sinônimos comuns para termos de planos de saúde
 */
function addSynonyms(query: string): string {
  const synonymMap: Record<string, string[]> = {
    "plano de saúde": ["convênio médico", "seguro saúde"],
    cobertura: ["benefícios", "atendimento"],
    hospital: ["internação", "emergência"],
    consulta: ["atendimento médico", "médico"],
    barato: ["econômico", "custo-benefício"],
    caro: ["premium", "completo"]
  }

  let enhanced = query

  for (const [term, synonyms] of Object.entries(synonymMap)) {
    if (query.toLowerCase().includes(term)) {
      // Adicionar primeiro sinônimo
      enhanced = `${enhanced} ${synonyms[0]}`
      break // Apenas um sinônimo para não poluir
    }
  }

  return enhanced
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detecta o tipo de problema baseado nos resultados da busca
 */
export function detectProblem(
  totalResults: number,
  relevantResults: number,
  avgSimilarity?: number
): RewriteProblem {
  if (totalResults === 0) {
    return "no_results"
  }

  if (relevantResults < MIN_RELEVANT_DOCS) {
    if (avgSimilarity !== undefined && avgSimilarity < 0.5) {
      return "low_similarity"
    }
    return "too_specific"
  }

  return "missing_context"
}

/**
 * Verifica se deve tentar rewrite
 */
export function shouldRewrite(
  relevantCount: number,
  attemptCount: number
): boolean {
  return (
    relevantCount < MIN_RELEVANT_DOCS && attemptCount < MAX_REWRITE_ATTEMPTS
  )
}

/**
 * Cria contexto para rewrite
 */
export function createRewriteContext(
  originalQuery: string,
  problem: RewriteProblem,
  attemptCount: number,
  clientInfo: ClientInfoForQueries
): RewriteContext {
  return {
    originalQuery,
    problem,
    attemptCount,
    clientInfo
  }
}
