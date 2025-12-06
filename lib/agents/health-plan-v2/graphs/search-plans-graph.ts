/**
 * Search Plans Graph - Sub-grafo Agentic RAG
 *
 * Implementa busca hierárquica inteligente com:
 * - Multi-Query Generation (3-5 queries)
 * - Hierarchical Retrieval (general → specific)
 * - Reciprocal Rank Fusion (RRF k=60)
 * - Document Grading (LLM)
 * - Query Rewriting (max 2x)
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6C
 */

import { StateGraph, Annotation, END, START } from "@langchain/langgraph"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"

// Import dos nós RAG
import {
  generateQueries,
  extractQueryStrings,
  type GeneratedQueries
} from "../nodes/rag/generate-queries"
import {
  reciprocalRankFusion,
  type QueryResult,
  type FusedDocument
} from "../nodes/rag/result-fusion"
import {
  gradeDocuments,
  type GradeDocumentsResult
} from "../nodes/rag/grade-documents"
import {
  rewriteQuery,
  detectProblem,
  shouldRewrite,
  MAX_REWRITE_ATTEMPTS
} from "../nodes/rag/rewrite-query"
import {
  retrieveHierarchical,
  type HierarchicalRetrieveResult,
  type HierarchicalDocument
} from "../nodes/rag/retrieve-hierarchical"

// Types
import type { PartialClientInfo } from "../../health-plan-v2/types"

// =============================================================================
// State Annotation
// =============================================================================

/**
 * Estado do sub-grafo de busca de planos
 */
export const SearchPlansStateAnnotation = Annotation.Root({
  // === INPUT DO GRAFO PRINCIPAL ===
  assistantId: Annotation<string>,
  clientInfo: Annotation<PartialClientInfo>({
    reducer: (_, y) => y,
    default: () => ({})
  }),

  // === CONFIGURAÇÃO RAG ===
  ragModel: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "gpt-5-mini" // PRD: gpt-5-mini com reasoning_effort
  }),
  fileIds: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === MULTI-QUERY ===
  queries: Annotation<GeneratedQueries["queries"]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  queryStrings: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === BUSCA HIERÁRQUICA ===
  generalDocs: Annotation<HierarchicalDocument[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  specificDocs: Annotation<HierarchicalDocument[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  extractedOperators: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === FUSION ===
  fusedDocs: Annotation<FusedDocument[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === GRADING ===
  gradedDocs: Annotation<GradeDocumentsResult["documents"]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  relevantDocs: Annotation<FusedDocument[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  relevantCount: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0
  }),

  // === REWRITE CONTROL ===
  rewriteCount: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0
  }),
  currentQuery: Annotation<string>({
    reducer: (_, y) => y,
    default: () => ""
  }),

  // === OUTPUT ===
  searchResults: Annotation<FusedDocument[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  limitedResults: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false
  }),
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
  queryCount: number
  rewriteCount: number
  relevantDocsCount: number
  totalDocsFound: number
  generalDocsCount: number
  specificDocsCount: number
  extractedOperators: string[]
  limitedResults: boolean
  ragModel: string
  executionTimeMs: number
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
  console.log("[search-plans-graph] 🚀 Inicializando busca...")
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
    return { fileIds: [], ragModel: "gpt-5-mini" }
  }

  // Extrair fileIds - o modelo será o default do state ou passado pelo grafo principal
  const collections = assistant.collections || []
  const fileIds = collections.flatMap(c =>
    (c.files || []).map((f: { id: string }) => f.id)
  )

  // ragModel usa default do state (gpt-5-mini) ou pode ser passado pelo invoker
  const ragModel = state.ragModel || "gpt-5-mini"

  console.log(
    `[search-plans-graph] Files: ${fileIds.length}, Model: ${ragModel}`
  )

  return { fileIds, ragModel }
}

/**
 * Nó: Gerar Queries Multi-Perspectiva
 */
async function generateQueriesNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] 📝 Gerando queries...")

  const result = await generateQueries(state.clientInfo, state.ragModel)

  const queryStrings = extractQueryStrings({ queries: result.queries })
  const currentQuery = queryStrings[0] || ""

  console.log(`[search-plans-graph] Geradas ${result.queries.length} queries`)

  return {
    queries: result.queries,
    queryStrings,
    currentQuery
  }
}

/**
 * Nó: Busca Hierárquica (General + Specific)
 */
async function retrieveHierarchicalNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] 🔍 Busca hierárquica...")

  if (state.fileIds.length === 0) {
    console.log("[search-plans-graph] Nenhum arquivo para buscar")
    return { generalDocs: [], specificDocs: [], extractedOperators: [] }
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Gerar embedding para a query atual
  const OpenAI = (await import("openai")).default
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: state.currentQuery
  })
  const queryEmbedding = embeddingResponse.data[0].embedding

  // Executar busca hierárquica
  const result = await retrieveHierarchical({
    queryEmbedding,
    fileIds: state.fileIds,
    generalTopK: 5,
    specificTopK: 10,
    generalWeight: 0.3,
    specificWeight: 0.7,
    supabaseClient: supabase
  })

  console.log(
    `[search-plans-graph] General: ${result.generalDocs.length}, Specific: ${result.specificDocs.length}`
  )

  return {
    generalDocs: result.documents.filter(d => d.hierarchyLevel === "general"),
    specificDocs: result.documents.filter(d => d.hierarchyLevel === "specific"),
    extractedOperators: result.extractedOperators
  }
}

