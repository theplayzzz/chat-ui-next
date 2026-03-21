jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: "Este trecho faz parte da seção de preços do documento Bradesco Saúde."
    })
  }))
}))

import { generateContextForChunk, generateContextBatch } from "@/lib/rag/ingest/contextual-retrieval"

describe("Contextual Retrieval", () => {
  test("1.3a: generates context paragraph for a chunk", async () => {
    const context = await generateContextForChunk(
      "Mensalidade: R$ 487,90",
      "Bradesco Saúde - Plano Flex",
      "Tabela de preços",
      "preco"
    )
    expect(typeof context).toBe("string")
    expect(context.length).toBeGreaterThan(0)
  })

  test("1.3b: handles missing section type", async () => {
    const context = await generateContextForChunk(
      "Content",
      "FileName",
      "Description"
    )
    expect(typeof context).toBe("string")
  })

  test("1.3c: batch processes multiple chunks", async () => {
    const chunks = [
      { content: "Chunk 1", sectionType: "preco" },
      { content: "Chunk 2", sectionType: "cobertura" },
      { content: "Chunk 3", sectionType: null }
    ]
    const results = await generateContextBatch(chunks, "File", "Desc", 2)
    expect(results.length).toBe(3)
  })
})
