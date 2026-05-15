/**
 * A1.9 - Testes para retrieve-simple.ts
 * Cobre: funções utilitárias puras (sem mocks externos) e retrieveSimple com mocks de Supabase + OpenAI
 */

// ============================================================
// Mocks devem ser definidos ANTES dos imports
// ============================================================

const mockRpc = jest.fn()
const mockEmbedQuery = jest.fn()

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    rpc: mockRpc
  }))
}))

jest.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: mockEmbedQuery
  }))
}))

import {
  retrieveSimple,
  concatenateFileChunks,
  formatEnrichedContext,
  getAllChunks,
  filterEmptyFiles,
  type RetrieveByFileResult,
  type EnrichedChunk
} from "../retrieve-simple"

// =============================================================================
// Factories
// =============================================================================

function makeChunk(overrides: Partial<EnrichedChunk> = {}): EnrichedChunk {
  return {
    id: "chunk-1",
    content: "Conteúdo do plano de saúde básico",
    tokens: 50,
    similarity: 0.85,
    file: {
      id: "f1",
      name: "plano-einstein.pdf",
      description: "Plano Einstein Básico"
    },
    collection: {
      id: "col1",
      name: "Einstein Saúde",
      description: "Operadora Einstein"
    },
    ...overrides
  }
}

function makeFileResult(
  overrides: Partial<RetrieveByFileResult> = {}
): RetrieveByFileResult {
  return {
    fileId: "f1",
    fileName: "plano-einstein.pdf",
    fileDescription: "Plano Einstein Básico",
    collection: {
      id: "col1",
      name: "Einstein Saúde",
      description: "Operadora regional"
    },
    chunks: [
      makeChunk(),
      makeChunk({
        id: "chunk-2",
        content: "Carência de 180 dias para cirurgias"
      })
    ],
    totalChunks: 2,
    ...overrides
  }
}

// Mock RPC data
const mockRpcRow = {
  chunk_id: "c1",
  chunk_content: "Cobertura ambulatorial completa",
  chunk_tokens: 40,
  similarity: 0.9,
  file_id: "f1",
  file_name: "plano.pdf",
  file_description: "Plano básico",
  collection_id: "col1",
  collection_name: "Operadora X",
  collection_description: "Grande operadora"
}

// =============================================================================
// Tests
// =============================================================================

describe("retrieve-simple - utility functions", () => {
  describe("concatenateFileChunks", () => {
    it("3. should concatenate chunks with separators", () => {
      const fileResult = makeFileResult()
      const result = concatenateFileChunks(fileResult)

      expect(result).toContain("[Arquivo: plano-einstein.pdf]")
      expect(result).toContain("Conteúdo do plano de saúde básico")
      expect(result).toContain("Carência de 180 dias para cirurgias")
      expect(result).toContain("[...]") // separator between chunks
    })

    it("should return empty string for file with no chunks", () => {
      const empty = makeFileResult({ chunks: [], totalChunks: 0 })
      expect(concatenateFileChunks(empty)).toBe("")
    })

    it("should include collection name when available", () => {
      const file = makeFileResult()
      const result = concatenateFileChunks(file)
      expect(result).toContain("[Operadora: Einstein Saúde]")
    })

    it("should handle file with no collection", () => {
      const file = makeFileResult({ collection: null })
      const result = concatenateFileChunks(file)
      expect(result).not.toContain("[Operadora:")
      expect(result).toContain("[Arquivo:")
    })
  })

  describe("formatEnrichedContext", () => {
    it("4. should format chunk with collection and file metadata", () => {
      const chunk = makeChunk()
      const result = formatEnrichedContext(chunk)

      expect(result).toContain("[Coleção: Einstein Saúde]")
      expect(result).toContain("[Arquivo: plano-einstein.pdf]")
      expect(result).toContain("Conteúdo do plano de saúde básico")
    })

    it("should handle chunk with no collection", () => {
      const chunk = makeChunk({ collection: null })
      const result = formatEnrichedContext(chunk)

      expect(result).not.toContain("[Coleção:")
      expect(result).toContain("[Arquivo: plano-einstein.pdf]")
    })
  })

  describe("getAllChunks", () => {
    it("5. should flatten all chunks from multiple file results", () => {
      const file1 = makeFileResult({
        chunks: [makeChunk(), makeChunk({ id: "c2" })],
        totalChunks: 2
      })
      const file2 = makeFileResult({
        fileId: "f2",
        chunks: [
          makeChunk({
            id: "c3",
            file: { id: "f2", name: "f2.pdf", description: "" }
          }),
          makeChunk({
            id: "c4",
            file: { id: "f2", name: "f2.pdf", description: "" }
          }),
          makeChunk({
            id: "c5",
            file: { id: "f2", name: "f2.pdf", description: "" }
          })
        ],
        totalChunks: 3
      })

      const all = getAllChunks([file1, file2])
      expect(all.length).toBe(5) // 2 + 3
    })

    it("should return empty array for empty file results", () => {
      expect(getAllChunks([])).toEqual([])
    })
  })

  describe("filterEmptyFiles", () => {
    it("6. should filter out files with zero chunks", () => {
      const full = makeFileResult({ totalChunks: 2 })
      const empty = makeFileResult({
        fileId: "f-empty",
        chunks: [],
        totalChunks: 0
      })
      const another = makeFileResult({ fileId: "f2", totalChunks: 1 })

      const filtered = filterEmptyFiles([full, empty, another])
      expect(filtered.length).toBe(2)
      expect(filtered.map(f => f.fileId)).not.toContain("f-empty")
    })
  })
})

