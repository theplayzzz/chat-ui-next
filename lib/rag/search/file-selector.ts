import { createClient } from "@supabase/supabase-js"
import { generateEmbedding } from "../ingest/embedding-generator"

export interface SelectedFile {
  id: string
  name: string
  description: string | null
  tags: string[]
  collectionId: string | null
  collectionName: string | null
  score: number
}

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Select top files by embedding similarity using the match_files_by_embedding RPC
 */
export async function selectFiles(
  query: string,
  assistantId: string,
  options?: {
    maxFiles?: number
    minSimilarity?: number
    filterTags?: string[]
    tagBoosts?: Record<string, number>
  }
): Promise<SelectedFile[]> {
  const maxFiles = options?.maxFiles ?? 10
  const minSimilarity = options?.minSimilarity ?? 0.2
  const filterTags = options?.filterTags ?? null

  const supabase = createSupabaseAdmin()
  const queryEmbedding = await generateEmbedding(query)

  const { data, error } = await supabase.rpc("match_files_by_embedding", {
    query_embedding: queryEmbedding,
    assistant_id: assistantId,
    match_count: maxFiles,
    min_similarity: minSimilarity,
    filter_tags: filterTags
  })

  if (error) {
    console.error("[file-selector] RPC error:", error.message)
    return []
  }

  const files: SelectedFile[] = (data || []).map((row: any) => {
    let score = row.similarity

    // Apply tag boost if specified
    if (options?.tagBoosts && row.file_tags) {
      const maxBoost = Math.max(
        1.0,
        ...row.file_tags
          .filter((t: string) => options.tagBoosts![t])
          .map((t: string) => options.tagBoosts![t])
      )
      score *= maxBoost
    }

    return {
      id: row.file_id,
      name: row.file_name,
      description: row.file_description,
      tags: row.file_tags || [],
      collectionId: row.collection_id,
      collectionName: row.collection_name,
      score
    }
  })

  return files.sort((a, b) => b.score - a.score)
}
