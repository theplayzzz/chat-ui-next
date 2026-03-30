/**
 * Search Plans Graph - Sub-grafo RAG com Busca por Arquivo
 *
 * Implementa busca vetorial POR ARQUIVO:
 * - Busca top 5 chunks de CADA arquivo
 * - Grading do arquivo como UNIDADE (não chunk por chunk)
 * - Retorno de análise textual formatada
 *
 * Fluxo: initialize → retrieveByFile → gradeByFile → formatAnalysisText
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

import { StateGraph, Annotation, END, START } from "@langchain/langgraph"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"
import { traceable } from "langsmith/traceable"

// Import dos nós RAG (Level 1)
import {
  retrieveSimple,
  type RetrieveByFileResult,
  type ClientInfo
} from "../nodes/rag/retrieve-simple"
import {
  gradeByFile,
  type FileGradingResult,
  type GradeByFileResult
} from "../nodes/rag/grade-documents"
import {
  gradeByCollection,
  type CollectionAnalysisResult,
  type GradeByCollectionResult
} from "../nodes/rag/grade-by-collection"

// Import dos nós RAG (Level 3)
import {
  classifyQuery,
  type QueryClassification
} from "../intent/query-classifier"
import {
  selectCollections,
  type SelectedCollection
} from "@/lib/rag/search/collection-selector"
import { selectFiles, type SelectedFile } from "@/lib/rag/search/file-selector"
import {
  retrieveAdaptive,
  type AdaptiveChunk,
  type AdaptiveRetrievalResult
} from "../nodes/rag/retrieve-adaptive"
import { rerankChunks, type RerankResult } from "../nodes/rag/rerank-chunks"
import { retrieveHybrid } from "../nodes/rag/retrieve-hybrid"
import { rewriteQuery } from "../nodes/rag/rewrite-query"

// Types
import type { PartialClientInfo } from "../../health-plan-v2/types"

// =============================================================================
// Feature Flag
// =============================================================================

/**
 * Feature flag para habilitar pipeline Level 3
 * Set USE_RAG_LEVEL3=true em env para ativar
 */
const USE_RAG_LEVEL3 = process.env.USE_RAG_LEVEL3 === "true"
const USE_CRAG = process.env.USE_CRAG === "true"

// =============================================================================
// State Annotation
// =============================================================================

