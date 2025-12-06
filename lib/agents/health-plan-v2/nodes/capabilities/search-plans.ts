/**
 * Capacidade: searchPlans
 *
 * Busca planos de saúde via RAG com sub-grafo Agentic RAG.
 * Idempotente - pode ser chamada múltiplas vezes.
 *
 * Implementa:
 * - Multi-Query Generation (3-5 queries)
 * - Hierarchical Retrieval (general → specific)
 * - Reciprocal Rank Fusion (RRF k=60)
 * - Document Grading (LLM)
 * - Query Rewriting (max 2x)
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6C
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"
import {
  compiledSearchPlansGraph,
  type SearchPlansState
} from "../../graphs/search-plans-graph"
import type { HealthPlanDocument } from "../../types"

/**
 * Busca planos de saúde usando sub-grafo Agentic RAG
 *
 * O sub-grafo executa:
 * 1. Carrega fileIds das collections
 * 2. Gera 3-5 queries multi-perspectiva
 * 3. Busca hierárquica (geral → específico)
 * 4. RRF fusion dos resultados
 * 5. Grading com LLM
 * 6. Rewrite se necessário (max 2x)
 */
export async function searchPlans(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const startTime = Date.now()
  console.log("[searchPlans] 🔍 Iniciando busca via sub-grafo Agentic RAG...")

  // Verificar se há dados suficientes para busca
  const clientInfo = state.clientInfo || {}
  const hasMinimumData = Boolean(
    clientInfo.age || clientInfo.city || clientInfo.budget
  )

  if (!hasMinimumData) {
    const response =
      "Preciso de algumas informações para buscar os melhores planos para você. " +
      "Pode me dizer sua idade, cidade e orçamento aproximado?"

    console.log("[searchPlans] ⚠ Dados insuficientes para busca")

    return {
      currentResponse: response,
      messages: [new AIMessage(response)]
    }
  }

  try {
    // Invocar o sub-grafo de busca
    const searchInput: Partial<SearchPlansState> = {
      assistantId: state.assistantId,
      clientInfo: state.clientInfo,
      ragModel: "gpt-5-mini" // PRD: gpt-5-mini com reasoning_effort
    }

    console.log("[searchPlans] Invocando searchPlansGraph...")
    const result = await compiledSearchPlansGraph.invoke(searchInput)

    const executionTimeMs = Date.now() - startTime

    // Converter FusedDocument[] para HealthPlanDocument[]
    // Os documentos RAG são extraídos e mapeados para o formato esperado
    const searchResults: HealthPlanDocument[] = (
      result.searchResults || []
    ).map(doc => ({
      id: doc.id,
      operadora: doc.metadata?.operator || "Desconhecida",
      nome_plano: doc.metadata?.planCode || doc.id,
      tipo: doc.metadata?.documentType || "general",
      abrangencia: "nacional", // Default - será extraído do conteúdo posteriormente
      coparticipacao: false, // Default - será extraído do conteúdo posteriormente
      rede_credenciada: [],
      carencias: {},
      preco_base: undefined,
      metadata: {
        content: doc.content,
        similarity: doc.rrfScore || doc.score || 0,
        originalMetadata: doc.metadata,
        hierarchyLevel: (doc as any).hierarchyLevel
      }
    }))

    // Atualizar metadata com tempo de execução real
    const searchMetadata = result.searchMetadata
      ? {
          ...result.searchMetadata,
          executionTimeMs
        }
      : {
          queryCount: 0,
          rewriteCount: 0,
          relevantDocsCount: searchResults.length,
          totalDocsFound: 0,
          generalDocsCount: 0,
          specificDocsCount: 0,
          extractedOperators: [],
          limitedResults: false,
          ragModel: "gpt-5-mini",
          executionTimeMs
        }

    // Gerar resposta baseada nos resultados
    const response = generateSearchResponse(
      searchResults,
      result.limitedResults || false,
      clientInfo,
      executionTimeMs
    )

    console.log(
      `[searchPlans] ✅ Busca concluída: ${searchResults.length} docs em ${executionTimeMs}ms`
    )

    return {
      searchResults,
      searchMetadata,
      searchResultsVersion: (state.searchResultsVersion || 0) + 1,
      currentResponse: response,
      messages: [new AIMessage(response)]
    }
  } catch (error) {
    console.error("[searchPlans] ❌ Erro na busca:", error)

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
 * Gera resposta humanizada baseada nos resultados
 * Inclui lista dos planos encontrados para análise
 */
function generateSearchResponse(
  searchResults: HealthPlanDocument[],
  limitedResults: boolean,
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

  // Extrair lista de planos únicos (operadora - plano)
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

  if (limitedResults) {
    return (
      `Encontrei ${resultsCount} plano${resultsCount > 1 ? "s" : ""} que podem se adequar ao seu perfil${profileSummary}, ` +
      `mas os resultados foram limitados.${plansListFormatted}\n\n` +
      "Gostaria que eu refinasse a busca com mais detalhes sobre suas necessidades?"
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
 * Formato: "Operadora - Nome do Plano"
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
