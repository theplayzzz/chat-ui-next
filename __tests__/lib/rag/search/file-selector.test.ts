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

const mockRpc = jest.fn().mockResolvedValue({
  data: [
    {
      file_id: "file-1",
      file_name: "plan1.pdf",
      file_description: "Description",
      file_tags: ["preco"],
      collection_id: "col-1",
      collection_name: "Bradesco",
      similarity: 0.85
    }
  ],
  error: null
})

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    rpc: mockRpc
  }))
}))

import { selectFiles } from "@/lib/rag/search/file-selector"

describe("File Selector", () => {
  test("2.3a: returns files with scores", async () => {
    const files = await selectFiles("preços do plano", "assistant-1")
    expect(files.length).toBeGreaterThan(0)
    expect(files[0]).toHaveProperty("id")
    expect(files[0]).toHaveProperty("name")
    expect(files[0]).toHaveProperty("score")
  })

  test("2.3b: calls match_files_by_embedding RPC", async () => {
    await selectFiles("query", "assistant-1")
    expect(mockRpc).toHaveBeenCalledWith(
      "match_files_by_embedding",
      expect.objectContaining({
        assistant_id: "assistant-1"
      })
    )
  })

  test("2.3c: applies tag boosts to scores", async () => {
    const files = await selectFiles("query", "assistant-1", {
      tagBoosts: { preco: 2.0 }
    })
    // With boost, first file should have boosted score
    expect(files[0].score).toBeGreaterThan(0.85)
  })
})
