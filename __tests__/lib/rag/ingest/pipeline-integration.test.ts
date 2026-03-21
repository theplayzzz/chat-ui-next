import * as fs from "fs"
import * as path from "path"

describe("Pipeline Integration", () => {
  test("1.6: analyze API route exists", () => {
    const routePath = path.join(process.cwd(), "app/api/files/analyze/route.ts")
    expect(fs.existsSync(routePath)).toBe(true)
  })

  test("1.7: rechunk API route exists", () => {
    const routePath = path.join(process.cwd(), "app/api/files/rechunk/route.ts")
    expect(fs.existsSync(routePath)).toBe(true)
  })

  test("1.8: ingest barrel exports all modules", () => {
    const indexPath = path.join(process.cwd(), "lib/rag/ingest/index.ts")
    const content = fs.readFileSync(indexPath, "utf-8")
    expect(content).toContain("analyzePDF")
    expect(content).toContain("smartChunk")
    expect(content).toContain("generateContextForChunk")
    expect(content).toContain("inferChunkTag")
    expect(content).toContain("generateEmbedding")
  })

  test("1.9: all ingest modules exist", () => {
    const modules = [
      "lib/rag/ingest/pdf-analyzer.ts",
      "lib/rag/ingest/smart-chunker.ts",
      "lib/rag/ingest/contextual-retrieval.ts",
      "lib/rag/ingest/tag-inferencer.ts",
      "lib/rag/ingest/embedding-generator.ts"
    ]
    for (const mod of modules) {
      expect(fs.existsSync(path.join(process.cwd(), mod))).toBe(true)
    }
  })
})
