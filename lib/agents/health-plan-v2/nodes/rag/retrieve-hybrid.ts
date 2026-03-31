/**
 * Retrieve Hybrid - Hybrid Search (BM25 + Vector) with RRF Fusion
 *
 * Combines vector similarity and full-text search for better retrieval.
 * Supports plan_type filtering for scoped retrieval.
 * Falls back to vector-only if FTS returns insufficient results.
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"
import { generateEmbedding } from "@/lib/rag/ingest/embedding-generator"
import { logRagStage } from "@/lib/rag/logging"
import type {
  AdaptiveChunk,
  AdaptiveRetrievalResult
} from "./retrieve-adaptive"

export interface HybridSearchOptions {
  maxChunks?: number
  planType?: string | null
  tagWeights?: Record<string, number>
  fileIds?: string[]
  filterTags?: string[]
  correlationId?: string
}

function createSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function retrieveHybrid(
  query: string,
  assistantId: string,
  options?: HybridSearchOptions
): Promise<AdaptiveRetrievalResult> {
  const maxChunks = options?.maxChunks || 20
  const correlationId = options?.correlationId || crypto.randomUUID()

  const supabase = createSupabaseAdmin()

  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(query)

  // 2. Get file IDs from assistant's collections (if not provided)
  let fileIds = options?.fileIds || []
  if (fileIds.length === 0) {
    const { data: assistantCollections } = await supabase
      .from("assistant_collections")
      .select("collection_id")
      .eq("assistant_id", assistantId)

    const collectionIds =
      assistantCollections?.map(ac => ac.collection_id) || []

    if (collectionIds.length > 0) {
      const { data: collectionFiles } = await supabase
        .from("collection_files")
        .select("file_id")
        .in("collection_id", collectionIds)

      fileIds = collectionFiles?.map(cf => cf.file_id) || []
    }
  }

  if (fileIds.length === 0) {
    return {
      chunks: [],
      queryClassification: {
        tags: [],
        collectionHint: null,
        intent: "informacao_geral",
        planType: null
      },
      selectedCollections: [],
      selectedFiles: [],
      metadata: {
        collectionsConsidered: 0,
        collectionsSelected: 0,
        filesConsidered: 0,
        filesSelected: 0,
        chunksRetrieved: 0
      }
    }
  }

  // 3. Call hybrid RPC
  const tagWeightsJson = options?.tagWeights
    ? JSON.stringify(options.tagWeights)
    : null

  const { data, error } = await (supabase.rpc as any)(
    "match_file_items_hybrid",
    {
      query_embedding: queryEmbedding,
      query_text: query,
      match_count: maxChunks,
      file_ids: fileIds,
      filter_tags: options?.filterTags || null,
      filter_plan_type: options?.planType || null,
      tag_weights: tagWeightsJson,
      rrf_k: 60
    }
  )

  if (error) {
    console.error("[retrieve-hybrid] RPC error:", error)
    return {
      chunks: [],
      queryClassification: {
        tags: [],
        collectionHint: null,
        intent: "informacao_geral",
        planType: null
      },
      selectedCollections: [],
      selectedFiles: [],
      metadata: {
        collectionsConsidered: 0,
        collectionsSelected: 0,
        filesConsidered: 0,
        filesSelected: fileIds.length,
        chunksRetrieved: 0
      }
    }
  }

  // 4. Map results to AdaptiveChunk format
  const chunks: AdaptiveChunk[] = (data || []).map((row: any) => ({
    chunkId: row.chunk_id || row.id,
    content: row.chunk_content || row.content,
    tokens: row.chunk_tokens || row.tokens || 0,
    baseSimilarity: row.base_similarity || row.similarity || 0,
    weightedScore: row.rrf_score || row.weighted_score || row.similarity || 0,
    weight: row.chunk_weight || row.weight || 1.0,
    tags: row.chunk_tags || row.tags || [],
    sectionType: row.section_type || null,
    pageNumber: row.page_number || null,
    documentContext: row.document_context || null,
    fileId: row.file_id,
    fileName: row.file_name || "",
    fileDescription: row.file_description || null,
    collectionId: row.collection_id || null,
    collectionName: row.collection_name || null,
    parentChunkId: row.parent_chunk_id || null
  }))

  // 4b. Resolve parent chunks: if a matched child has a parent,
  // replace its content with the parent's full content for richer LLM context
  const childChunks = chunks.filter(c => c.parentChunkId)
  if (childChunks.length > 0) {
    const parentIds = [...new Set(childChunks.map(c => c.parentChunkId!))]
    const supabase = createSupabaseAdmin()
    const { data: parents } = await supabase
      .from("file_items")
      .select("id, content")
      .in("id", parentIds)

    if (parents && parents.length > 0) {
      const parentMap = new Map(parents.map(p => [p.id, p.content]))
      for (const chunk of chunks) {
        if (chunk.parentChunkId && parentMap.has(chunk.parentChunkId)) {
          chunk.content = parentMap.get(chunk.parentChunkId)!
          chunk.tokens = Math.ceil(chunk.content.length / 4) // rough estimate
        }
      }
      console.log(
        `[retrieve-hybrid] Resolved ${parentIds.length} parent chunks for ${childChunks.length} children`
      )
    }
  }

  logRagStage({
    correlationId,
    stage: "hybrid_search",
    status: "completed",
    chunksProcessed: fileIds.length,
    chunksCreated: chunks.length,
    inputMetadata: {
      query: query.substring(0, 200),
      planTypeFilter: options?.planType || null,
      fileIdsCount: fileIds.length,
      maxChunks
    },
    outputMetadata: {
      chunksReturned: chunks.length,
      topScore: chunks[0]?.weightedScore || 0,
      bottomScore: chunks[chunks.length - 1]?.weightedScore || 0,
      uniqueFiles: new Set(chunks.map(c => c.fileId)).size
    }
  })

  return {
    chunks,
    queryClassification: {
      tags: [],
      collectionHint: null,
      intent: "informacao_geral",
      planType: options?.planType || null
    },
    selectedCollections: [],
    selectedFiles: [],
    metadata: {
      collectionsConsidered: 0,
      collectionsSelected: 0,
      filesConsidered: fileIds.length,
      filesSelected: fileIds.length,
      chunksRetrieved: chunks.length
    }
  }
}
