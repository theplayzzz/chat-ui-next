/**
 * Migration Script: Enrich existing chunks with Level 3 metadata
 *
 * For each chunk without tags:
 * 1. Infer tag via tag-inferencer
 * 2. Generate document_context via contextual-retrieval
 * 3. Regenerate embedding (content + context)
 *
 * Usage: npx ts-node scripts/migrate-chunks-level3.ts
 *
 * Environment: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

import { createClient } from "@supabase/supabase-js"

const BATCH_SIZE = 50
const RATE_LIMIT_MS = 1000

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Count chunks needing migration
  const { count } = await supabase
    .from("file_items")
    .select("id", { count: "exact", head: true })
    .or("tags.eq.{},tags.is.null")

  console.log(`Found ${count || 0} chunks needing migration`)

  if (!count || count === 0) {
    console.log("No chunks to migrate. Done!")
    return
  }

  const estimatedCost = (count * 0.001).toFixed(2)
  console.log(`Estimated cost: ~$${estimatedCost} (${count} chunks)`)
  console.log("Starting migration in 5 seconds... (Ctrl+C to cancel)")
  await new Promise(r => setTimeout(r, 5000))

  let processed = 0
  let offset = 0

  while (true) {
    // Get batch of chunks
    const { data: chunks, error } = await supabase
      .from("file_items")
      .select("id, content, file_id")
      .or("tags.eq.{},tags.is.null")
      .range(offset, offset + BATCH_SIZE - 1)
      .order("created_at")

    if (error) {
      console.error("Query error:", error.message)
      break
    }

    if (!chunks || chunks.length === 0) break

    // Get file info for context generation
    const fileIds = [...new Set(chunks.map(c => c.file_id))]
    const { data: files } = await supabase
      .from("files")
      .select("id, name, description")
      .in("id", fileIds)

    const fileMap = new Map(files?.map(f => [f.id, f]) || [])

    // Process batch
    for (const chunk of chunks) {
      try {
        const file = fileMap.get(chunk.file_id)
        const fileName = file?.name || "Unknown"
        const fileDesc = file?.description || ""

        // Lazy imports to handle module resolution
        const { inferChunkTag } = await import("../lib/rag/ingest/tag-inferencer")
        const { generateContextForChunk } = await import("../lib/rag/ingest/contextual-retrieval")
        const { generateChunkEmbedding } = await import("../lib/rag/ingest/embedding-generator")

        // 1. Infer tag
        const tag = await inferChunkTag(chunk.content)

        // 2. Generate context
        const context = await generateContextForChunk(
          chunk.content,
          fileName,
          fileDesc
        )

        // 3. Regenerate embedding with context
        const embedding = await generateChunkEmbedding(chunk.content, context)

        // Update chunk
        await supabase
          .from("file_items")
          .update({
            tags: [tag],
            document_context: context,
            openai_embedding: embedding
          })
          .eq("id", chunk.id)

        processed++
      } catch (err) {
        console.error(`Error processing chunk ${chunk.id}:`, err)
      }
    }

    console.log(`Processed ${processed}/${count} chunks`)

    // Rate limiting
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    offset += BATCH_SIZE
  }

  console.log(`Migration complete. ${processed} chunks enriched.`)
}

main().catch(console.error)
