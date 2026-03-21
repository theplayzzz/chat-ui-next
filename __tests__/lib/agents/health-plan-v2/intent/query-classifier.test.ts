const mockInvoke = jest.fn()

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke
  }))
}))

import { classifyQuery } from "@/lib/agents/health-plan-v2/intent/query-classifier"

describe("Query Classifier", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  test("2.1a: extracts tags from query about prices", async () => {
    mockInvoke.mockResolvedValue({
      content: '{"tags": ["preco"], "collectionHint": null, "intent": "busca_especifica"}'
    })
    const result = await classifyQuery("Quais os preços do plano básico?")
    expect(result.tags).toContain("preco")
    expect(result.intent).toBe("busca_especifica")
  })

  test("2.1b: extracts collection hint for specific operator", async () => {
    mockInvoke.mockResolvedValue({
      content: '{"tags": ["cobertura"], "collectionHint": "Bradesco", "intent": "busca_especifica"}'
    })
    const result = await classifyQuery("Cobertura do plano Bradesco")
    expect(result.collectionHint).toBe("Bradesco")
  })

  test("2.1c: handles comparison intent", async () => {
    mockInvoke.mockResolvedValue({
      content: '{"tags": ["preco", "cobertura"], "collectionHint": null, "intent": "comparacao"}'
    })
    const result = await classifyQuery("Compare preços e coberturas dos planos")
    expect(result.tags.length).toBeGreaterThanOrEqual(2)
    expect(result.intent).toBe("comparacao")
  })

  test("2.1d: returns defaults for empty/invalid LLM response", async () => {
    mockInvoke.mockResolvedValue({ content: "invalid response" })
    const result = await classifyQuery("Some query")
    expect(result.tags).toEqual([])
    expect(result.collectionHint).toBeNull()
    expect(result.intent).toBe("informacao_geral")
  })

  test("2.1e: handles LLM error gracefully", async () => {
    mockInvoke.mockRejectedValue(new Error("LLM error"))
    const result = await classifyQuery("Some query")
    expect(result.tags).toEqual([])
    expect(result.intent).toBe("informacao_geral")
  })
})