/**
 * Estado do sub-grafo de busca de planos por arquivo
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
  /** Mensagens da conversa para contexto */
  conversationMessages: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === CONFIGURAÇÃO ===
  /** Modelo para grading (default: gpt-5-mini) */
  ragModel: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "gpt-5.1-mini"
  }),
  /** IDs dos arquivos para buscar */
  fileIds: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  /** Chunks por arquivo (default: 5) */
  chunksPerFile: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 5
  }),

  // === BUSCA POR ARQUIVO ===
  /** Resultados da busca agrupados por arquivo */
  fileResults: Annotation<RetrieveByFileResult[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === GRADING POR ARQUIVO ===
  /** Resultados do grading por arquivo */
  fileGradingResults: Annotation<FileGradingResult[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === GRADING POR COLLECTION (FASE 6E) ===
  /** Análises por collection com planos identificados */
  collectionAnalyses: Annotation<CollectionAnalysisResult[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  // === LEVEL 3 PIPELINE ===
  /** Query classification result */
  queryClassification: Annotation<QueryClassification | null>({
    reducer: (_, y) => y,
    default: () => null
  }),
  /** Selected collections from pre-filtering */
  selectedCollections: Annotation<SelectedCollection[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  /** Selected files from pre-filtering */
  selectedFiles: Annotation<SelectedFile[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  /** Reranked chunks after LLM reranking */
  rerankedChunks: Annotation<AdaptiveChunk[]>({
    reducer: (_, y) => y,
    default: () => []
  }),
  /** RAG pipeline level used */
  ragLevel: Annotation<"level1" | "level3">({
    reducer: (_, y) => y,
    default: () => "level1"
  }),
  /** Plan type filter for scoped retrieval */
  planType: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null
  }),
  /** CRAG: retry count (max 1) */
  retryCount: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0
  }),
  /** CRAG: original query before rewrite */
  originalQuery: Annotation<string>({
    reducer: (_, y) => y,
    default: () => ""
  }),

  // === OUTPUT ===
  /** Texto formatado com todas as análises */
  analysisText: Annotation<string>({
    reducer: (_, y) => y,
    default: () => ""
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
  /** Total de arquivos processados */
  totalFiles: number
  /** Arquivos com resultados */
  filesWithResults: number
  /** Total de chunks recuperados */
  totalChunks: number
  /** Modelo usado para grading */
  ragModel: string
  /** Tempo de execução em ms */
  executionTimeMs: number
  /** Stats do grading por arquivo */
  gradingStats: {
    highRelevance: number
    mediumRelevance: number
    lowRelevance: number
    irrelevant: number
  }
  /** Stats da análise por collection (Fase 6E) */
  collectionStats?: {
    totalCollections: number
    totalPlansIdentified: number
    highRelevancePlans: number
    mediumRelevancePlans: number
    lowRelevancePlans: number
  }
  /** CRAG: whether query was retried after rewrite */
  cragRetried?: boolean
  /** CRAG: original query before rewrite */
  originalQuery?: string
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
 * Nó: Busca Vetorial por Arquivo
 *
 * Busca top K chunks de CADA arquivo individualmente
 */
async function retrieveByFileNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] Buscando chunks por arquivo...")

  if (state.fileIds.length === 0) {
    console.log("[search-plans-graph] Nenhum arquivo para buscar")
    return { fileResults: [] }
  }

  console.log(
    `[search-plans-graph] Query: "${state.userQuery.substring(0, 100)}..."`
  )
  console.log(
    `[search-plans-graph] Arquivos: ${state.fileIds.length}, Chunks/arquivo: ${state.chunksPerFile}`
  )

  const result = await retrieveSimple({
    query: state.userQuery,
    fileIds: state.fileIds,
    chunksPerFile: state.chunksPerFile
  })

  console.log(
    `[search-plans-graph] Recuperados ${result.metadata.totalChunks} chunks de ${result.metadata.filesWithResults} arquivos`
  )

  return { fileResults: result.fileResults }
}

/**
 * Nó: Grading por Arquivo como Unidade
 *
 * Avalia cada arquivo como um todo, não chunk por chunk
 */
async function gradeByFileNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] Avaliando arquivos...")

  if (state.fileResults.length === 0) {
    return {
      fileGradingResults: [],
      analysisText: "Nenhum arquivo encontrado para análise."
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

  const result = await gradeByFile(
    state.fileResults,
    clientInfo,
    state.conversationMessages,
    {
      model: state.ragModel,
      parallelBatchSize: 3
    }
  )

  console.log(
    `[search-plans-graph] Grading: ${result.stats.highRelevance} alta, ${result.stats.mediumRelevance} média, ${result.stats.lowRelevance} baixa`
  )

  return {
    fileGradingResults: result.fileGradingResults,
    analysisText: result.analysisText
  }
}

/**
 * Nó: Grading por Collection (Fase 6E)
 *
 * Analisa collections como unidade para identificar planos REAIS
 */
async function gradeByCollectionNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] Analisando por collection (Fase 6E)...")

  if (state.fileResults.length === 0) {
    return {
      collectionAnalyses: [],
      analysisText: "Nenhum arquivo encontrado para análise."
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

  // Chamar gradeByCollection com análises anteriores
  const result = await gradeByCollection(
    state.fileResults,
    state.fileGradingResults,
    clientInfo,
    state.conversationMessages,
    {
      model: state.ragModel,
      parallelBatchSize: 2
    }
  )

  console.log(
    `[search-plans-graph] Collection analysis: ${result.stats.totalPlansIdentified} planos em ${result.stats.totalCollections} collections`
  )

  return {
    collectionAnalyses: result.collectionAnalyses,
    analysisText: result.consolidatedAnalysisText
  }
}

/**
 * Nó: Formatar Resultados Finais
 */
async function formatResultsNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] Formatando resultados...")

  // Calcular stats
  const gradingStats = {
    highRelevance: state.fileGradingResults.filter(f => f.relevance === "high")
      .length,
    mediumRelevance: state.fileGradingResults.filter(
      f => f.relevance === "medium"
    ).length,
    lowRelevance: state.fileGradingResults.filter(f => f.relevance === "low")
      .length,
    irrelevant: state.fileGradingResults.filter(
      f => f.relevance === "irrelevant"
    ).length
  }

  // Calcular total de chunks
  const totalChunks = state.fileResults.reduce(
    (sum, f) => sum + f.totalChunks,
    0
  )
  const filesWithResults = state.fileResults.filter(
    f => f.totalChunks > 0
  ).length

  // Calcular stats de collection (Fase 6E)
  const collectionStats = {
    totalCollections: state.collectionAnalyses?.length || 0,
    totalPlansIdentified:
      state.collectionAnalyses?.reduce((sum, c) => sum + c.totalPlans, 0) || 0,
    highRelevancePlans:
      state.collectionAnalyses?.reduce(
        (sum, c) =>
          sum +
          c.identifiedPlans.filter(p => p.clientRelevance === "high").length,
        0
      ) || 0,
    mediumRelevancePlans:
      state.collectionAnalyses?.reduce(
        (sum, c) =>
          sum +
          c.identifiedPlans.filter(p => p.clientRelevance === "medium").length,
        0
      ) || 0,
    lowRelevancePlans:
      state.collectionAnalyses?.reduce(
        (sum, c) =>
          sum +
          c.identifiedPlans.filter(p => p.clientRelevance === "low").length,
        0
      ) || 0
  }

  const searchMetadata: SearchMetadata = {
    query: state.userQuery,
    totalFiles: state.fileResults.length,
    filesWithResults,
    totalChunks,
    ragModel: state.ragModel,
    executionTimeMs: 0, // Será calculado no invoke
    gradingStats,
    collectionStats,
    cragRetried: state.retryCount > 0,
    originalQuery: state.originalQuery || undefined
  }

  const relevantCount =
    gradingStats.highRelevance +
    gradingStats.mediumRelevance +
    gradingStats.lowRelevance

  console.log(
    `[search-plans-graph] Busca concluída: ${relevantCount} arquivos relevantes, ${collectionStats.totalPlansIdentified} planos identificados`
  )

  return {
    searchMetadata
  }
}

