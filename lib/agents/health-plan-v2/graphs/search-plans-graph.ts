/**
 * Search Plans Graph - Sub-grafo RAG Simplificado
 *
 * Implementa busca vetorial simples com contexto enriquecido:
 * - Busca única com embedding
 * - Retorno enriquecido (nome/descrição de coleção e arquivo)
 * - Document Grading (LLM) usando contexto completo
 *
 * Fluxo: initialize → retrieveSimple → gradeDocuments → formatResults
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

import { StateGraph, Annotation, END, START } from "@langchain/langgraph"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"

// Import dos nós RAG simplificados
import {
  retrieveSimple,
  type EnrichedChunk,
  type ClientInfo
} from "../nodes/rag/retrieve-simple"
import {
  gradeDocuments,
  type GradeDocumentsResult,
  type GradedChunk
} from "../nodes/rag/grade-documents"

// Types
import type { PartialClientInfo } from "../../health-plan-v2/types"

// =============================================================================
// State Annotation
// =============================================================================

/**
 * Estado simplificado do sub-grafo de busca de planos
 */
export const SearchPlansStateAnnotation = Annotation.Root({
  // === INPUT ===
  /** ID do assistente */
  assistantId: Annotation<string>,
  /** Informações do cliente */
  clientInfo: Annotation<PartialClientInfo>({
    reducer: (_, y) => y,
    default: () => ({})
  }),
  /** Query de busca do usuário */
  userQuery: Annotation<string>({
    reducer: (_, y) => y,
    default: () => ""
  }),

  // === CONFIGURAÇÃO ===
  /** Modelo para grading (default: gpt-4o-mini) */
  ragModel: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "gpt-4o-mini"
  }),
  /** IDs dos arquivos para buscar */
  fileIds: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  /** Top-K para busca vetorial */
  topK: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 20
  }),

  // === BUSCA ===
  /** Chunks enriquecidos da busca */
  retrievedChunks: Annotation<EnrichedChunk[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === GRADING ===
  /** Chunks após avaliação de relevância */
  gradedChunks: Annotation<GradedChunk[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  /** Chunks relevantes filtrados */
  relevantChunks: Annotation<GradedChunk[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === OUTPUT ===
  /** Resultados finais da busca */
  searchResults: Annotation<GradedChunk[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  /** Metadados da busca */
  searchMetadata: Annotation<SearchMetadata | null>({
    reducer: (_, y) => y,
    default: () => null
  })
})

export type SearchPlansState = typeof SearchPlansStateAnnotation.State

/**
 * Metadados da busca
 */
export interface SearchMetadata {
  /** Query utilizada */
  query: string
  /** Total de chunks recuperados */
  retrievedCount: number
  /** Chunks relevantes após grading */
  relevantCount: number
  /** Modelo usado para grading */
  ragModel: string
  /** Tempo de execução em ms */
  executionTimeMs: number
  /** Stats do grading */
  gradingStats: {
    relevant: number
    partiallyRelevant: number
    irrelevant: number
  }
}

// =============================================================================
// Nós do Grafo
// =============================================================================

/**
 * Nó: Inicialização - Carrega fileIds das collections do assistente
 */
async function initializeNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] Inicializando busca...")
  console.log(`[search-plans-graph] AssistantId: ${state.assistantId}`)

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Buscar collections do assistente
  const { data: assistant, error } = await supabase
    .from("assistants")
    .select(
      `
      id,
      name,
      collections (
        id,
        name,
        collection_type,
        files (
          id,
          name,
          type
        )
      )
    `
    )
    .eq("id", state.assistantId)
    .single()

  if (error || !assistant) {
    console.error("[search-plans-graph] Erro ao buscar assistente:", error)
    return { fileIds: [] }
  }

  // Extrair fileIds
  const collections = assistant.collections || []
  const fileIds = collections.flatMap(c =>
    (c.files || []).map((f: { id: string }) => f.id)
  )

  console.log(`[search-plans-graph] Files encontrados: ${fileIds.length}`)

  return { fileIds }
}

/**
 * Nó: Busca Vetorial Simples com Contexto Enriquecido
 */
async function retrieveSimpleNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] Buscando chunks...")

  if (state.fileIds.length === 0) {
    console.log("[search-plans-graph] Nenhum arquivo para buscar")
    return { retrievedChunks: [] }
  }

  // Construir query combinando userQuery com contexto do cliente
  const queryParts = [state.userQuery]

  if (state.clientInfo.city || state.clientInfo.state) {
    const location = [state.clientInfo.city, state.clientInfo.state]
      .filter(Boolean)
      .join(", ")
    queryParts.push(`localização: ${location}`)
  }

  if (state.clientInfo.age) {
    queryParts.push(`idade: ${state.clientInfo.age} anos`)
  }

  const enrichedQuery = queryParts.join(" | ")

  const result = await retrieveSimple({
    query: enrichedQuery,
    fileIds: state.fileIds,
    topK: state.topK
  })

  console.log(`[search-plans-graph] Recuperados ${result.chunks.length} chunks`)

  return { retrievedChunks: result.chunks }
}

