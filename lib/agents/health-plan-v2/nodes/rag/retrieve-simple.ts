/**
 * Retrieve Simple - Busca Vetorial por Arquivo
 *
 * Implementa busca vetorial com top K chunks POR ARQUIVO:
 * - Busca top 5 chunks de cada arquivo
 * - Agrupa resultados por arquivo
 * - Inclui nome e descrição da coleção e arquivo
 *
 * Usa: match_file_items_enriched RPC
 */

import { createClient } from "@supabase/supabase-js"
import { OpenAIEmbeddings } from "@langchain/openai"
import type { Database } from "@/supabase/types"

// =============================================================================
// Types
// =============================================================================

/**
 * Chunk enriquecido com contexto de arquivo e coleção
 */
export interface EnrichedChunk {
  /** ID do chunk */
  id: string
  /** Conteúdo do chunk */
  content: string
  /** Tokens do chunk */
  tokens: number
  /** Score de similaridade (0-1) */
  similarity: number
  /** Contexto do arquivo */
  file: {
    id: string
    name: string
    description: string
  }
  /** Contexto da coleção (pode ser null se arquivo órfão) */
  collection: {
    id: string
    name: string
    description: string
  } | null
}

/**
 * Resultado da busca por arquivo individual
 */
export interface RetrieveByFileResult {
  /** ID do arquivo */
  fileId: string
  /** Nome do arquivo */
  fileName: string
  /** Descrição do arquivo */
  fileDescription: string
  /** Contexto da coleção */
  collection: {
    id: string
    name: string
    description: string
  } | null
  /** Chunks encontrados neste arquivo */
  chunks: EnrichedChunk[]
  /** Total de chunks recuperados */
  totalChunks: number
}

/**
 * Informações do cliente para grading
 */
export interface ClientInfo {
  age?: number
  city?: string
  state?: string
  budget?: number
  dependents?: Array<{
    age?: number
    relationship?: string
  }>
  preExistingConditions?: string[]
  preferences?: string[]
}

/**
 * Opções para busca simples
 */
export interface RetrieveSimpleOptions {
  /** Query de busca do usuário */
  query: string
  /** IDs dos arquivos para buscar */
  fileIds: string[]
  /** Número máximo de chunks POR ARQUIVO (default: 5) */
  chunksPerFile?: number
  /** Cliente Supabase (opcional - cria um novo se não fornecido) */
  supabaseClient?: ReturnType<typeof createClient<Database>>
  /** Embeddings LangChain (opcional - cria um novo se não fornecido) */
  embeddings?: OpenAIEmbeddings
}

/**
 * Resultado da busca simplificada (agrupado por arquivo)
 */
