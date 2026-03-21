import { createClient } from "@supabase/supabase-js"
import { generateEmbedding } from "../ingest/embedding-generator"

export interface SelectedCollection {
  id: string
  name: string
  score: number
}

interface CollectionRow {
  id: string
  name: string
  collection_embedding: number[] | null
  collection_tags: string[]
}

/**
 * Thresholds for adaptive selection
 */
const SIMILARITY_THRESHOLDS = {
  high: 0.75, // High confidence match
  medium: 0.6, // Medium confidence
  low: 0.5 // Minimum to consider
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Select relevant collections by embedding similarity (zero LLM calls)
 */
export async function selectCollections(
  query: string,
  assistantId: string,
  options?: { minSimilarity?: number; maxCollections?: number }
): Promise<SelectedCollection[]> {
  const minSim = options?.minSimilarity ?? SIMILARITY_THRESHOLDS.low
  const maxCols = options?.maxCollections ?? 5

  const supabase = createSupabaseAdmin()

  // Get all collections for this assistant
  const { data: assistantCollections } = await supabase
    .from("assistant_collections")
    .select("collection_id")
    .eq("assistant_id", assistantId)

  const collectionIds = assistantCollections?.map(ac => ac.collection_id) || []

  if (collectionIds.length === 0) {
    return []
  }

  const { data: collections } = await supabase
    .from("collections")
    .select("id, name, collection_embedding, collection_tags")
    .in("id", collectionIds)

  if (!collections || collections.length === 0) {
    return []
  }

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query)

  // Score each collection
  const scored: SelectedCollection[] = (collections as CollectionRow[])
    .filter(c => c.collection_embedding)
    .map(c => ({
      id: c.id,
      name: c.name,
      score: cosineSimilarity(queryEmbedding, c.collection_embedding!)
    }))
    .filter(c => c.score >= minSim)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCols)

  return scored
}

export { SIMILARITY_THRESHOLDS }
