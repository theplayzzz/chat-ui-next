import { ChatOpenAI } from "@langchain/openai"

const SYSTEM_TAGS = [
  "preco",
  "cobertura",
  "rede_credenciada",
  "exclusao",
  "carencia",
  "coparticipacao",
  "reembolso",
  "documentacao",
  "regras_gerais"
] as const

export type SystemTag = (typeof SYSTEM_TAGS)[number]

/**
 * Infer the most relevant tag for a chunk
 */
export async function inferChunkTag(
  chunkContent: string,
  availableTags?: string[]
): Promise<string> {
  const tags = availableTags || [...SYSTEM_TAGS]

  const llm = new ChatOpenAI({
    modelName: "gpt-5-mini",
    temperature: 1,
    timeout: 10000,
    maxRetries: 2,
    tags: ["tag-inferencer", "health-plan-v2", "rag", "level3"],
    modelKwargs: {
      max_completion_tokens: 64,
      reasoning_effort: "low"
    }
  })

  const prompt = `Classifique este trecho de documento de plano de saúde com EXATAMENTE UMA tag da lista abaixo.

Tags disponíveis: ${tags.join(", ")}

Trecho:
"${chunkContent.slice(0, 2000)}"

Responda APENAS com o slug da tag, sem aspas ou explicação.`

  const response = await llm.invoke([{ role: "user", content: prompt }])
  const result =
    typeof response.content === "string"
      ? response.content.trim().toLowerCase()
      : ""

  // Validate the response is a known tag
  if (tags.includes(result)) {
    return result
  }

  // Fuzzy match - find closest tag
  const match = tags.find(t => result.includes(t) || t.includes(result))
  return match || "regras_gerais"
}

/**
 * Batch infer tags for multiple chunks
 */
export async function inferChunkTagsBatch(
  chunks: string[],
  availableTags?: string[],
  batchSize: number = 10
): Promise<string[]> {
  const results: string[] = []

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(chunk =>
        inferChunkTag(chunk, availableTags).catch(() => "regras_gerais")
      )
    )
    results.push(...batchResults)
  }

  return results
}

export { SYSTEM_TAGS }
