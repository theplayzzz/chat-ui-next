/**
 * Testes unitários para generateRecommendation
 * Cobre: com analysis, sem analysis, markdown válido, highlights/warnings, nextSteps, fallback LLM, version tracking
 */

const mockInvoke = jest.fn()
const mockWithStructuredOutput = jest
  .fn()
  .mockReturnValue({ invoke: mockInvoke })

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: mockWithStructuredOutput
  }))
}))

jest.mock("../humanize-response", () => ({
  humanizeResponse: jest
    .fn()
    .mockImplementation(({ rawResponse }: any) =>
      Promise.resolve({ response: rawResponse })
    )
}))

import { generateRecommendation } from "../generate-recommendation"
import type { HealthPlanState } from "../../../state/state-annotation"
import type { RankedAnalysis } from "../../../types"

// =============================================================================
// FACTORIES
// =============================================================================

function createState(
  overrides: Partial<HealthPlanState> = {}
): HealthPlanState {
  return {
    workspaceId: "ws1",
    userId: "u1",
    assistantId: "a1",
    chatId: "c1",
    messages: [],
    lastIntent: null,
    lastIntentConfidence: 0,
    clientInfo: { age: 30, city: "SP", budget: 500 },
    clientInfoVersion: 1,
    searchResults: [],
    searchResultsVersion: 1,
    searchMetadata: null,
    collectionAnalyses: [],
    ragAnalysisContext: "",
    compatibilityAnalysis: null,
    analysisVersion: 1,
    erpPrices: null,
    pricesRequested: false,
    recommendation: null,
    recommendationVersion: 0,
    isConversationActive: true,
    pendingAction: null,
    loopIterations: 0,
    currentResponse: "",
    errors: [],
    ...overrides
  }
}

const mockAnalysis: RankedAnalysis = {
  analyses: [
    {
      planId: "p1",
      score: 85,
      pros: ["Cobertura ampla"],
      cons: ["Preço alto"],
      compatibility: "alta",
      recommendation: "Top pick"
    },
    {
      planId: "p2",
      score: 72,
      pros: ["Custo-benefício"],
      cons: ["Rede menor"],
      compatibility: "media"
    },
    {
      planId: "p3",
      score: 60,
      pros: ["Barato"],
      cons: ["Cobertura básica"],
      compatibility: "media"
    }
  ],
  topRecommendation: "p1 é o melhor",
  reasoning: "Score mais alto com melhor cobertura",
  timestamp: new Date().toISOString()
}

const mockLLMResult = {
  markdown:
    "## 🏥 Recomendação\n\n### Top 3 Planos\n\n**p1** - Score 85\n\n### Tabela Comparativa\n| Plano | Preço |\n|-------|-------|\n| p1    | R$400 |\n\n### Destaques\n- Cobertura ampla\n\n### Pontos de Atenção\n- Verifique carências\n\n### Próximos Passos\n- [ ] Solicitar cotação",
  topPlanId: "p1",
  alternativeIds: ["p2", "p3"],
  highlights: ["Cobertura ampla", "Rede credenciada extensa"],
  warnings: ["Verificar carências"],
  nextSteps: ["Solicitar cotação detalhada"]
}

// =============================================================================
// TESTS
// =============================================================================

describe("generateRecommendation", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockWithStructuredOutput.mockClear()
    mockWithStructuredOutput.mockReturnValue({ invoke: mockInvoke })
  })

  it("1. should generate recommendation when analysis is available", async () => {
    mockInvoke.mockResolvedValueOnce(mockLLMResult)

    const state = createState({ compatibilityAnalysis: mockAnalysis })
    const result = await generateRecommendation(state)

    expect(result.recommendation).toBeDefined()
    expect(result.recommendation!.topPlanId).toBe("p1")
    expect(result.recommendation!.markdown).toContain("🏥")
    expect(result.messages).toBeDefined()
    expect(result.messages!.length).toBeGreaterThan(0)
  })

  it("2. should return early message when no analysis", async () => {
    const state = createState({ compatibilityAnalysis: null })
    const result = await generateRecommendation(state)

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.recommendation).toBeUndefined()
    expect(result.currentResponse).toContain("analisar")
  })

  it("3. should have markdown with headers in recommendation", async () => {
    mockInvoke.mockResolvedValueOnce(mockLLMResult)

    const state = createState({ compatibilityAnalysis: mockAnalysis })
    const result = await generateRecommendation(state)

    // Markdown must contain at least one header
    expect(result.recommendation!.markdown).toMatch(/^#{1,3} /m)
  })

  it("4. should have highlights and warnings arrays filled", async () => {
    mockInvoke.mockResolvedValueOnce(mockLLMResult)

    const state = createState({ compatibilityAnalysis: mockAnalysis })
    const result = await generateRecommendation(state)

    expect(result.recommendation!.highlights.length).toBeGreaterThan(0)
    expect(result.recommendation!.warnings.length).toBeGreaterThan(0)
  })

  it("5. should have nextSteps array not empty", async () => {
    mockInvoke.mockResolvedValueOnce(mockLLMResult)

    const state = createState({ compatibilityAnalysis: mockAnalysis })
    const result = await generateRecommendation(state)

    expect(result.recommendation!.nextSteps.length).toBeGreaterThan(0)
  })

  it("6. should use fallback when LLM fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("LLM offline"))

    const state = createState({ compatibilityAnalysis: mockAnalysis })
    const result = await generateRecommendation(state)

    // Should still return some response (fallback)
    expect(result.currentResponse).toBeDefined()
    expect(result.currentResponse!.length).toBeGreaterThan(0)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].capability).toBe("generateRecommendation")
  })

  it("7. should increment recommendationVersion on each execution", async () => {
    mockInvoke.mockResolvedValueOnce(mockLLMResult)

    const state = createState({
      compatibilityAnalysis: mockAnalysis,
      recommendationVersion: 2
    })

    const result = await generateRecommendation(state)
    expect(result.recommendationVersion).toBe(3) // 2 + 1
  })
})
