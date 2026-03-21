/**
 * Migration Script: Generate collection-level embeddings
 *
 * For each collection:
 * 1. Infer collection_tags from aggregated file_tags
 * 2. Generate collection_embedding
 *
 * Usage: npx ts-node scripts/migrate-collection-embeddings.ts
 * Must run AFTER migrate-file-embeddings.ts
 */

import { createClient } from "@supabase/supabase-js"

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Get collections without embeddings
  const { data: collections, error } = await supabase
    .from("collections")
    .select("id, name, description")
    .is("collection_embedding", null)

  if (error) {
    console.error("Query error:", error.message)
    process.exit(1)
  }

  console.log(`Found ${collections?.length || 0} collections needing embeddings`)

  for (const collection of collections || []) {
    try {
      // Get files in this collection
      const { data: collectionFiles } = await supabase
        .from("collection_files")
        .select("file_id")
        .eq("collection_id", collection.id)

      const fileIds = collectionFiles?.map(cf => cf.file_id) || []

      if (fileIds.length === 0) {
        console.log(`Skipping empty collection: ${collection.name}`)
        continue
      }

      // Get file_tags from all files
      const { data: files } = await supabase
        .from("files")
        .select("file_tags")
        .in("id", fileIds)

      // Aggregate tags
      const tagCounts = new Map<string, number>()
      for (const file of files || []) {
        for (const tag of file.file_tags || []) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        }
      }
      const collectionTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)

      // Generate collection embedding
      const { generateCollectionEmbedding } = await import("../lib/rag/ingest/embedding-generator")
      const embedding = await generateCollectionEmbedding(
        collection.name,
        collection.description,
        collectionTags
      )

      // Update collection
      await supabase
        .from("collections")
        .update({
          collection_embedding: embedding,
          collection_tags: collectionTags
        })
        .eq("id", collection.id)

      console.log(`Updated collection: ${collection.name} (tags: ${collectionTags.join(", ")})`)
    } catch (err) {
      console.error(`Error processing collection ${collection.id}:`, err)
    }
  }

  console.log("Collection embedding migration complete.")
}

main().catch(console.error)
