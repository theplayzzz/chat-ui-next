import { withRetry } from "@/lib/tools/health-plan/error-handler"

const EMBEDDING_MODEL = "text-embedding-3-small"

function getOpenAIClient() {
  // Lazy require to avoid breaking test environments that don't mock openai
  const OpenAI = require("openai").default || require("openai")
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient()
  const response: any = await withRetry(
    () =>
      openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000) // Limit to ~8k chars
      }),
    2,
    0
  )
  return response.data[0].embedding
}

/**
 * Generate embedding for a chunk (content + context for richer representation)
 */
export async function generateChunkEmbedding(
  content: string,
  documentContext: string | null
): Promise<number[]> {
  const textToEmbed = documentContext
    ? `${documentContext}\n\n${content}`
    : content
  return generateEmbedding(textToEmbed)
}

/**
 * Generate file-level embedding from name + description + tags
 */
export async function generateFileEmbedding(
  fileName: string,
  fileDescription: string | null,
  fileTags: string[]
): Promise<number[]> {
  const parts = [fileName]
  if (fileDescription) parts.push(fileDescription)
  if (fileTags.length > 0) parts.push(`Tags: ${fileTags.join(", ")}`)
  return generateEmbedding(parts.join(". "))
}

/**
 * Generate collection-level embedding from name + description + tags
 */
export async function generateCollectionEmbedding(
  collectionName: string,
  collectionDescription: string | null,
  collectionTags: string[]
): Promise<number[]> {
  const parts = [collectionName]
  if (collectionDescription) parts.push(collectionDescription)
  if (collectionTags.length > 0)
    parts.push(`Tags: ${collectionTags.join(", ")}`)
  return generateEmbedding(parts.join(". "))
}

/**
 * Batch generate embeddings
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize: number = 20
): Promise<number[][]> {
  const openai = getOpenAIClient()
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 8000))
    const response: any = await withRetry(
      () =>
        openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch
        }),
      2,
      0
    )
    results.push(
      ...response.data.map((d: { embedding: number[] }) => d.embedding)
    )
  }

  return results
}

export { EMBEDDING_MODEL }
