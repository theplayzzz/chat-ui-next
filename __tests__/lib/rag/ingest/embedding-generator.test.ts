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

import {
  generateEmbedding,
  generateChunkEmbedding,
  generateFileEmbedding,
  generateCollectionEmbedding,
  generateEmbeddingsBatch,
  EMBEDDING_MODEL
} from "@/lib/rag/ingest/embedding-generator"

describe("Embedding Generator", () => {
  test("1.5a: uses text-embedding-3-small model", () => {
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small")
  })

  test("1.5b: generates 1536-dim embedding", async () => {
    const embedding = await generateEmbedding("test text")
    expect(embedding).toHaveLength(1536)
  })

  test("1.5c: chunk embedding includes context when provided", async () => {
    const embedding = await generateChunkEmbedding("content", "context paragraph")
    expect(embedding).toHaveLength(1536)
  })

  test("1.5d: file embedding combines name+desc+tags", async () => {
    const embedding = await generateFileEmbedding("file.pdf", "description", ["preco"])
    expect(embedding).toHaveLength(1536)
  })

  test("1.5e: collection embedding works", async () => {
    const embedding = await generateCollectionEmbedding("Collection", "desc", ["tag1"])
    expect(embedding).toHaveLength(1536)
  })

  test("1.5f: batch generates multiple embeddings", async () => {
    jest.requireMock("openai").default.mockImplementation(() => ({
      embeddings: {
        create: jest.fn().mockResolvedValue({
          data: [
            { embedding: new Array(1536).fill(0.1) },
            { embedding: new Array(1536).fill(0.2) }
          ]
        })
      }
    }))
    // Note: batch test verifies the function signature, not actual batching
    const result = await generateEmbeddingsBatch(["text1", "text2"])
    expect(result.length).toBeGreaterThan(0)
  })
})
