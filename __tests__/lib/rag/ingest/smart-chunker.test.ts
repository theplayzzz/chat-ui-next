import { smartChunk, detectSectionType, getDefaultChunkConfig } from "@/lib/rag/ingest/smart-chunker"

describe("Smart Chunker", () => {
  test("1.2a: chunks text into expected size ranges", async () => {
    const text = "A ".repeat(5000) // ~10000 chars
    const chunks = await smartChunk(text, { chunkSize: 1000, chunkOverlap: 100 })
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(chunk => {
      expect(chunk.content.length).toBeLessThanOrEqual(1200) // some tolerance
    })
  })

  test("1.2b: each chunk has index, section_type, page_number", async () => {
    const text = "Tabela de preços do plano. " + "Content ".repeat(500)
    const chunks = await smartChunk(text, { chunkSize: 500, chunkOverlap: 50 })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]).toHaveProperty("index")
    expect(chunks[0]).toHaveProperty("section_type")
    expect(chunks[0]).toHaveProperty("page_number")
    expect(chunks[0]).toHaveProperty("metadata")
  })

  test("1.2c: detectSectionType identifies health plan sections", () => {
    expect(detectSectionType("Tabela de preços com mensalidade")).toBe("preco")
    expect(detectSectionType("Cobertura hospitalar completa")).toBe("cobertura")
    expect(detectSectionType("Rede credenciada de hospitais")).toBe("rede_credenciada")
    expect(detectSectionType("Período de carência de 30 dias")).toBe("carencia")
    expect(detectSectionType("Some generic text without keywords")).toBeNull()
  })

  test("1.2d: getDefaultChunkConfig returns config by document type", () => {
    expect(getDefaultChunkConfig("tabela_precos")).toEqual({ size: 1500, overlap: 100 })
    expect(getDefaultChunkConfig("contrato")).toEqual({ size: 3000, overlap: 300 })
    expect(getDefaultChunkConfig("unknown")).toEqual({ size: 3000, overlap: 200 })
    expect(getDefaultChunkConfig()).toEqual({ size: 3000, overlap: 200 })
  })
})
