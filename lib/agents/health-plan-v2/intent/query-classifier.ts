import { ChatOpenAI } from "@langchain/openai"

export interface QueryClassification {
  tags: string[]
  collectionHint: string | null
  intent: string
  planType: string | null // "empresarial" | "individual" | "familiar" | "pme" | null
}

/**
 * Classify a RAG search query to extract tags, collection hints, and intent.
 * DISTINCT from intent-classifier.ts which classifies overall agent intent.
 */
export async function classifyQuery(
  query: string
): Promise<QueryClassification> {
  const llm = new ChatOpenAI({
    modelName: "gpt-5.4-nano",
    temperature: 1, // GPT-5 apenas suporta temperature=1
    timeout: 10000,
    maxRetries: 2,
    maxCompletionTokens: 256,
    tags: ["query-classifier", "health-plan-v2", "rag", "level3"],
    modelKwargs: {
      reasoning_effort: "low"
    }
  })

  const prompt = `Analise esta query de busca de planos de saúde e extraia:
1. tags: slugs de categorias relevantes (preco, cobertura, rede_credenciada, exclusao, carencia, coparticipacao, reembolso, documentacao, regras_gerais)
2. collectionHint: nome da operadora mencionada (ou null)
3. intent: tipo de busca (comparacao, busca_especifica, informacao_geral)
4. planType: tipo de plano mencionado ("empresarial", "individual", "familiar", "pme", ou null se não mencionado)

Query: "${query}"

Responda em JSON: {"tags": [...], "collectionHint": "...", "intent": "...", "planType": "..."}
Responda APENAS o JSON.`

  const response = await llm.invoke([{ role: "user", content: prompt }], {
    runName: "query-classifier"
  })
  const content = typeof response.content === "string" ? response.content : ""

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        collectionHint: parsed.collectionHint || null,
        intent: parsed.intent || "informacao_geral",
        planType: parsed.planType || null
      }
    }
  } catch {}

  return {
    tags: [],
    collectionHint: null,
    intent: "informacao_geral",
    planType: null
  }
}
