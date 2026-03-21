jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: '{"tags": ["preco"], "collectionHint": null, "intent": "busca_especifica"}'
    })
  }))
}))

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }]
      })
    }
  }))
}))

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn(() => ({ data: [], error: null })),
        eq: jest.fn(() => ({ data: [], error: null }))
      }))
    })),
    rpc: jest.fn().mockResolvedValue({
      data: [
        {
          chunk_id: "chunk-1",
          chunk_content: "Plano com mensalidade R$ 500",
          chunk_tokens: 10,
          base_similarity: 0.85,
          weighted_score: 1.7,
          chunk_weight: 1.0,
          chunk_tags: ["preco"],
          section_type: "preco",
          page_number: 5,
          document_context: "Context",
          file_id: "file-1",
          file_name: "plan.pdf",
          file_description: "Plan",
          collection_id: "col-1",
          collection_name: "Bradesco",
          collection_description: "Desc"
        }
      ],
      error: null
    })
  }))
}))

import { retrieveAdaptive } from "@/lib/agents/health-plan-v2/nodes/rag/retrieve-adaptive"

describe("Retrieve Adaptive", () => {
  test("2.4a: returns chunks with metadata", async () => {
    const result = await retrieveAdaptive("preços plano", "assistant-1")
    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.chunks[0]).toHaveProperty("chunkId")
    expect(result.chunks[0]).toHaveProperty("weightedScore")
    expect(result.chunks[0]).toHaveProperty("documentContext")
  })

  test("2.4b: includes query classification", async () => {
    const result = await retrieveAdaptive("preços plano", "assistant-1")
    expect(result.queryClassification).toHaveProperty("tags")
    expect(result.queryClassification).toHaveProperty("intent")
  })

  test("2.4c: returns pre-filtering metadata", async () => {
    const result = await retrieveAdaptive("query", "assistant-1")
    expect(result.metadata).toHaveProperty("collectionsConsidered")
    expect(result.metadata).toHaveProperty("filesSelected")
    expect(result.metadata).toHaveProperty("chunksRetrieved")
  })
})