// =============================================================================
// Level 3 Pipeline Nodes
// =============================================================================

/**
 * Nó: Classify Query (Level 3)
 * Extracts tags, collection hints, and intent from the user query
 */
async function classifyQueryNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] [L3] Classifying query...")
  const classification = await classifyQuery(state.userQuery)
  console.log(
    `[search-plans-graph] [L3] Tags: ${classification.tags.join(", ")}, Intent: ${classification.intent}`
  )
  return { queryClassification: classification, ragLevel: "level3" }
}

/**
 * Nó: Select Collections (Level 3)
 * Filters collections by embedding similarity (zero LLM calls)
 */
async function selectCollectionsNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] [L3] Selecting collections...")
  const collections = await selectCollections(
    state.userQuery,
    state.assistantId
  )
  console.log(
    `[search-plans-graph] [L3] Selected ${collections.length} collections`
  )
  return { selectedCollections: collections }
}

/**
 * Nó: Select Files (Level 3)
 * Selects top files via RPC with tag boost
 */
async function selectFilesNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] [L3] Selecting files...")
  const tags = state.queryClassification?.tags || []
  const files = await selectFiles(state.userQuery, state.assistantId, {
    filterTags: tags.length > 0 ? tags : undefined
  })
  console.log(`[search-plans-graph] [L3] Selected ${files.length} files`)

  // Also set fileIds for downstream grading nodes
  const fileIds = files.map(f => f.id)
  return { selectedFiles: files, fileIds }
}

/**
 * Nó: Retrieve Adaptive (Level 3)
 * Weighted vector search on selected files -> top-20 chunks
 */
async function retrieveAdaptiveNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] [L3] Retrieving adaptive chunks...")
  const result = await retrieveAdaptive(state.userQuery, state.assistantId, {
    maxChunks: 20
  })
  console.log(
    `[search-plans-graph] [L3] Retrieved ${result.chunks.length} adaptive chunks`
  )

  // Convert adaptive chunks to fileResults for downstream grading compatibility
  const fileMap = new Map<string, RetrieveByFileResult>()
  for (const chunk of result.chunks) {
    if (!fileMap.has(chunk.fileId)) {
      fileMap.set(chunk.fileId, {
        fileId: chunk.fileId,
        fileName: chunk.fileName,
        fileDescription: chunk.fileDescription || "",
        collection: chunk.collectionId
          ? {
              id: chunk.collectionId,
              name: chunk.collectionName || "",
              description: ""
            }
          : null,
        chunks: [],
        totalChunks: 0
      })
    }
    const fileResult = fileMap.get(chunk.fileId)!
    fileResult.chunks.push({
      id: chunk.chunkId,
      content: chunk.content,
      tokens: chunk.tokens,
      similarity: chunk.baseSimilarity,
      file: {
        id: chunk.fileId,
        name: chunk.fileName,
        description: chunk.fileDescription || ""
      },
      collection: chunk.collectionId
        ? {
            id: chunk.collectionId,
            name: chunk.collectionName || "",
            description: ""
          }
        : null
    })
    fileResult.totalChunks = fileResult.chunks.length
  }

  return {
    fileResults: Array.from(fileMap.values()),
    rerankedChunks: result.chunks
  }
}

