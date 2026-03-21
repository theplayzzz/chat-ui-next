import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { smartChunk } from "@/lib/rag/ingest/smart-chunker"
import { generateContextForChunk } from "@/lib/rag/ingest/contextual-retrieval"
import { inferChunkTag } from "@/lib/rag/ingest/tag-inferencer"
import { generateChunkEmbedding } from "@/lib/rag/ingest/embedding-generator"

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  try {
    const { fileId, chunkSize, chunkOverlap } = await request.json()

    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    // Get file info
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .single()

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Get existing chunks to extract full text
    const { data: existingChunks } = await supabase
      .from("file_items")
      .select("content")
      .eq("file_id", fileId)
      .order("created_at", { ascending: true })

    if (!existingChunks || existingChunks.length === 0) {
      return NextResponse.json(
        { error: "No existing chunks found" },
        { status: 400 }
      )
    }

    const fullText = existingChunks.map(c => c.content).join("\n")

    // Delete old chunks
    await supabase.from("file_items").delete().eq("file_id", fileId)

    // Re-chunk
    const newChunks = await smartChunk(fullText, {
      chunkSize: chunkSize || 3000,
      chunkOverlap: chunkOverlap || 200
    })

    // Process each chunk with enrichment
    const BATCH_SIZE = 10
    let totalTokens = 0

    for (let i = 0; i < newChunks.length; i += BATCH_SIZE) {
      const batch = newChunks.slice(i, i + BATCH_SIZE)

      const enriched = await Promise.all(
        batch.map(async chunk => {
          const [context, tag, embedding] = await Promise.all([
            generateContextForChunk(
              chunk.content,
              file.name,
              file.description || ""
            ).catch(() => null),
            inferChunkTag(chunk.content).catch(() => null),
            generateChunkEmbedding(chunk.content, null)
          ])

          const tokens = Math.ceil(chunk.content.length / 4)
          totalTokens += tokens

          return {
            file_id: fileId,
            user_id: file.user_id,
            content: chunk.content,
            tokens,
            openai_embedding: embedding,
            section_type: chunk.section_type,
            tags: tag ? [tag] : [],
            weight: 1.0,
            page_number: chunk.page_number,
            document_context: context
          }
        })
      )

      await supabase.from("file_items").insert(enriched)
    }

    // Update file metadata
    await supabase
      .from("files")
      .update({
        tokens: totalTokens,
        chunk_size: chunkSize || 3000,
        chunk_overlap: chunkOverlap || 200
      })
      .eq("id", fileId)

    return NextResponse.json({
      success: true,
      chunksCreated: newChunks.length,
      totalTokens
    })
  } catch (error) {
    console.error("[rechunk] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rechunk failed" },
      { status: 500 }
    )
  }
}
