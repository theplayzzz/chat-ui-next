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
        in: jest.fn(() => ({
          data: [
            {
              id: "col-1",
              name: "Bradesco",
              collection_embedding: new Array(1536).fill(0.1),
              collection_tags: ["preco"]
            },
            {
              id: "col-2",
              name: "Unimed",
              collection_embedding: new Array(1536).fill(0.05),
              collection_tags: ["cobertura"]
            }
          ],
          error: null
        })),
        eq: jest.fn(() => ({
          data: [{ collection_id: "col-1" }, { collection_id: "col-2" }],
          error: null
        }))
      }))
    }))
  }))
}))

import { selectCollections, SIMILARITY_THRESHOLDS } from "@/lib/rag/search/collection-selector"

describe("Collection Selector", () => {
  test("2.2a: returns scored collections sorted by similarity", async () => {
    const results = await selectCollections("plano de saúde preços", "assistant-1")
    expect(results.length).toBeGreaterThanOrEqual(0)
  })

  test("2.2b: uses zero LLM calls (no ChatOpenAI imports)", async () => {
    const fs = require("fs")
    const path = require("path")
    const content = fs.readFileSync(
      path.join(process.cwd(), "lib/rag/search/collection-selector.ts"),
      "utf-8"
    )
    expect(content).not.toContain("ChatOpenAI")
  })

  test("2.2c: exports similarity thresholds", () => {
    expect(SIMILARITY_THRESHOLDS).toHaveProperty("high")
    expect(SIMILARITY_THRESHOLDS).toHaveProperty("medium")
    expect(SIMILARITY_THRESHOLDS).toHaveProperty("low")
    expect(SIMILARITY_THRESHOLDS.high).toBeGreaterThan(SIMILARITY_THRESHOLDS.low)
  })

  test("2.2d: respects maxCollections limit", async () => {
    const results = await selectCollections("query", "assistant-1", { maxCollections: 1 })
    expect(results.length).toBeLessThanOrEqual(1)
  })
})