/**
 * Nó: Grading de Documentos com LLM
 */
async function gradeDocumentsNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] Avaliando relevância...")

  if (state.retrievedChunks.length === 0) {
    return {
      gradedChunks: [],
      relevantChunks: []
    }
  }

  // Converter PartialClientInfo para ClientInfo
  const clientInfo: ClientInfo = {
    age: state.clientInfo.age,
    city: state.clientInfo.city,
    state: state.clientInfo.state,
    budget: state.clientInfo.budget,
    dependents: state.clientInfo.dependents,
    preExistingConditions: state.clientInfo.healthConditions,
    preferences: state.clientInfo.preferences
  }

  const result = await gradeDocuments(state.retrievedChunks, clientInfo, {
    model: state.ragModel,
    batchSize: 5
  })

  console.log(
    `[search-plans-graph] Relevantes: ${result.relevantChunks.length}/${state.retrievedChunks.length}`
  )

  return {
    gradedChunks: result.allChunks,
    relevantChunks: result.relevantChunks
  }
}

/**
 * Nó: Formatar Resultados Finais
 */
async function formatResultsNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] Formatando resultados...")

  // Calcular stats do grading
  const gradingStats = {
    relevant: state.gradedChunks.filter(
      c => c.gradeResult?.score === "relevant"
    ).length,
    partiallyRelevant: state.gradedChunks.filter(
      c => c.gradeResult?.score === "partially_relevant"
    ).length,
    irrelevant: state.gradedChunks.filter(
      c => c.gradeResult?.score === "irrelevant"
    ).length
  }

  const searchMetadata: SearchMetadata = {
    query: state.userQuery,
    retrievedCount: state.retrievedChunks.length,
    relevantCount: state.relevantChunks.length,
    ragModel: state.ragModel,
    executionTimeMs: 0, // Será calculado no invoke
    gradingStats
  }

  console.log(
    `[search-plans-graph] Busca concluída: ${state.relevantChunks.length} docs relevantes`
  )

  return {
    searchResults: state.relevantChunks,
    searchMetadata
  }
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Cria o sub-grafo simplificado de busca de planos
 */
export function createSearchPlansGraph() {
  const workflow = new StateGraph(SearchPlansStateAnnotation)
    // Adiciona nós
    .addNode("initialize", initializeNode)
    .addNode("retrieveSimple", retrieveSimpleNode)
    .addNode("gradeDocuments", gradeDocumentsNode)
    .addNode("formatResults", formatResultsNode)
    // Define fluxo linear
    .addEdge(START, "initialize")
    .addEdge("initialize", "retrieveSimple")
    .addEdge("retrieveSimple", "gradeDocuments")
    .addEdge("gradeDocuments", "formatResults")
    .addEdge("formatResults", END)

  return workflow
}

/**
 * Compila o sub-grafo
 */
export function compileSearchPlansGraph() {
  const workflow = createSearchPlansGraph()
  return workflow.compile()
}

/**
 * Sub-grafo compilado para uso em searchPlans capability
 */
export const compiledSearchPlansGraph = compileSearchPlansGraph()

/**
 * Tipo do sub-grafo compilado
 */
export type SearchPlansGraphApp = ReturnType<typeof compileSearchPlansGraph>

// =============================================================================
// Helper para invocar o grafo
// =============================================================================

/**
 * Invoca o grafo de busca de planos
 */
export async function invokeSearchPlansGraph(params: {
  assistantId: string
  userQuery: string
  clientInfo?: PartialClientInfo
  ragModel?: string
  topK?: number
}): Promise<{
  results: GradedChunk[]
  metadata: SearchMetadata | null
}> {
  const startTime = Date.now()

  const result = await compiledSearchPlansGraph.invoke({
    assistantId: params.assistantId,
    userQuery: params.userQuery,
    clientInfo: params.clientInfo || {},
    ragModel: params.ragModel || "gpt-4o-mini",
    topK: params.topK || 20
  })

  // Atualizar tempo de execução
  if (result.searchMetadata) {
    result.searchMetadata.executionTimeMs = Date.now() - startTime
  }

  return {
    results: result.searchResults,
    metadata: result.searchMetadata
  }
}
