/**
 * Migration Script: Generate file-level embeddings
 *
 * For each file:
 * 1. Generate file_embedding from name + description + tags
 * 2. Infer file_tags from chunk tags
 * 3. Set ingestion_status = 'done'
 *
 * Usage: npx ts-node scripts/migrate-file-embeddings.ts
 * Must run AFTER migrate-chunks-level3.ts
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

  // Get files without embeddings
  const { data: files, error } = await supabase
    .from("files")
    .select("id, name, description")
    .is("file_embedding", null)

  if (error) {
    console.error("Query error:", error.message)
    process.exit(1)
  }

  console.log(`Found ${files?.length || 0} files needing embeddings`)

  for (const file of files || []) {
    try {
      // Get chunk tags for this file
      const { data: chunks } = await supabase
        .from("file_items")
        .select("tags")
        .eq("file_id", file.id)

      // Aggregate tags
      const tagCounts = new Map<string, number>()
      for (const chunk of chunks || []) {
        for (const tag of chunk.tags || []) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        }
      }
      const fileTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)

      // Generate file embedding
      const { generateFileEmbedding } = await import("../lib/rag/ingest/embedding-generator")
      const embedding = await generateFileEmbedding(file.name, file.description, fileTags)

      // Update file
      await supabase
        .from("files")
        .update({
          file_embedding: embedding,
          file_tags: fileTags,
          ingestion_status: "done"
        })
        .eq("id", file.id)

      console.log(`Updated file: ${file.name} (tags: ${fileTags.join(", ")})`)
    } catch (err) {
      console.error(`Error processing file ${file.id}:`, err)
    }
  }

  console.log("File embedding migration complete.")
}

main().catch(console.error)
