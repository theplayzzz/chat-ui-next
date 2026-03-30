/**
 * Rerank Chunks - Re-rank top-20 -> top-8 using GPT-5-mini
 *
 * Considers client profile for personalized relevance ranking.
 * Falls back to weighted scores if LLM call fails.
 */

import { ChatOpenAI } from "@langchain/openai"
import type { AdaptiveChunk } from "./retrieve-adaptive"

export interface RerankResult {
  chunks: AdaptiveChunk[]
  originalCount: number
  rerankScores: Map<string, number>
}

/**
 * Re-rank chunks considering client profile
 * top-20 -> top-8
 */
export async function rerankChunks(
  chunks: AdaptiveChunk[],
  query: string,
  clientProfile?: Record<string, unknown>,
  maxResults: number = 8
): Promise<RerankResult> {
  if (chunks.length <= maxResults) {
    return {
      chunks,
      originalCount: chunks.length,
      rerankScores: new Map(chunks.map(c => [c.chunkId, c.weightedScore]))
    }
  }

  const llm = new ChatOpenAI({
    modelName: "gpt-5.4-mini",
    temperature: 1, // GPT-5 apenas suporta temperature=1
    timeout: 30000,
    maxRetries: 2,
    maxCompletionTokens: 1024,
    tags: ["rerank-chunks", "health-plan-v2", "rag", "level3"],
    modelKwargs: {
      reasoning_effort: "low"
    }
  })

  const profileContext = clientProfile
    ? `\nPerfil do cliente: ${JSON.stringify(clientProfile)}`
    : ""

  const chunkSummaries = chunks
    .slice(0, 20)
    .map(
      (c, i) =>
        `[${i}] (score: ${c.weightedScore.toFixed(3)}, tags: ${c.tags.join(",")}) ${c.content.slice(0, 200)}...`
    )
    .join("\n\n")

  const prompt = `Reordene os chunks abaixo por relevância para a query do cliente.
Retorne os IDs dos ${maxResults} mais relevantes em ordem, como JSON array de índices.

Query: "${query}"${profileContext}

Chunks:
${chunkSummaries}

Responda APENAS um JSON array de índices, ex: [3, 1, 7, 0, 5, 2, 4, 6]`

  try {
    const response = await llm.invoke([{ role: "user", content: prompt }], {
      runName: "rerank-chunks"
    })
    const content = typeof response.content === "string" ? response.content : ""
    const jsonMatch = content.match(/\[[\d,\s]+\]/)

    if (jsonMatch) {
      const indices: number[] = JSON.parse(jsonMatch[0])
      const validIndices = indices.filter(i => i >= 0 && i < chunks.length)
      const reranked = validIndices.slice(0, maxResults).map(i => chunks[i])

      return {
        chunks: reranked,
        originalCount: chunks.length,
        rerankScores: new Map(
          reranked.map((c, rank) => [c.chunkId, 1.0 - rank * 0.1])
        )
      }
    }
  } catch (error) {
    console.error(
      "[rerank-chunks] LLM error, falling back to weighted scores:",
      error
    )
  }

  // Fallback: just take top-N by weighted score
  return {
    chunks: chunks.slice(0, maxResults),
    originalCount: chunks.length,
    rerankScores: new Map(
      chunks.slice(0, maxResults).map(c => [c.chunkId, c.weightedScore])
    )
  }
}
