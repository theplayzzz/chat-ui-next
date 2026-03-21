/**
 * Retrieve Adaptive - 3-Layer Filtering Pipeline
 *
 * Orchestrates the Level 3 RAG pipeline:
 * query classification -> collection selection -> file selection -> weighted RPC -> top-20 chunks
 *
 * Layers:
 * 1. classifyQuery - Extract tags, collection hints, intent (GPT-5-mini)
 * 2. selectCollections - Filter by embedding similarity (zero LLM)
 * 3. selectFiles - Filter by embedding similarity + tag boost (zero LLM)
 * 4. Weighted vector search on selected files -> top-20 chunks
 */

import { createClient } from "@supabase/supabase-js"
import { generateEmbedding } from "@/lib/rag/ingest/embedding-generator"
import {
  classifyQuery,
  type QueryClassification
} from "../../intent/query-classifier"
import {
  selectCollections,
  type SelectedCollection
} from "@/lib/rag/search/collection-selector"
import { selectFiles, type SelectedFile } from "@/lib/rag/search/file-selector"

export interface AdaptiveChunk {
  chunkId: string
  content: string
  tokens: number
  baseSimilarity: number
  weightedScore: number
  weight: number
  tags: string[]
  sectionType: string | null
  pageNumber: number | null
  documentContext: string | null
  fileId: string
  fileName: string
  fileDescription: string | null
  collectionId: string | null
  collectionName: string | null
}

export interface AdaptiveRetrievalResult {
  chunks: AdaptiveChunk[]
  queryClassification: QueryClassification
  selectedCollections: SelectedCollection[]
  selectedFiles: SelectedFile[]
  metadata: {
    collectionsConsidered: number
    collectionsSelected: number
    filesConsidered: number
    filesSelected: number
    chunksRetrieved: number
  }
}

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Adaptive retrieval: 3-layer filtering pipeline
 * collection -> file -> chunk
 */
export async function retrieveAdaptive(
  query: string,
  assistantId: string,
  options?: {
    maxChunks?: number
    tagWeights?: Record<string, number>
  }
): Promise<AdaptiveRetrievalResult> {
  const maxChunks = options?.maxChunks ?? 20

  // Layer 1: Classify query
  const queryClassification = await classifyQuery(query)

  // Layer 2: Select collections
  const selectedCollections = await selectCollections(query, assistantId)

  // Layer 3: Select files (filtered to selected collections if any)
  const selectedFiles = await selectFiles(query, assistantId, {
    filterTags:
      queryClassification.tags.length > 0
        ? queryClassification.tags
        : undefined,
    tagBoosts: options?.tagWeights
  })

  // Layer 4: Weighted vector search on selected files
  const fileIds = selectedFiles.map(f => f.id)
  const queryEmbedding = await generateEmbedding(query)

  const supabase = createSupabaseAdmin()
  const tagWeightsJson = options?.tagWeights
    ? JSON.stringify(options.tagWeights)
    : null

  const { data, error } = await supabase.rpc("match_file_items_weighted", {
    query_embedding: queryEmbedding,
    match_count: maxChunks,
    file_ids: fileIds.length > 0 ? fileIds : null,
    filter_tags:
      queryClassification.tags.length > 0 ? queryClassification.tags : null,
    tag_weights: tagWeightsJson
  })

  if (error) {
    console.error("[retrieve-adaptive] RPC error:", error.message)
  }

  const chunks: AdaptiveChunk[] = (data || []).map((row: any) => ({
    chunkId: row.chunk_id,
    content: row.chunk_content,
    tokens: row.chunk_tokens,
    baseSimilarity: row.base_similarity,
    weightedScore: row.weighted_score,
    weight: row.chunk_weight,
    tags: row.chunk_tags || [],
    sectionType: row.section_type,
    pageNumber: row.page_number,
    documentContext: row.document_context,
    fileId: row.file_id,
    fileName: row.file_name,
    fileDescription: row.file_description,
    collectionId: row.collection_id,
    collectionName: row.collection_name
  }))

  return {
    chunks,
    queryClassification,
    selectedCollections,
    selectedFiles,
    metadata: {
      collectionsConsidered: selectedCollections.length,
      collectionsSelected: selectedCollections.length,
      filesConsidered: selectedFiles.length,
      filesSelected: fileIds.length,
      chunksRetrieved: chunks.length
    }
  }
}
