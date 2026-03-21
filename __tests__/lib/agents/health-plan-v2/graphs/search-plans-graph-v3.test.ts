import * as fs from "fs"
import * as path from "path"

describe("Search Plans Graph - Level 3 Integration", () => {
  const graphPath = path.join(
    process.cwd(),
    "lib/agents/health-plan-v2/graphs/search-plans-graph.ts"
  )

  let graphContent: string

  beforeAll(() => {
    graphContent = fs.readFileSync(graphPath, "utf-8")
  })

  test("2.6a: has USE_RAG_LEVEL3 feature flag", () => {
    expect(graphContent).toContain("USE_RAG_LEVEL3")
  })

  test("2.6b: Level 3 pipeline has classifyQuery node", () => {
    expect(graphContent).toContain("classifyQuery")
  })

  test("2.6c: Level 3 pipeline has retrieveAdaptive node", () => {
    expect(graphContent).toContain("retrieveAdaptive")
  })

  test("2.6d: Level 3 pipeline has rerankChunks node", () => {
    expect(graphContent).toContain("rerankChunks")
  })

  test("2.6e: Level 1 pipeline is preserved (retrieve-simple import)", () => {
    expect(graphContent).toContain("retrieve-simple")
  })

  test("2.6f: state annotation has ragLevel field", () => {
    const statePath = path.join(
      process.cwd(),
      "lib/agents/health-plan-v2/state/state-annotation.ts"
    )
    const stateContent = fs.readFileSync(statePath, "utf-8")
    expect(stateContent).toContain("ragLevel")
    expect(stateContent).toContain("queryClassification")
    expect(stateContent).toContain("selectedCollections")
    expect(stateContent).toContain("selectedFiles")
  })
})
