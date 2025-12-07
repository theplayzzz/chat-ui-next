/**
 * Retrieve Simple - Busca Vetorial Simplificada
 *
 * Implementa busca vetorial única com retorno enriquecido:
 * - Nome e descrição da coleção
 * - Nome e descrição do arquivo
 * - Conteúdo do chunk
 *
 * Substitui: generate-queries, retrieve-hierarchical, result-fusion
 * Usa: match_file_items_enriched RPC
 */

import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
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
  /** Número máximo de chunks a retornar (default: 20) */
  topK?: number
  /** Cliente Supabase (opcional - cria um novo se não fornecido) */
  supabaseClient?: ReturnType<typeof createClient<Database>>
  /** Cliente OpenAI (opcional - cria um novo se não fornecido) */
  openaiClient?: OpenAI
}

/**
 * Resultado da busca simplificada
 */
export interface RetrieveSimpleResult {
  /** Chunks enriquecidos encontrados */
  chunks: EnrichedChunk[]
  /** Query original */
  query: string
  /** Metadados da busca */
  metadata: {
    totalChunks: number
    executionTimeMs: number
    fileIdsSearched: number
  }
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TOP_K = 20
const EMBEDDING_MODEL = "text-embedding-3-small"

// =============================================================================
// Main Function
// =============================================================================

/**
 * Executa busca vetorial simplificada com contexto enriquecido
 *
 * @param options - Configurações da busca
 * @returns Chunks enriquecidos com contexto de arquivo e coleção
 */
export async function retrieveSimple(
  options: RetrieveSimpleOptions
): Promise<RetrieveSimpleResult> {
  const startTime = Date.now()

  const {
    query,
    fileIds,
    topK = DEFAULT_TOP_K,
    supabaseClient,
    openaiClient
  } = options

  console.log("[retrieve-simple] Iniciando busca simplificada")
  console.log(`[retrieve-simple] Query: "${query.substring(0, 100)}..."`)
  console.log(`[retrieve-simple] fileIds: ${fileIds.length}, topK: ${topK}`)

  // Validação básica
  if (!query.trim()) {
    console.warn("[retrieve-simple] Query vazia")
    return createEmptyResult(query, fileIds.length)
  }

  if (fileIds.length === 0) {
    console.warn("[retrieve-simple] Nenhum fileId fornecido")
    return createEmptyResult(query, 0)
  }

  // Criar clientes se não fornecidos
  const supabase =
    supabaseClient ||
    createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

  const openai =
    openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    // Gerar embedding da query
    console.log("[retrieve-simple] Gerando embedding...")
    const embedding = await generateEmbedding(openai, query)

    // Buscar chunks enriquecidos
    console.log("[retrieve-simple] Buscando chunks...")
    const chunks = await searchEnrichedChunks(
      supabase,
      embedding,
      fileIds,
      topK
    )

    const executionTimeMs = Date.now() - startTime

    console.log(
      `[retrieve-simple] Busca completa: ${chunks.length} chunks em ${executionTimeMs}ms`
    )

    return {
      chunks,
      query,
      metadata: {
        totalChunks: chunks.length,
        executionTimeMs,
        fileIdsSearched: fileIds.length
      }
    }
  } catch (error) {
    console.error("[retrieve-simple] Erro na busca:", error)
    return createEmptyResult(query, fileIds.length)
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gera embedding usando OpenAI
 */
async function generateEmbedding(
  openai: OpenAI,
  text: string
): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  })

  return response.data[0].embedding
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
 * Busca chunks enriquecidos usando RPC
 */
async function searchEnrichedChunks(
  supabase: ReturnType<typeof createClient<Database>>,
  embedding: number[],
  fileIds: string[],
  topK: number
): Promise<EnrichedChunk[]> {
  // Usar cast para contornar tipos gerados que podem estar desatualizados
  const { data, error } = await (supabase.rpc as any)(
    "match_file_items_enriched",
    {
      query_embedding: embedding,
      match_count: topK,
      file_ids: fileIds
    }
  )

  if (error) {
    console.error("[retrieve-simple] Erro na RPC:", error)
    throw error
  }

  const results = data as EnrichedRPCResult[] | null

  if (!results || results.length === 0) {
    console.log("[retrieve-simple] Nenhum resultado encontrado")
    return []
  }

  // Mapear para EnrichedChunk
  return results.map(row => ({
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
}

/**
 * Cria resultado vazio
 */
function createEmptyResult(
  query: string,
  fileIdsSearched: number
): RetrieveSimpleResult {
  return {
    chunks: [],
    query,
    metadata: {
      totalChunks: 0,
      executionTimeMs: 0,
      fileIdsSearched
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Converte EnrichedChunks para formato compatível com gradeDocuments
 * Inclui contexto de arquivo/coleção no content para avaliação
 */
export function enrichedChunksToGradableDocuments(
  chunks: EnrichedChunk[]
): Array<{
  id: string
  content: string
  score: number
  metadata: {
    fileId: string
    fileName: string
    fileDescription: string
    collectionId?: string
    collectionName?: string
    collectionDescription?: string
  }
  rrfScore: number
  appearances: number
  queryMatches: string[]
}> {
  return chunks.map(chunk => ({
    id: chunk.id,
    // Incluir contexto no content para o grading ter acesso
    content: chunk.content,
    score: chunk.similarity,
    metadata: {
      fileId: chunk.file.id,
      fileName: chunk.file.name,
      fileDescription: chunk.file.description,
      ...(chunk.collection && {
        collectionId: chunk.collection.id,
        collectionName: chunk.collection.name,
        collectionDescription: chunk.collection.description
      })
    },
    // Campos de compatibilidade com FusedDocument
    rrfScore: chunk.similarity,
    appearances: 1,
    queryMatches: []
  }))
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
 * Formata múltiplos chunks para prompt de grading
 */
export function formatChunksForGrading(
  chunks: EnrichedChunk[]
): Array<{ id: string; formattedContent: string; similarity: number }> {
  return chunks.map(chunk => ({
    id: chunk.id,
    formattedContent: formatEnrichedContext(chunk),
    similarity: chunk.similarity
  }))
}