/**
 * Nó: Rerank Chunks (Level 3)
 * Re-rank top-20 -> top-8 using GPT-5-mini
 */
async function rerankChunksNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] [L3] Reranking chunks...")

  const clientProfile = state.clientInfo
    ? (state.clientInfo as Record<string, unknown>)
    : undefined

  const result = await rerankChunks(
    state.rerankedChunks || [],
    state.userQuery,
    clientProfile,
    8
  )

  console.log(
    `[search-plans-graph] [L3] Reranked: ${result.originalCount} -> ${result.chunks.length} chunks`
  )

  return { rerankedChunks: result.chunks }
}

/**
 * Nó: Retrieve Hybrid (Level 3 - Hybrid Search)
 * BM25 + Vector with RRF fusion, supports plan_type filtering
 */
async function retrieveHybridNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] [L3] Retrieving hybrid chunks...")
  const planType = state.queryClassification?.planType || state.planType || null

  const result = await retrieveHybrid(state.userQuery, state.assistantId, {
    maxChunks: 20,
    planType,
    fileIds: state.fileIds.length > 0 ? state.fileIds : undefined
  })

  console.log(
    `[search-plans-graph] [L3] Hybrid retrieved ${result.chunks.length} chunks`
  )

  // Convert to fileResults for downstream grading (same pattern as retrieveAdaptiveNode)
  const fileMap = new Map<string, RetrieveByFileResult>()
  for (const chunk of result.chunks) {
    if (!fileMap.has(chunk.fileId)) {
      fileMap.set(chunk.fileId, {
        fileId: chunk.fileId,
        fileName: chunk.fileName,
        fileDescription: chunk.fileDescription || "",
        collection: chunk.collectionId
          ? {
              id: chunk.collectionId,
              name: chunk.collectionName || "",
              description: ""
            }
          : null,
        chunks: [],
        totalChunks: 0
      })
    }
    const fileResult = fileMap.get(chunk.fileId)!
    fileResult.chunks.push({
      id: chunk.chunkId,
      content: chunk.content,
      tokens: chunk.tokens,
      similarity: chunk.baseSimilarity,
      file: {
        id: chunk.fileId,
        name: chunk.fileName,
        description: chunk.fileDescription || ""
      },
      collection: chunk.collectionId
        ? {
            id: chunk.collectionId,
            name: chunk.collectionName || "",
            description: ""
          }
        : null
    })
    fileResult.totalChunks = fileResult.chunks.length
  }

  return {
    fileResults: Array.from(fileMap.values()),
    rerankedChunks: result.chunks,
    planType
  }
}

/**
 * Nó: Should Retry (CRAG - Corrective RAG)
 * Evaluates if all results are irrelevant and rewrites query for retry
 */