describe("retrieve-simple - retrieveSimple()", () => {
  beforeEach(() => {
    mockRpc.mockReset()
    mockEmbedQuery.mockReset()
    // Default: embedding OK
    mockEmbedQuery.mockResolvedValue([0.1, 0.2, 0.3])
    // Default: RPC returns one chunk
    mockRpc.mockResolvedValue({ data: [mockRpcRow], error: null })
  })

  it("1. basic search returns fileResults grouped by file", async () => {
    const result = await retrieveSimple({
      query: "plano de saúde básico",
      fileIds: ["f1"],
      supabaseClient: { rpc: mockRpc } as any,
      embeddings: { embedQuery: mockEmbedQuery } as any
    })

    expect(result.fileResults.length).toBe(1)
    expect(result.fileResults[0].fileId).toBe("f1")
    expect(result.fileResults[0].chunks.length).toBe(1)
    expect(result.query).toBe("plano de saúde básico")
  })

  it("8. metadata should be filled correctly", async () => {
    mockRpc.mockResolvedValue({
      data: [mockRpcRow, { ...mockRpcRow, chunk_id: "c2" }],
      error: null
    })

    const result = await retrieveSimple({
      query: "planos SP",
      fileIds: ["f1"],
      supabaseClient: { rpc: mockRpc } as any,
      embeddings: { embedQuery: mockEmbedQuery } as any
    })

    expect(result.metadata.totalChunks).toBe(2)
    expect(result.metadata.totalFiles).toBe(1)
    expect(result.metadata.filesWithResults).toBe(1)
    expect(result.query).toBe("planos SP")
  })

  it("7. should handle Supabase RPC error gracefully", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "DB error" } })

    const result = await retrieveSimple({
      query: "planos SP",
      fileIds: ["f1"],
      supabaseClient: { rpc: mockRpc } as any,
      embeddings: { embedQuery: mockEmbedQuery } as any
    })

    // Should return empty file results (not throw)
    expect(result.fileResults.length).toBe(1)
    expect(result.fileResults[0].totalChunks).toBe(0) // empty fallback
  })

  it("should return empty result for empty query", async () => {
    const result = await retrieveSimple({
      query: "   ", // whitespace only
      fileIds: ["f1"],
      supabaseClient: { rpc: mockRpc } as any,
      embeddings: { embedQuery: mockEmbedQuery } as any
    })

    expect(result.fileResults).toHaveLength(0)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("should return empty result for no fileIds", async () => {
    const result = await retrieveSimple({
      query: "planos",
      fileIds: [],
      supabaseClient: { rpc: mockRpc } as any,
      embeddings: { embedQuery: mockEmbedQuery } as any
    })

    expect(result.fileResults).toHaveLength(0)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
