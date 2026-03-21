const mockInvoke = jest.fn()

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke
  }))
}))

import { rerankChunks } from "@/lib/agents/health-plan-v2/nodes/rag/rerank-chunks"

const makeChunk = (id: string, score: number) => ({
  chunkId: id,
  content: `Content ${id}`,
  tokens: 100,
  baseSimilarity: score,
  weightedScore: score,
  weight: 1.0,
  tags: ["preco"],
  sectionType: "preco",
  pageNumber: 1,
  documentContext: null,
  fileId: "file-1",
  fileName: "plan.pdf",
  fileDescription: null,
  collectionId: null,
  collectionName: null
})

describe("Rerank Chunks", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  test("2.5a: returns fewer chunks than input", async () => {
    const chunks = Array.from({ length: 20 }, (_, i) => makeChunk(`c-${i}`, 0.9 - i * 0.01))
    mockInvoke.mockResolvedValue({ content: "[0, 1, 2, 3, 4, 5, 6, 7]" })
    const result = await rerankChunks(chunks, "query", undefined, 8)
    expect(result.chunks.length).toBeLessThanOrEqual(8)
    expect(result.originalCount).toBe(20)
  })

  test("2.5b: skips reranking if fewer chunks than max", async () => {
    const chunks = [makeChunk("c-1", 0.9), makeChunk("c-2", 0.8)]
    const result = await rerankChunks(chunks, "query", undefined, 8)
    expect(result.chunks.length).toBe(2)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test("2.5c: falls back to weighted scores on LLM error", async () => {
    const chunks = Array.from({ length: 15 }, (_, i) => makeChunk(`c-${i}`, 0.9 - i * 0.01))
    mockInvoke.mockRejectedValue(new Error("LLM error"))
    const result = await rerankChunks(chunks, "query", undefined, 8)
    expect(result.chunks.length).toBe(8)
  })
})