async function shouldRetryNode(
  state: SearchPlansState
): Promise<Partial<SearchPlansState>> {
  console.log("[search-plans-graph] [CRAG] Evaluating retry...")
  const allIrrelevant = state.fileGradingResults.every(
    f => f.relevance === "irrelevant"
  )

  if (allIrrelevant && state.retryCount === 0) {
    console.log(
      "[search-plans-graph] [CRAG] All results irrelevant, rewriting query..."
    )
    const rewritten = await rewriteQuery(
      state.userQuery,
      state.fileGradingResults,
      state.clientInfo as Record<string, unknown>
    )
    console.log(
      `[search-plans-graph] [CRAG] Rewritten: "${rewritten.substring(0, 100)}..."`
    )
    return {
      userQuery: rewritten,
      originalQuery: state.userQuery,
      retryCount: 1
    }
  }

  return {}
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Cria o sub-grafo de busca de planos por arquivo
 *
 * Level 1 (default):
 *   START -> initialize -> retrieveByFile -> gradeByFile -> gradeByCollection -> formatResults -> END
 *
 * Level 3 (USE_RAG_LEVEL3=true):
 *   START -> classifyQuery -> selectCollections -> selectFiles -> retrieveAdaptive -> rerankChunks -> gradeByFile -> gradeByCollection -> formatResults -> END
 */
export function createSearchPlansGraph() {
  if (USE_RAG_LEVEL3) {
    console.log("[search-plans-graph] Using RAG Level 3 pipeline")
    const workflow = new StateGraph(SearchPlansStateAnnotation)
      // Level 3 nodes
      .addNode("classifyQuery", classifyQueryNode)
      .addNode("selectCollections", selectCollectionsNode)
      .addNode("selectFiles", selectFilesNode)
      .addNode("retrieveHybrid", retrieveHybridNode)
      .addNode("rerankChunks", rerankChunksNode)
      .addNode("gradeByFile", gradeByFileNode)
      .addNode("gradeByCollection", gradeByCollectionNode)
      .addNode("formatResults", formatResultsNode)
      // Level 3 flow
      .addEdge(START, "classifyQuery")
      .addEdge("classifyQuery", "selectCollections")
      .addEdge("selectCollections", "selectFiles")
      .addEdge("selectFiles", "retrieveHybrid")
      .addEdge("retrieveHybrid", "rerankChunks")
      .addEdge("rerankChunks", "gradeByFile")

    if (USE_CRAG) {
      console.log("[search-plans-graph] CRAG self-correcting loop enabled")
      workflow
        .addNode("shouldRetry", shouldRetryNode)
        .addConditionalEdges("gradeByFile", (state: SearchPlansState) => {
          const allIrrelevant = state.fileGradingResults.every(
            f => f.relevance === "irrelevant"
          )
          if (allIrrelevant && state.retryCount === 0) return "shouldRetry"
          return "gradeByCollection"
        })
        .addEdge("shouldRetry", "retrieveHybrid")
    } else {
      workflow.addEdge("gradeByFile", "gradeByCollection")
    }

    workflow
      .addEdge("gradeByCollection", "formatResults")
      .addEdge("formatResults", END)

    return workflow
  }

  // Level 1 (default)
  const workflow = new StateGraph(SearchPlansStateAnnotation)
    // Adiciona nós
    .addNode("initialize", initializeNode)
    .addNode("retrieveByFile", retrieveByFileNode)
    .addNode("gradeByFile", gradeByFileNode)
    .addNode("gradeByCollection", gradeByCollectionNode)
    .addNode("formatResults", formatResultsNode)
    // Define fluxo linear com Fase 6E
    // START -> initialize -> retrieveByFile -> gradeByFile -> gradeByCollection -> formatResults -> END
    .addEdge(START, "initialize")
    .addEdge("initialize", "retrieveByFile")
    .addEdge("retrieveByFile", "gradeByFile")
    .addEdge("gradeByFile", "gradeByCollection")
    .addEdge("gradeByCollection", "formatResults")
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
 * Resultado da invocação do grafo
 */
export interface SearchPlansGraphResult {
  /** Resultados do grading por arquivo */
  fileGradingResults: FileGradingResult[]
  /** Análises por collection (Fase 6E) */
  collectionAnalyses: CollectionAnalysisResult[]
  /** Texto formatado com todas as análises */
  analysisText: string
  /** Metadados da busca */
  metadata: SearchMetadata | null
}

/**
 * Invoca o grafo de busca de planos por arquivo (com tracing LangSmith)
 */
export const invokeSearchPlansGraph = traceable(
  async (params: {
    assistantId: string
    userQuery: string
    clientInfo?: PartialClientInfo
    conversationMessages?: string[]
    ragModel?: string
    chunksPerFile?: number
  }): Promise<SearchPlansGraphResult> => {
    const startTime = Date.now()

    const result = await compiledSearchPlansGraph.invoke({
      assistantId: params.assistantId,
      userQuery: params.userQuery,
      clientInfo: params.clientInfo || {},
      conversationMessages: params.conversationMessages || [],
      ragModel: params.ragModel || "gpt-5.1-mini",
      chunksPerFile: params.chunksPerFile || 5
    })

    // Atualizar tempo de execução
    if (result.searchMetadata) {
      result.searchMetadata.executionTimeMs = Date.now() - startTime
    }

    return {
      fileGradingResults: result.fileGradingResults,
      collectionAnalyses: result.collectionAnalyses || [],
      analysisText: result.analysisText,
      metadata: result.searchMetadata
    }
  },
  {
    name: "search-plans-graph",
    run_type: "chain",
    tags: ["health-plan-v2", "rag", "search-plans-graph"],
    metadata: { component: "sub-graph", version: "2.0.0" }
  }
)

// =============================================================================
// Legacy Types (para compatibilidade)
// =============================================================================

/**
 * @deprecated Use FileGradingResult
 */
export interface GradedChunk {
  id: string
  content: string
  tokens: number
  similarity: number
  file: {
    id: string
    name: string
    description: string
  }
  collection: {
    id: string
    name: string
    description: string
  } | null
  gradeResult: {
    documentId: string
    score: "relevant" | "partially_relevant" | "irrelevant"
    reason: string
  }
  isRelevant: boolean
}