/**
 * Nó: RRF Fusion dos resultados
 */
async function fusionResultsNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] 🔀 Fusionando resultados...")

  // Converter para QueryResult format
  const allDocs = [...state.generalDocs, ...state.specificDocs]

  // Criar QueryResults virtuais para RRF
  const queryResults: QueryResult[] = state.queryStrings.map((query, idx) => ({
    query,
    documents: allDocs.map(doc => ({
      id: doc.id,
      content: doc.content,
      score: doc.hierarchicalScore || doc.score || 0,
      metadata: doc.metadata
    }))
  }))

  const fusedDocs = reciprocalRankFusion(queryResults, { topK: 15 })

  console.log(`[search-plans-graph] Fusionados ${fusedDocs.length} documentos`)

  return { fusedDocs }
}

/**
 * Nó: Grading de documentos com LLM
 */
async function gradeDocumentsNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] ⭐ Avaliando documentos...")

  const result = await gradeDocuments(state.fusedDocs, state.clientInfo, {
    model: state.ragModel,
    batchSize: 5
  })

  // gradeDocuments já retorna relevantDocuments filtrados
  const relevantDocs = result.relevantDocuments as FusedDocument[]
  const relevantCount = relevantDocs.length

  console.log(
    `[search-plans-graph] Relevantes: ${relevantCount}/${state.fusedDocs.length}`
  )

  return {
    gradedDocs: result.documents,
    relevantDocs,
    relevantCount
  }
}

/**
 * Nó: Rewrite da Query
 */
async function rewriteQueryNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log(
    `[search-plans-graph] ✏️ Reescrevendo query (tentativa ${state.rewriteCount + 1})...`
  )

  const problem = detectProblem(
    state.fusedDocs.length,
    state.relevantCount,
    0.5
  )

  const result = await rewriteQuery(
    {
      originalQuery: state.currentQuery,
      problem,
      attemptCount: state.rewriteCount + 1,
      clientInfo: state.clientInfo
    },
    { model: state.ragModel }
  )

  console.log(
    `[search-plans-graph] Query reescrita: "${result.rewrittenQuery.substring(0, 50)}..."`
  )

  return {
    currentQuery: result.rewrittenQuery,
    rewriteCount: state.rewriteCount + 1
  }
}

/**
 * Nó: Formatar resultados finais
 */
async function formatResultsNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] 📦 Formatando resultados finais...")

  const limitedResults =
    state.rewriteCount >= MAX_REWRITE_ATTEMPTS && state.relevantCount < 3

  const searchMetadata: SearchMetadata = {
    queryCount: state.queries.length,
    rewriteCount: state.rewriteCount,
    relevantDocsCount: state.relevantCount,
    totalDocsFound: state.fusedDocs.length,
    generalDocsCount: state.generalDocs.length,
    specificDocsCount: state.specificDocs.length,
    extractedOperators: state.extractedOperators,
    limitedResults,
    ragModel: state.ragModel,
    executionTimeMs: 0 // Será calculado no invoke
  }

  console.log(
    `[search-plans-graph] ✅ Busca concluída: ${state.relevantDocs.length} docs relevantes`
  )

  return {
    searchResults: state.relevantDocs,
    limitedResults,
    searchMetadata
  }
}

// =============================================================================
// Routing Functions
// =============================================================================

/**
 * Decide se precisa reescrever query ou formatar resultados
 */
function routeAfterGrading(state: SearchPlansState): string {
  const { relevantCount, rewriteCount } = state

  // Se temos docs suficientes, formata resultados
  if (relevantCount >= 3) {
    console.log(
      "[search-plans-graph] ✓ Docs suficientes, formatando resultados"
    )
    return "formatResults"
  }

  // Se ainda podemos reescrever, tenta novamente
  if (shouldRewrite(relevantCount, rewriteCount)) {
    console.log(
      `[search-plans-graph] ⚠ Poucos docs (${relevantCount}), reescrevendo query`
    )
    return "rewriteQuery"
  }

  // Limite de rewrites atingido
  console.log(
    "[search-plans-graph] ⚠ Limite de rewrites, usando resultados parciais"
  )
  return "formatResults"
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Cria o sub-grafo de busca de planos
 */
export function createSearchPlansGraph() {
  const workflow = new StateGraph(SearchPlansStateAnnotation)
    // === ADICIONA NÓS ===
    .addNode("initialize", initializeNode)
    .addNode("generateQueries", generateQueriesNode)
    .addNode("retrieveHierarchical", retrieveHierarchicalNode)
    .addNode("fusionResults", fusionResultsNode)
    .addNode("gradeDocuments", gradeDocumentsNode)
    .addNode("rewriteQuery", rewriteQueryNode)
    .addNode("formatResults", formatResultsNode)
    // === DEFINE FLUXO ===
    .addEdge(START, "initialize")
    .addEdge("initialize", "generateQueries")
    .addEdge("generateQueries", "retrieveHierarchical")
    .addEdge("retrieveHierarchical", "fusionResults")
    .addEdge("fusionResults", "gradeDocuments")
    // Edge condicional após grading
    .addConditionalEdges("gradeDocuments", routeAfterGrading, [
      "formatResults",
      "rewriteQuery"
    ])
    // Rewrite → volta para busca
    .addEdge("rewriteQuery", "retrieveHierarchical")
    // Format → END
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
