/**
 * Rewrite Query - CRAG (Corrective RAG) query rewriter
 *
 * When initial retrieval returns all irrelevant results,
 * rewrites the query to be more general while preserving intent.
 */

import { ChatOpenAI } from "@langchain/openai"
import type { FileGradingResult } from "./grade-documents"

export async function rewriteQuery(
  originalQuery: string,
  gradingResults: FileGradingResult[],
  clientInfo: Record<string, unknown>
): Promise<string> {
  const llm = new ChatOpenAI({
    modelName: "gpt-5.4-nano",
    temperature: 1,
    timeout: 10000,
    maxRetries: 2,
    maxCompletionTokens: 512,
    tags: ["rewrite-query", "health-plan-v2", "rag", "crag"],
    modelKwargs: {
      reasoning_effort: "low"
    }
  })

  const prompt = `A busca de planos de saúde com a query abaixo não retornou resultados relevantes.
Reescreva a query de forma mais genérica, mantendo a intenção principal do cliente.

Query original: "${originalQuery}"

Perfil do cliente: ${JSON.stringify(clientInfo)}

Resultados encontrados (todos irrelevantes):
${gradingResults.map(f => `- ${f.fileName}: ${f.relevance}`).join("\n")}

Responda APENAS com a query reescrita, sem aspas ou explicação.`

  const response = await llm.invoke([{ role: "user", content: prompt }], {
    runName: "rewrite-query"
  })
  const rewritten =
    typeof response.content === "string"
      ? response.content.trim()
      : originalQuery

  return rewritten || originalQuery
}
