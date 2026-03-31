import { generateLocalEmbedding } from "@/lib/generate-local-embedding"
import {
  ChunkConfig,
  processCSV,
  processJSON,
  processMarkdown,
  processPdf,
  processTxt
} from "@/lib/retrieval/processing"
import { withRagLogging, logRagStage } from "@/lib/rag/logging"
import { withRetry } from "@/lib/tools/health-plan/error-handler"
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { FileItemChunk } from "@/types"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import OpenAI from "openai"

/**
 * Infers the plan type from tags and file name.
 */
function inferPlanType(tags: string[], fileName: string): string | null {
  const combined = [...tags, fileName.toLowerCase()].join(" ")
  if (combined.includes("empresarial") || combined.includes("pme"))
    return "empresarial"
  if (combined.includes("individual")) return "individual"
  if (combined.includes("familiar")) return "familiar"
  return null
}

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
  let correlationId = ""
  let file_id = ""
  let supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null

  try {
    supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    const formData = await req.formData()

    correlationId = crypto.randomUUID()

    file_id = formData.get("file_id") as string
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

    logRagStage({
      correlationId,
      fileId: file_id,
      stage: "storage_download",
      status: "completed",
      inputMetadata: {
        filePath: fileMetadata.file_path,
        fileName: fileMetadata.name,
        fileSize: fileMetadata.size
      }
    })

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
    // Track section_types and parent/child info for plan-based chunking
    let chunkSectionTypes: (string | null)[] = []
    let parentChildMapData: {
      parentIndices: number[]
      childrenByParent: Array<[number, number[]]>
    } | null = null

    chunks = await withRagLogging(
      correlationId,
      "chunking",
      async () => {
        const ingestionMeta = (fileMetadata as any).ingestion_metadata
        let chunkingPlan = ingestionMeta?.chunkingPlan

        // For PDFs: generate chunking plan on-the-fly if not provided
        if (fileExtension === "pdf" && !chunkingPlan) {
          try {
            const { analyzePDF } = await import("@/lib/rag/ingest/pdf-analyzer")
            const pdfTextForAnalysis = await blob.text()
            console.log(
              `[process] Generating chunking plan for PDF (${pdfTextForAnalysis.length} chars)...`
            )
            const analysis = await analyzePDF(pdfTextForAnalysis)
            chunkingPlan = analysis.chunking_plan || null
            console.log(
              `[process] Chunking plan: ${chunkingPlan?.sections?.length || 0} sections`
            )
          } catch (err) {
            console.warn("[process] Failed to generate chunking plan:", err)
          }
        }

        // Use plan-based chunking for PDFs with a chunking plan
        if (fileExtension === "pdf" && chunkingPlan?.sections?.length > 0) {
          const { smartChunkWithPlan, createParentChildChunks } = await import(
            "@/lib/rag/ingest/smart-chunker"
          )
          const { encode } = await import("gpt-tokenizer")

          // Extract full text from PDF
          const pdfText = await blob.text()

          const smartChunks = await smartChunkWithPlan(pdfText, chunkingPlan, {
            chunkSize: chunkConfig.chunkSize ?? 4000,
            chunkOverlap: chunkConfig.chunkOverlap ?? 200
          })

          // Create parent/child hierarchy for large chunks
          const hierarchical = await createParentChildChunks(smartChunks)

          // Build flat list: parents first, then children
          const allChunks: FileItemChunk[] = []
          const sectionTypes: (string | null)[] = []
          const parentIndices: number[] = []
          const childrenByParent = new Map<number, number[]>()

          for (const chunk of hierarchical) {
            const parentIdx = allChunks.length
            allChunks.push({
              content: chunk.content,
              tokens: encode(chunk.content).length
            })
            sectionTypes.push(chunk.section_type)

            if (chunk.isParent && chunk.children && chunk.children.length > 0) {
              parentIndices.push(parentIdx)
              const childIndices: number[] = []

              for (const child of chunk.children) {
                const childIdx = allChunks.length
                allChunks.push({
                  content: child.content,
                  tokens: encode(child.content).length
                })
                sectionTypes.push(child.section_type)
                childIndices.push(childIdx)
              }

              childrenByParent.set(parentIdx, childIndices)
            }
          }

          chunkSectionTypes = sectionTypes
          parentChildMapData = {
            parentIndices,
            childrenByParent: Array.from(childrenByParent.entries())
          }

          console.log(
            `[process] Plan-based chunking: ${allChunks.length} total chunks (${parentIndices.length} parents with children)`
          )

          return allChunks
        }

        // Fallback: standard chunking
        let result: FileItemChunk[] = []
        switch (fileExtension) {
          case "csv":
            result = await processCSV(blob, chunkConfig)
            break
          case "json":
            result = await processJSON(blob, chunkConfig)
            break
          case "md":
            result = await processMarkdown(blob, chunkConfig)
            break
          case "pdf":
            result = await processPdf(blob, chunkConfig)
            break
          case "txt":
            result = await processTxt(blob, chunkConfig)
            break
          default:
            throw new Error(`Unsupported file type: ${fileExtension}`)
        }
        return result
      },
      { fileId: file_id, userId: profile.user_id }
    )

    let embeddings: any = []

    let openai: OpenAI
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

    embeddings = await withRagLogging(
      correlationId,
      "embedding",
      async () => {
        if (embeddingsProvider === "openai") {
          const response = await withRetry(
            () =>
              openai.embeddings.create({
                model: "text-embedding-3-small",
                input: chunks.map(chunk => chunk.content)
              }),
            2, // maxRetries
            0 // step number
          )

          return (response as any).data.map((item: any) => {
            return item.embedding
          })
        } else if (embeddingsProvider === "local") {
          const embeddingPromises = chunks.map(async chunk => {
            try {
              return await generateLocalEmbedding(chunk.content)
            } catch (error) {
              console.error(
                `Error generating embedding for chunk: ${chunk}`,
                error
              )

              return null
            }
          })

          return await Promise.all(embeddingPromises)
        }
        return []
      },
      {
        fileId: file_id,
        userId: profile.user_id,
        chunksProcessed: chunks.length
      }
    )

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

    // Build file_items with optional section_type from plan-based chunking
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
      ...(planMetadata && { plan_metadata: planMetadata as any }),
      ...(chunkSectionTypes[index] && {
        section_type: chunkSectionTypes[index]
      })
    }))

    // Two-phase insert for parent/child relationships
    const pcMap = parentChildMapData as {
      parentIndices: number[]
      childrenByParent: Array<[number, number[]]>
    } | null
    if (pcMap !== null && pcMap.parentIndices.length > 0) {
      // Insert all chunks first to get IDs
      const { data: insertedItems, error: insertError } = await supabaseAdmin
        .from("file_items")
        .insert(file_items)
        .select("id")

      if (insertError || !insertedItems) {
        console.error("[process] Failed to insert file_items:", insertError)
        throw new Error("Failed to insert file items")
      }

      // Update children with parent_chunk_id
      for (const [parentIdx, childIndices] of pcMap.childrenByParent) {
        const parentId = insertedItems[parentIdx]?.id
        if (parentId) {
          const childIds = childIndices
            .map(ci => insertedItems[ci]?.id)
            .filter(Boolean)
          if (childIds.length > 0) {
            await supabaseAdmin
              .from("file_items")
              .update({ parent_chunk_id: parentId } as any)
              .in("id", childIds)
          }
        }
      }

      console.log(
        `[process] Parent/child relationships set: ${pcMap.parentIndices.length} parents`
      )
    } else {
      await supabaseAdmin.from("file_items").upsert(file_items)
    }

    const totalTokens = file_items.reduce((acc, item) => acc + item.tokens, 0)

    logRagStage({
      correlationId,
      fileId: file_id,
      stage: "chunks_upsert",
      status: "completed",
      chunksCreated: file_items.length,
      outputMetadata: {
        totalTokens,
        avgTokensPerChunk: Math.round(totalTokens / file_items.length),
        embeddingsProvider: embeddingsProvider,
        hasEmbeddings: file_items.filter(
          i => i.openai_embedding || i.local_embedding
        ).length
      }
    })

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
          const tags = await withRagLogging(
            correlationId,
            "tag_inference",
            async () => {
              return await inferChunkTagsBatch(
                insertedChunks.map(c => c.content)
              )
            },
            {
              fileId: file_id,
              userId: profile.user_id,
              chunksProcessed: insertedChunks.length
            }
          )

          // Batch generate context
          const contexts = await withRagLogging(
            correlationId,
            "context_generation",
            async () => {
              return await generateContextBatch(
                insertedChunks.map(c => ({ content: c.content })),
                fileMetadata.name,
                fileMetadata.description || ""
              )
            },
            {
              fileId: file_id,
              userId: profile.user_id,
              chunksProcessed: insertedChunks.length
            }
          )

          // Update each chunk with Level 3 data
          for (let i = 0; i < insertedChunks.length; i++) {
            const chunkTag = tags[i] || "regras_gerais"
            const context = contexts[i] || null
            const planType = inferPlanType([chunkTag], fileMetadata.name)

            // Regenerate embedding with context
            const enrichedEmbedding = context
              ? await generateChunkEmbedding(insertedChunks[i].content, context)
              : null

            await supabaseAdmin
              .from("file_items")
              .update({
                tags: [chunkTag],
                document_context: context,
                ...(planType && { plan_type: planType }),
                ...(enrichedEmbedding && {
                  openai_embedding: enrichedEmbedding as any
                })
              } as any)
              .eq("id", insertedChunks[i].id)
          }

          // Generate file-level embedding
          const fileTags = [...new Set(tags)]
          const fileEmbedding = await withRagLogging(
            correlationId,
            "file_embedding",
            async () => {
              return await generateFileEmbedding(
                fileMetadata.name,
                fileMetadata.description,
                fileTags
              )
            },
            { fileId: file_id, userId: profile.user_id }
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
          "[retrieval/process] Level 3 enrichment failed:",
          enrichError
        )
        logRagStage({
          correlationId,
          fileId: file_id,
          stage: "embedding_enriched",
          status: "failed",
          errorDetails: {
            message:
              enrichError instanceof Error
                ? enrichError.message
                : String(enrichError)
          }
        })
        // Level 1 data is already saved, so we just log the error
      }
    }

    logRagStage({
      correlationId,
      fileId: file_id,
      stage: "pipeline_complete",
      status: "completed",
      chunksCreated: file_items.length,
      outputMetadata: {
        totalTokens,
        totalChunks: file_items.length,
        fileName: fileMetadata.name,
        fileType: fileExtension,
        fileSize: fileMetadata.size,
        level3Enabled: !!(fileMetadata as any).ingestion_metadata,
        chunkSize: chunkConfig.chunkSize,
        chunkOverlap: chunkConfig.chunkOverlap
      }
    })

    return NextResponse.json({
      success: true,
      chunksCreated: file_items.length,
      totalTokens,
      correlationId
    })
  } catch (error: any) {
    console.log(`Error in retrieval/process: ${error.stack}`)

    // Log to rag_pipeline_logs
    logRagStage({
      correlationId,
      fileId: file_id,
      stage: "upload",
      status: "failed",
      errorDetails: { message: error?.message }
    })

    // Try to update ingestion_status
    try {
      if (supabaseAdmin && file_id) {
        await supabaseAdmin
          .from("files")
          .update({
            ingestion_status: "error",
            ingestion_metadata: {
              error: error?.message,
              correlationId
            }
          } as any)
          .eq("id", file_id)
      }
    } catch {} // ignore if this also fails

    const errorMessage = error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
