/**
 * Testes unitários para analyzeCompatibility
 * Cobre: com searchResults, com ragContext, sem dados, ranking, medals, erro LLM
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

// humanizeResponse just echoes the rawResponse to keep tests simple
jest.mock("../humanize-response", () => ({
  humanizeResponse: jest
    .fn()
    .mockImplementation(({ rawResponse }: any) =>
      Promise.resolve({ response: rawResponse })
    )
}))

import { analyzeCompatibility } from "../analyze-compatibility"
import type { HealthPlanState } from "../../../state/state-annotation"

// =============================================================================
// STATE FACTORY
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
    clientInfo: { age: 30, city: "SP" },
    clientInfoVersion: 1,
    searchResults: [],
    searchResultsVersion: 1,
    searchMetadata: null,
    collectionAnalyses: [],
    ragAnalysisContext: "",
    compatibilityAnalysis: null,
    analysisVersion: 0,
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

const mockAnalysisResult = {
  analyses: [
    {
      planId: "p1",
      planName: "Einstein Basic",
      score: 85,
      pros: ["Boa cobertura"],
      cons: ["Preço alto"],
      compatibility: "alta" as const
    },
    {
      planId: "p2",
      planName: "Einstein Plus",
      score: 72,
      pros: ["Bom custo-benefício"],
      cons: ["Carência longa"],
      compatibility: "media" as const
    },
    {
      planId: "p3",
      planName: "Meta Saúde Básico",
      score: 60,
      pros: ["Acessível"],
      cons: ["Cobertura básica"],
      compatibility: "media" as const
    }
  ],
  topRecommendation: "Einstein Basic é o mais recomendado",
  reasoning: "Melhor combinação de cobertura e preço"
}

// =============================================================================
// TESTS
// =============================================================================

describe("analyzeCompatibility", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockWithStructuredOutput.mockClear()
    mockWithStructuredOutput.mockReturnValue({ invoke: mockInvoke })
  })

  it("1. should analyze with searchResults and return compatibilityAnalysis", async () => {
    mockInvoke.mockResolvedValueOnce(mockAnalysisResult)

    const state = createState({
      searchResults: [
        { nome_plano: "Einstein Basic", operadora: "Einstein" } as any
      ],
      ragAnalysisContext:
        "Plano Einstein Basic é um bom plano regional com cobertura para São Paulo. Score estimado: 85."
    })

    const result = await analyzeCompatibility(state)

    expect(result.compatibilityAnalysis).toBeDefined()
    expect(result.compatibilityAnalysis?.analyses).toHaveLength(3)
    expect(result.analysisVersion).toBe(1) // 0 + 1
    expect(result.messages).toBeDefined()
    expect(result.messages!.length).toBeGreaterThan(0)
  })

  it("2. should analyze using ragAnalysisContext when available", async () => {
    mockInvoke.mockResolvedValueOnce(mockAnalysisResult)

    const state = createState({
      searchResults: [{ nome_plano: "Plano" } as any],
      ragAnalysisContext: "Análise RAG detalhada de planos. ".repeat(10) // >50 chars
    })

    await analyzeCompatibility(state)

    // Should have called withStructuredOutput
    expect(mockWithStructuredOutput).toHaveBeenCalled()
    expect(mockInvoke).toHaveBeenCalled()
  })

  it("3. should return early message when no searchResults and no ragContext", async () => {
    const state = createState({
      searchResults: [],
      ragAnalysisContext: ""
    })

    const result = await analyzeCompatibility(state)

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.compatibilityAnalysis).toBeUndefined()
    expect(result.currentResponse).toContain("buscar planos para analisar")
  })

  it("4. should rank plans with highest score first", async () => {
    // Return in wrong order to test sorting
    const unorderedResult = {
      ...mockAnalysisResult,
      analyses: [
        {
          planId: "p3",
          planName: "Low",
          score: 40,
          pros: [],
          cons: [],
          compatibility: "baixa" as const
        },
        {
          planId: "p1",
          planName: "High",
          score: 85,
          pros: [],
          cons: [],
          compatibility: "alta" as const
        },
        {
          planId: "p2",
          planName: "Med",
          score: 65,
          pros: [],
          cons: [],
          compatibility: "media" as const
        }
      ]
    }
    mockInvoke.mockResolvedValueOnce(unorderedResult)

    const state = createState({
      searchResults: [{ nome_plano: "X" } as any],
      ragAnalysisContext: "A".repeat(60)
    })

    const result = await analyzeCompatibility(state)
    const scores = result.compatibilityAnalysis!.analyses.map(a => a.score)

    // Should be sorted descending
    expect(scores).toEqual([85, 65, 40])
  })

  it("5. should include medal response with top 3 plans in currentResponse", async () => {
    mockInvoke.mockResolvedValueOnce(mockAnalysisResult)

    const state = createState({
      searchResults: [{ nome_plano: "X" } as any],
      ragAnalysisContext: "A".repeat(60)
    })

    const result = await analyzeCompatibility(state)

    // The response should mention plan IDs with medals
    expect(result.currentResponse).toContain("🥇")
    expect(result.currentResponse).toContain("🥈")
    expect(result.currentResponse).toContain("🥉")
  })

  it("6. should handle LLM error gracefully with fallback", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("LLM timeout"))

    const state = createState({
      searchResults: [{ nome_plano: "X" } as any],
      ragAnalysisContext: "A".repeat(60)
    })

    const result = await analyzeCompatibility(state)

    expect(result.compatibilityAnalysis).toBeUndefined()
    expect(result.errors).toBeDefined()
    expect(result.errors![0].capability).toBe("analyzeCompatibility")
    expect(result.errors![0].message).toContain("LLM timeout")
  })
})
