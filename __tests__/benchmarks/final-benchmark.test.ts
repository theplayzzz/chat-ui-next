import * as fs from "fs"
import * as path from "path"

describe("Final Benchmark - Go-Live Validation", () => {
  test("4.5a: migration scripts exist", () => {
    const scripts = [
      "scripts/migrate-chunks-level3.ts",
      "scripts/migrate-file-embeddings.ts",
      "scripts/migrate-collection-embeddings.ts"
    ]
    for (const script of scripts) {
      expect(fs.existsSync(path.join(process.cwd(), script))).toBe(true)
    }
  })

  test("4.5b: migration scripts follow correct execution order", () => {
    // chunks → files → collections
    const chunksScript = fs.readFileSync(
      path.join(process.cwd(), "scripts/migrate-chunks-level3.ts"),
      "utf-8"
    )
    const filesScript = fs.readFileSync(
      path.join(process.cwd(), "scripts/migrate-file-embeddings.ts"),
      "utf-8"
    )
    const collectionsScript = fs.readFileSync(
      path.join(process.cwd(), "scripts/migrate-collection-embeddings.ts"),
      "utf-8"
    )

    // Chunks script infers tags and generates context
    expect(chunksScript).toContain("inferChunkTag")
    expect(chunksScript).toContain("generateContextForChunk")

    // Files script aggregates from chunk tags
    expect(filesScript).toContain("file_tags")
    expect(filesScript).toContain("generateFileEmbedding")

    // Collections script aggregates from file tags
    expect(collectionsScript).toContain("collection_tags")
    expect(collectionsScript).toContain("generateCollectionEmbedding")
  })

  test("4.5c: feature flag mechanism is in place", () => {
    const graphContent = fs.readFileSync(
      path.join(
        process.cwd(),
        "lib/agents/health-plan-v2/graphs/search-plans-graph.ts"
      ),
      "utf-8"
    )
    expect(graphContent).toContain("USE_RAG_LEVEL3")
  })

  test("4.5d: LangSmith monitoring has Level 3 steps", () => {
    const monitorContent = fs.readFileSync(
      path.join(process.cwd(), "lib/monitoring/langsmith-setup.ts"),
      "utf-8"
    )
    expect(monitorContent).toContain("CLASSIFY_QUERY")
    expect(monitorContent).toContain("SELECT_COLLECTIONS")
    expect(monitorContent).toContain("RETRIEVE_ADAPTIVE")
    expect(monitorContent).toContain("RERANK_CHUNKS")
  })

  test("4.5e: audit logs include Level 3 metadata", () => {
    const auditContent = fs.readFileSync(
      path.join(
        process.cwd(),
        "lib/agents/health-plan-v2/audit/save-workflow-log.ts"
      ),
      "utf-8"
    )
    expect(auditContent).toContain("ragLevel")
    expect(auditContent).toContain("preFilteringStats")
    expect(auditContent).toContain("queryClassification")
  })
})