export interface RetrieveSimpleResult {
  /** Resultados agrupados por arquivo */
  fileResults: RetrieveByFileResult[]
  /** Query original */
  query: string
  /** Metadados da busca */
  metadata: {
    totalChunks: number
    totalFiles: number
    executionTimeMs: number
    filesWithResults: number
  }
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CHUNKS_PER_FILE = 5
const EMBEDDING_MODEL = "text-embedding-3-small"
const PARALLEL_BATCH_SIZE = 10 // Buscar até 10 arquivos em paralelo

// =============================================================================
// Main Function
// =============================================================================

/**
 * Executa busca vetorial por arquivo com contexto enriquecido
 *
 * Busca top K chunks de CADA arquivo individualmente,
 * retornando resultados agrupados por arquivo.
 *
 * @param options - Configurações da busca
 * @returns Chunks enriquecidos agrupados por arquivo
 */
export async function retrieveSimple(
  options: RetrieveSimpleOptions
): Promise<RetrieveSimpleResult> {
  const startTime = Date.now()

  const {
    query,
    fileIds,
    chunksPerFile = DEFAULT_CHUNKS_PER_FILE,
    supabaseClient,
    embeddings: embeddingsClient
  } = options

  console.log("[retrieve-simple] Iniciando busca por arquivo")
  console.log(`[retrieve-simple] Query: "${query.substring(0, 100)}..."`)
  console.log(
    `[retrieve-simple] Arquivos: ${fileIds.length}, Chunks/arquivo: ${chunksPerFile}`
  )

  // Validação básica
  if (!query.trim()) {
    console.warn("[retrieve-simple] Query vazia")
    return createEmptyResult(query)
  }

  if (fileIds.length === 0) {
    console.warn("[retrieve-simple] Nenhum fileId fornecido")
    return createEmptyResult(query)
  }

  // Criar clientes se não fornecidos
  const supabase =
    supabaseClient ||
    createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

  // Criar embeddings com LangChain (aparece no LangSmith)
  const embeddings =
    embeddingsClient ||
    new OpenAIEmbeddings({
      modelName: EMBEDDING_MODEL,
      // Tags para rastreamento no LangSmith
      // @ts-ignore - LangChain aceita tags mas tipagem pode não reconhecer
      tags: ["retrieve-simple", "health-plan-v2", "embedding"]
    })

  try {
    // Gerar embedding da query UMA VEZ (reutilizar para todos os arquivos)
    console.log("[retrieve-simple] Gerando embedding via LangChain...")
    const embedding = await generateEmbedding(embeddings, query)

    // Buscar chunks de cada arquivo em paralelo (em batches)
    console.log("[retrieve-simple] Buscando chunks por arquivo...")
    const fileResults = await searchChunksByFile(
      supabase,
      embedding,
      fileIds,
      chunksPerFile
    )

    const executionTimeMs = Date.now() - startTime

    // Calcular estatísticas
    const totalChunks = fileResults.reduce((sum, f) => sum + f.totalChunks, 0)
    const filesWithResults = fileResults.filter(f => f.totalChunks > 0).length

    console.log(
      `[retrieve-simple] Busca completa: ${totalChunks} chunks em ${fileResults.length} arquivos (${executionTimeMs}ms)`
    )

    return {
      fileResults,
      query,
      metadata: {
        totalChunks,
        totalFiles: fileResults.length,
        executionTimeMs,
        filesWithResults
      }
    }
  } catch (error) {
    console.error("[retrieve-simple] Erro na busca:", error)
    return createEmptyResult(query)
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gera embedding usando LangChain OpenAIEmbeddings (traceado pelo LangSmith)
 */
async function generateEmbedding(
  embeddings: OpenAIEmbeddings,
  text: string
): Promise<number[]> {
  // embedQuery retorna um array de números diretamente
  const embedding = await embeddings.embedQuery(text)
  return embedding
}

/**
 * Tipo de retorno da RPC match_file_items_enriched
 */
interface EnrichedRPCResult {
  chunk_id: string
  chunk_content: string
  chunk_tokens: number
  similarity: number
  file_id: string
  file_name: string
  file_description: string
  collection_id: string | null
  collection_name: string | null
  collection_description: string | null
}

/**
 * Busca chunks para um único arquivo
 */
async function searchChunksForSingleFile(
  supabase: ReturnType<typeof createClient<Database>>,
  embedding: number[],
  fileId: string,
  topK: number
): Promise<RetrieveByFileResult> {
  const { data, error } = await (supabase.rpc as any)(
    "match_file_items_enriched",
    {
      query_embedding: embedding,
      match_count: topK,
      file_ids: [fileId]
    }
  )

  if (error) {
    console.error(`[retrieve-simple] Erro ao buscar arquivo ${fileId}:`, error)
    return createEmptyFileResult(fileId)
  }

  const results = data as EnrichedRPCResult[] | null

  if (!results || results.length === 0) {
    return createEmptyFileResult(fileId)
  }

  // Extrair info do arquivo/coleção do primeiro resultado
  const firstResult = results[0]

  const chunks: EnrichedChunk[] = results.map(row => ({
    id: row.chunk_id,
    content: row.chunk_content,
    tokens: row.chunk_tokens,
    similarity: row.similarity,
    file: {
      id: row.file_id,
      name: row.file_name,
      description: row.file_description
    },
    collection: row.collection_id
      ? {
          id: row.collection_id,
          name: row.collection_name || "",
          description: row.collection_description || ""
        }
      : null
  }))

  return {
    fileId: firstResult.file_id,
    fileName: firstResult.file_name,
    fileDescription: firstResult.file_description,
    collection: firstResult.collection_id
      ? {
          id: firstResult.collection_id,
          name: firstResult.collection_name || "",
          description: firstResult.collection_description || ""
        }
      : null,
    chunks,
    totalChunks: chunks.length
  }
}

/**
 * Busca chunks de múltiplos arquivos em paralelo (com batching)
 */
async function searchChunksByFile(
  supabase: ReturnType<typeof createClient<Database>>,
  embedding: number[],
  fileIds: string[],
  chunksPerFile: number
): Promise<RetrieveByFileResult[]> {
  const results: RetrieveByFileResult[] = []

  // Processar em batches para evitar sobrecarga
  for (let i = 0; i < fileIds.length; i += PARALLEL_BATCH_SIZE) {
    const batch = fileIds.slice(i, i + PARALLEL_BATCH_SIZE)

    console.log(
      `[retrieve-simple] Processando batch ${Math.floor(i / PARALLEL_BATCH_SIZE) + 1}/${Math.ceil(fileIds.length / PARALLEL_BATCH_SIZE)}`
    )

    const batchResults = await Promise.all(
      batch.map(fileId =>
        searchChunksForSingleFile(supabase, embedding, fileId, chunksPerFile)
      )
    )

    results.push(...batchResults)
  }

  return results
}

/**
 * Cria resultado vazio para um arquivo
 */
function createEmptyFileResult(fileId: string): RetrieveByFileResult {
  return {
    fileId,
    fileName: "",
    fileDescription: "",
    collection: null,
    chunks: [],
    totalChunks: 0
  }
}

/**
 * Cria resultado vazio
 */
function createEmptyResult(query: string): RetrieveSimpleResult {
  return {
    fileResults: [],
    query,
    metadata: {
      totalChunks: 0,
      totalFiles: 0,
      executionTimeMs: 0,
      filesWithResults: 0
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Concatena todos os chunks de um arquivo em um texto único
 * Útil para grading do arquivo como unidade
 */
export function concatenateFileChunks(
  fileResult: RetrieveByFileResult
): string {
  if (fileResult.chunks.length === 0) {
    return ""
  }

  const lines: string[] = []

  // Adicionar contexto do arquivo
  if (fileResult.collection) {
    lines.push(`[Operadora: ${fileResult.collection.name}]`)
    if (fileResult.collection.description) {
      lines.push(`Descrição: ${fileResult.collection.description}`)
    }
    lines.push("")
  }

  lines.push(`[Arquivo: ${fileResult.fileName}]`)
  if (fileResult.fileDescription) {
    lines.push(`Descrição: ${fileResult.fileDescription}`)
  }
  lines.push("")
  lines.push("--- CONTEÚDO DO DOCUMENTO ---")
  lines.push("")

  // Concatenar chunks com separador
  for (let i = 0; i < fileResult.chunks.length; i++) {
    const chunk = fileResult.chunks[i]
    lines.push(chunk.content)
    if (i < fileResult.chunks.length - 1) {
      lines.push("")
      lines.push("[...]")
      lines.push("")
    }
  }

  return lines.join("\n")
}

/**
 * Formata contexto enriquecido para prompt de grading
 */
export function formatEnrichedContext(chunk: EnrichedChunk): string {
  const lines: string[] = []

  if (chunk.collection) {
    lines.push(`[Coleção: ${chunk.collection.name}]`)
    lines.push(`Descrição da coleção: ${chunk.collection.description}`)
  }

  lines.push(`[Arquivo: ${chunk.file.name}]`)
  lines.push(`Descrição do arquivo: ${chunk.file.description}`)
  lines.push("")
  lines.push("Conteúdo:")
  lines.push(chunk.content)

  return lines.join("\n")
}

/**
 * Obtém lista de todos os chunks de todos os arquivos (flatten)
 */
export function getAllChunks(
  fileResults: RetrieveByFileResult[]
): EnrichedChunk[] {
  return fileResults.flatMap(f => f.chunks)
}

/**
 * Filtra arquivos sem resultados
 */
export function filterEmptyFiles(
  fileResults: RetrieveByFileResult[]
): RetrieveByFileResult[] {
  return fileResults.filter(f => f.totalChunks > 0)
}
