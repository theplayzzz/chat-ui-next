import { ChatOpenAI } from "@langchain/openai"

/**
 * Generates a positioning context paragraph for a chunk.
 * Based on: https://www.anthropic.com/news/contextual-retrieval
 *
 * The context is prepended to the chunk content before embedding generation,
 * but stored separately in document_context column.
 */
export async function generateContextForChunk(
  chunkContent: string,
  fileName: string,
  fileDescription: string,
  sectionType?: string | null
): Promise<string> {
  const llm = new ChatOpenAI({
    modelName: "gpt-5.4-nano",
    temperature: 1,
    timeout: 30000,
    maxRetries: 2,
    maxCompletionTokens: 512,
    tags: ["contextual-retrieval", "health-plan-v2", "rag", "level3"],
    modelKwargs: {
      reasoning_effort: "low"
    }
  })

  const sectionInfo = sectionType ? ` na seção "${sectionType}"` : ""

  const prompt = `Gere um parágrafo curto (2-3 frases) de contexto posicional para este trecho de documento.
O contexto deve explicar DE ONDE este trecho vem e QUAL sua posição no documento maior.

Documento: "${fileName}"
Descrição: "${fileDescription}"
Seção: ${sectionType || "não identificada"}

Trecho:
"${chunkContent.slice(0, 1500)}"

Responda APENAS com o parágrafo de contexto, sem aspas ou prefixos.`

  const response = await llm.invoke([{ role: "user", content: prompt }])
  return typeof response.content === "string" ? response.content.trim() : ""
}

/**
 * Batch generate context for multiple chunks
 */
export async function generateContextBatch(
  chunks: Array<{
    content: string
    sectionType?: string | null
  }>,
  fileName: string,
  fileDescription: string,
  batchSize: number = 10
): Promise<string[]> {
  const results: string[] = []

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(chunk =>
        generateContextForChunk(
          chunk.content,
          fileName,
          fileDescription,
          chunk.sectionType
        ).catch(() => "")
      )
    )
    results.push(...batchResults)
  }

  return results
}
