const mockInvoke = jest.fn()

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke
  }))
}))

import { inferChunkTag, inferChunkTagsBatch, SYSTEM_TAGS } from "@/lib/rag/ingest/tag-inferencer"

describe("Tag Inferencer", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  test("1.4a: returns valid system tag", async () => {
    mockInvoke.mockResolvedValue({ content: "preco" })
    const tag = await inferChunkTag("Mensalidade R$ 500")
    expect(SYSTEM_TAGS).toContain(tag)
  })

  test("1.4b: falls back to regras_gerais for unknown response", async () => {
    mockInvoke.mockResolvedValue({ content: "unknown_tag_xyz" })
    const tag = await inferChunkTag("Some content")
    expect(tag).toBe("regras_gerais")
  })

  test("1.4c: fuzzy matches partial tag names", async () => {
    mockInvoke.mockResolvedValue({ content: "cobertura hospitalar" })
    const tag = await inferChunkTag("Cobertura hospitalar")
    expect(tag).toBe("cobertura")
  })

  test("1.4d: batch processes multiple chunks", async () => {
    mockInvoke.mockResolvedValue({ content: "preco" })
    const results = await inferChunkTagsBatch(["Chunk 1", "Chunk 2", "Chunk 3"], undefined, 2)
    expect(results.length).toBe(3)
    expect(results.every(t => SYSTEM_TAGS.includes(t as any))).toBe(true)
  })
})
