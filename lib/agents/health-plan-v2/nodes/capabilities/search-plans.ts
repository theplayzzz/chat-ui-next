/**
 * Capacidade: searchPlans
 *
 * Busca planos de saúde via RAG simplificado.
 * Idempotente - pode ser chamada múltiplas vezes.
 *
 * Implementa:
 * - Busca vetorial única com contexto enriquecido
 * - Document Grading (LLM) com contexto de coleção/arquivo
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"
import {
  invokeSearchPlansGraph,
  type SearchMetadata
} from "../../graphs/search-plans-graph"
import type { GradedChunk } from "../../nodes/rag/grade-documents"
import type { HealthPlanDocument } from "../../types"

/**
 * Busca planos de saúde usando sub-grafo RAG simplificado
 *
 * O sub-grafo executa:
 * 1. Carrega fileIds das collections
 * 2. Busca vetorial única com contexto enriquecido
 * 3. Grading com LLM usando contexto de coleção/arquivo
 */
export async function searchPlans(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const startTime = Date.now()
  console.log("[searchPlans] Iniciando busca via sub-grafo RAG...")

  // Verificar se há dados suficientes para busca
  const clientInfo = state.clientInfo || {}
  const hasMinimumData = Boolean(
    clientInfo.age || clientInfo.city || clientInfo.budget
  )

  if (!hasMinimumData) {
    const response =
      "Preciso de algumas informações para buscar os melhores planos para você. " +
      "Pode me dizer sua idade, cidade e orçamento aproximado?"

    console.log("[searchPlans] Dados insuficientes para busca")

    return {
      currentResponse: response,
      messages: [new AIMessage(response)]
    }
  }

  try {
    // Construir query baseada na última mensagem ou clientInfo
    const lastMessage = state.messages?.[state.messages.length - 1]
    const userQuery =
      typeof lastMessage?.content === "string"
        ? lastMessage.content
        : `buscar planos de saúde para cliente ${clientInfo.age || ""} anos ${clientInfo.city || ""}`

    // Invocar o sub-grafo de busca
    console.log("[searchPlans] Invocando searchPlansGraph...")
    const result = await invokeSearchPlansGraph({
      assistantId: state.assistantId,
      userQuery,
      clientInfo: state.clientInfo,
      ragModel: "gpt-4o-mini"
    })

    const executionTimeMs = Date.now() - startTime

    // Converter GradedChunk[] para HealthPlanDocument[]
    const searchResults: HealthPlanDocument[] = (result.results || []).map(
      chunk => convertChunkToDocument(chunk)
    )

    // Preparar metadata
    const searchMetadata = result.metadata
      ? {
          ...result.metadata,
          executionTimeMs
        }
      : {
          query: userQuery,
          retrievedCount: 0,
          relevantCount: searchResults.length,
          ragModel: "gpt-4o-mini",
          executionTimeMs,
          gradingStats: { relevant: 0, partiallyRelevant: 0, irrelevant: 0 }
        }

    // Gerar resposta baseada nos resultados
    const response = generateSearchResponse(
      searchResults,
      clientInfo,
      executionTimeMs
    )

    console.log(
      `[searchPlans] Busca concluída: ${searchResults.length} docs em ${executionTimeMs}ms`
    )

    return {
      searchResults,
      searchMetadata,
      searchResultsVersion: (state.searchResultsVersion || 0) + 1,
      currentResponse: response,
      messages: [new AIMessage(response)]
    }
  } catch (error) {
    console.error("[searchPlans] Erro na busca:", error)

    const errorResponse =
      "Desculpe, houve um problema ao buscar os planos. Vou tentar de outra forma. " +
      "Pode me contar mais sobre suas necessidades específicas?"

    return {
      currentResponse: errorResponse,
      messages: [new AIMessage(errorResponse)],
      errors: [
        {
          capability: "searchPlans",
          message: error instanceof Error ? error.message : "Erro desconhecido",
          timestamp: new Date().toISOString()
        }
      ]
    }
  }
}

/**
 * Converte GradedChunk para HealthPlanDocument
 */
function convertChunkToDocument(chunk: GradedChunk): HealthPlanDocument {
  return {
    id: chunk.id,
    operadora: chunk.collection?.name || "Desconhecida",
    nome_plano: chunk.file.name,
    tipo: "general",
    abrangencia: "nacional",
    coparticipacao: false,
    rede_credenciada: [],
    carencias: {},
    preco_base: undefined,
    metadata: {
      content: chunk.content,
      similarity: chunk.similarity,
      fileDescription: chunk.file.description,
      collectionDescription: chunk.collection?.description,
      gradeResult: chunk.gradeResult
    }
  }
}

/**
 * Gera resposta humanizada baseada nos resultados
 */
function generateSearchResponse(
  searchResults: HealthPlanDocument[],
  clientInfo: Record<string, any>,
  executionTimeMs: number
): string {
  const resultsCount = searchResults.length

  const details = []
  if (clientInfo.age) details.push(`${clientInfo.age} anos`)
  if (clientInfo.city || clientInfo.state)
    details.push(clientInfo.city || clientInfo.state)
  if (clientInfo.budget) details.push(`orçamento de R$${clientInfo.budget}`)

  const profileSummary = details.length > 0 ? ` (${details.join(", ")})` : ""

  // Extrair lista de planos únicos
  const plansList = extractUniquePlans(searchResults)
  const plansListFormatted =
    plansList.length > 0
      ? `\n\n**Planos encontrados:**\n${plansList.map(p => `• ${p}`).join("\n")}`
      : ""

  if (resultsCount === 0) {
    return (
      `Não encontrei planos que correspondam exatamente ao seu perfil${profileSummary}. ` +
      "Podemos ajustar alguns critérios para encontrar mais opções?"
    )
  }

  if (resultsCount <= 3) {
    return (
      `Encontrei ${resultsCount} plano${resultsCount > 1 ? "s" : ""} interessante${resultsCount > 1 ? "s" : ""} para seu perfil${profileSummary}.${plansListFormatted}\n\n` +
      "Quer que eu analise a compatibilidade de cada um com suas necessidades?"
    )
  }

  return (
    `Ótimo! Encontrei ${resultsCount} planos compatíveis com seu perfil${profileSummary}.${plansListFormatted}\n\n` +
    "Posso analisar os mais relevantes e fazer uma recomendação personalizada para você?"
  )
}

/**
 * Extrai lista de planos únicos dos resultados
 */
function extractUniquePlans(searchResults: HealthPlanDocument[]): string[] {
  const seen = new Set<string>()
  const plans: string[] = []

  for (const doc of searchResults) {
    const operadora = doc.operadora || "Desconhecida"
    const plano = doc.nome_plano || doc.id
    const key = `${operadora} - ${plano}`.toLowerCase()

    if (!seen.has(key)) {
      seen.add(key)
      plans.push(`${operadora} - ${plano}`)
    }
  }

  return plans
}
