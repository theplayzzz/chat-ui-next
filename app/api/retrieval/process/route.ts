import { generateLocalEmbedding } from "@/lib/generate-local-embedding"
import {
  ChunkConfig,
  processCSV,
  processJSON,
  processMarkdown,
  processPdf,
  processTxt
} from "@/lib/retrieval/processing"
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { FileItemChunk } from "@/types"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import OpenAI from "openai"

/**
 * Extrai metadados básicos do plano a partir do conteúdo e nome do arquivo.
 * Retorna null se não conseguir identificar como plano de saúde.
 */
function extractPlanMetadata(
  fileName: string,
  fileDescription: string,
  chunkContent: string
): Record<string, unknown> | null {
  const combinedText =
    `${fileName} ${fileDescription} ${chunkContent}`.toLowerCase()

  // Detectar se é documento de plano de saúde
  const healthPlanKeywords = [
    "plano de saúde",
    "plano de saude",
    "operadora",
    "ans",
    "coparticipação",
    "coparticipacao",
    "carência",
    "carencia",
    "rede credenciada",
    "cobertura",
    "unimed",
    "amil",
    "bradesco saúde",
    "bradesco saude",
    "sulamerica",
    "hapvida",
    "notre dame",
    "notredame"
  ]

  const isHealthPlan = healthPlanKeywords.some(kw => combinedText.includes(kw))
  if (!isHealthPlan) return null

  // Extrair tipo de documento
  let documentType = "general"
  if (
    combinedText.includes("tabela de preço") ||
    combinedText.includes("tabela de preco")
  ) {
    documentType = "price_table"
  } else if (
    combinedText.includes("rede credenciada") ||
    combinedText.includes("prestador")
  ) {
    documentType = "provider_network"
  } else if (
    combinedText.includes("manual") ||
    combinedText.includes("guia do beneficiário")
  ) {
    documentType = "benefit_guide"
  } else if (
    combinedText.includes("contrato") ||
    combinedText.includes("regulamento")
  ) {
    documentType = "contract"
  }

  // Extrair operadora
  const operatorPatterns = [
    "unimed",
    "amil",
    "bradesco",
    "sulamerica",
    "hapvida",
    "notre dame",
    "notredame",
    "porto seguro",
    "seguros unimed",
    "golden cross",
    "mediservice",
    "care plus",
    "prevent senior"
  ]
  const operator =
    operatorPatterns.find(op => combinedText.includes(op)) || null

  // Extrair tags básicas
  const tags: string[] = []
  if (combinedText.includes("empresarial") || combinedText.includes("pme"))
    tags.push("empresarial")
  if (combinedText.includes("individual") || combinedText.includes("familiar"))
    tags.push("individual")
  if (
    combinedText.includes("coparticipação") ||
    combinedText.includes("coparticipacao")
  )
    tags.push("coparticipacao")
  if (combinedText.includes("enfermaria")) tags.push("enfermaria")
  if (combinedText.includes("apartamento")) tags.push("apartamento")
  if (combinedText.includes("nacional")) tags.push("nacional")
  if (combinedText.includes("regional")) tags.push("regional")

  return {
    documentType,
    operator,
    tags,
    extractedAt: new Date().toISOString(),
    version: "1.0"
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    const formData = await req.formData()

    const file_id = formData.get("file_id") as string
    const embeddingsProvider = formData.get("embeddingsProvider") as string

    const { data: fileMetadata, error: metadataError } = await supabaseAdmin
      .from("files")
      .select("*")
      .eq("id", file_id)
      .single()

    if (metadataError) {
      throw new Error(
        `Failed to retrieve file metadata: ${metadataError.message}`
      )
    }

    if (!fileMetadata) {
      throw new Error("File not found")
    }

    if (fileMetadata.user_id !== profile.user_id) {
      throw new Error("Unauthorized")
    }

    // Get chunk configuration from file metadata
    const chunkConfig: Partial<ChunkConfig> = {
      chunkSize: fileMetadata.chunk_size ?? 4000,
      chunkOverlap: fileMetadata.chunk_overlap ?? 200
    }

    const { data: file, error: fileError } = await supabaseAdmin.storage
      .from("files")
      .download(fileMetadata.file_path)

    if (fileError)
      throw new Error(`Failed to retrieve file: ${fileError.message}`)

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const blob = new Blob([fileBuffer])
    const fileExtension = fileMetadata.name.split(".").pop()?.toLowerCase()

    if (embeddingsProvider === "openai") {
      try {
        if (profile.use_azure_openai) {
          checkApiKey(profile.azure_openai_api_key, "Azure OpenAI")
        } else {
          checkApiKey(profile.openai_api_key, "OpenAI")
        }
      } catch (error: any) {
        error.message =
          error.message +
          ", make sure it is configured or else use local embeddings"
        throw error
      }
    }

    let chunks: FileItemChunk[] = []

    switch (fileExtension) {
      case "csv":
        chunks = await processCSV(blob, chunkConfig)
        break
      case "json":
        chunks = await processJSON(blob, chunkConfig)
        break
      case "md":
        chunks = await processMarkdown(blob, chunkConfig)
        break
      case "pdf":
        chunks = await processPdf(blob, chunkConfig)
        break
      case "txt":
        chunks = await processTxt(blob, chunkConfig)
        break
      default:
        return new NextResponse("Unsupported file type", {
          status: 400
        })
    }

    let embeddings: any = []

    let openai
    if (profile.use_azure_openai) {
      openai = new OpenAI({
        apiKey: profile.azure_openai_api_key || "",
        baseURL: `${profile.azure_openai_endpoint}/openai/deployments/${profile.azure_openai_embeddings_id}`,
        defaultQuery: { "api-version": "2023-12-01-preview" },
        defaultHeaders: { "api-key": profile.azure_openai_api_key }
      })
    } else {
      openai = new OpenAI({
        apiKey: profile.openai_api_key || "",
        organization: profile.openai_organization_id
      })
    }

    if (embeddingsProvider === "openai") {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunks.map(chunk => chunk.content)
      })

      embeddings = response.data.map((item: any) => {
        return item.embedding
      })
    } else if (embeddingsProvider === "local") {
      const embeddingPromises = chunks.map(async chunk => {
        try {
          return await generateLocalEmbedding(chunk.content)
        } catch (error) {
          console.error(`Error generating embedding for chunk: ${chunk}`, error)

          return null
        }
      })

      embeddings = await Promise.all(embeddingPromises)
    }

    // Extrair plan_metadata do primeiro chunk (representativo do arquivo)
    const sampleContent = chunks
      .slice(0, 3)
      .map(c => c.content)
      .join(" ")
      .substring(0, 2000)
    const planMetadata = extractPlanMetadata(
      fileMetadata.name,
      fileMetadata.description,
      sampleContent
    )

    const file_items = chunks.map((chunk, index) => ({
      file_id,
      user_id: profile.user_id,
      content: chunk.content,
      tokens: chunk.tokens,
      openai_embedding:
        embeddingsProvider === "openai"
          ? ((embeddings[index] || null) as any)
          : null,
      local_embedding:
        embeddingsProvider === "local"
          ? ((embeddings[index] || null) as any)
          : null,
      ...(planMetadata && { plan_metadata: planMetadata as any })
    }))

    await supabaseAdmin.from("file_items").upsert(file_items)

    const totalTokens = file_items.reduce((acc, item) => acc + item.tokens, 0)

    await supabaseAdmin
      .from("files")
      .update({ tokens: totalTokens })
      .eq("id", file_id)

    // === RAG Level 3 Enrichment (if ingestion_metadata present) ===
    const ingestionMeta = (fileMetadata as any).ingestion_metadata
    if (ingestionMeta && embeddingsProvider === "openai") {
      try {
        const { inferChunkTagsBatch } = await import(
          "@/lib/rag/ingest/tag-inferencer"
        )
        const { generateContextBatch } = await import(
          "@/lib/rag/ingest/contextual-retrieval"
        )
        const { generateChunkEmbedding, generateFileEmbedding } = await import(
          "@/lib/rag/ingest/embedding-generator"
        )

        // Get inserted chunks
        const { data: insertedChunks } = await supabaseAdmin
          .from("file_items")
          .select("id, content")
          .eq("file_id", file_id)
          .order("created_at")

        if (insertedChunks && insertedChunks.length > 0) {
          // Batch infer tags
          const tags = await inferChunkTagsBatch(
            insertedChunks.map(c => c.content)
          )

          // Batch generate context
          const contexts = await generateContextBatch(
            insertedChunks.map(c => ({ content: c.content })),
            fileMetadata.name,
            fileMetadata.description || ""
          )

          // Update each chunk with Level 3 data
          for (let i = 0; i < insertedChunks.length; i++) {
            const chunkTag = tags[i] || "regras_gerais"
            const context = contexts[i] || null

            // Regenerate embedding with context
            const enrichedEmbedding = context
              ? await generateChunkEmbedding(insertedChunks[i].content, context)
              : null

            await supabaseAdmin
              .from("file_items")
              .update({
                tags: [chunkTag],
                document_context: context,
                ...(enrichedEmbedding && {
                  openai_embedding: enrichedEmbedding as any
                })
              })
              .eq("id", insertedChunks[i].id)
          }

          // Generate file-level embedding
          const fileTags = [...new Set(tags)]
          const fileEmbedding = await generateFileEmbedding(
            fileMetadata.name,
            fileMetadata.description,
            fileTags
          )

          await supabaseAdmin
            .from("files")
            .update({
              file_tags: fileTags,
              file_embedding: fileEmbedding,
              ingestion_status: "done"
            } as any)
            .eq("id", file_id)
        }
      } catch (enrichError) {
        console.error(
          "[retrieval/process] Level 3 enrichment failed (Level 1 data preserved):",
          enrichError
        )
        // Level 1 data is already saved, so we just log the error
      }
    }

    return new NextResponse("Embed Successful", {
      status: 200
    })
  } catch (error: any) {
    console.log(`Error in retrieval/process: ${error.stack}`)
    const errorMessage = error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
