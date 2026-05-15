/**
 * A1.2 - Testes para search-plans.ts (searchPlans capability)
 * Cobre: dados insuficientes, busca bem-sucedida, busca vazia, erro sub-grafo, idempotência, version tracking
 */

// Mocks ANTES dos imports
// NOTA: jest.mock() é hoisted pelo Babel, portanto variáveis externas não estão disponíveis.
// Usamos jest.fn() diretamente na factory e pegamos a referência depois.

jest.mock("../../../graphs/search-plans-graph", () => ({
  invokeSearchPlansGraph: jest.fn()
}))

jest.mock("../humanize-response", () => ({
  humanizeResponse: jest
    .fn()
    .mockImplementation(({ rawResponse }: any) =>
      Promise.resolve({ response: rawResponse })
    )
}))

import { searchPlans } from "../search-plans"
import { HumanMessage, AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../../state/state-annotation"
import { invokeSearchPlansGraph } from "../../../graphs/search-plans-graph"

// Referência ao mock após imports (funciona pois Jest substitui o módulo)
const mockInvokeSearchPlansGraph = invokeSearchPlansGraph as jest.Mock

// =============================================================================
// Factories
// =============================================================================

function createState(
  overrides: Partial<HealthPlanState> = {}
): HealthPlanState {
  return {
    workspaceId: "ws1",
    userId: "u1",
    assistantId: "a1",
    chatId: "c1",
    messages: [new HumanMessage("Quero planos de saúde em SP")],
    lastIntent: "buscar_planos",
    lastIntentConfidence: 0.9,
    clientInfo: { age: 30, city: "SP", budget: 500 },
    clientInfoVersion: 1,
    searchResults: [],
    searchResultsVersion: 0,
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

// Mock resultado do sub-grafo com planos reais
const mockGraphResultWithPlans = {
  collectionAnalyses: [
    {
      collectionId: "col1",
      collectionName: "Einstein Saúde",
      identifiedPlans: [
        {
          planName: "Einstein Básico",
          planType: "individual",
          coverage: ["SP"],
          coparticipation: "10% consultas",
          network: ["Hospital Einstein"],
          basePrice: { value: 450 },
          waitingPeriods: ["180 dias internação", "24h emergência"],
          clientRelevance: "high",
          relevanceJustification: "Abrange SP com budget adequado",
          sourceFileNames: ["einstein-basico.pdf"],
          importantRules: ["Carência de 180 dias"],
          summary: "Bom plano para SP"
        },
        {
          planName: "Einstein Plus",
          planType: "individual",
          coverage: ["SP", "RJ"],
          coparticipation: null,
          network: ["Hospital Einstein", "Sírio-Libanês"],
          basePrice: { value: 800 },
          waitingPeriods: [],
          clientRelevance: "medium",
          relevanceJustification: "Acima do orçamento",
          sourceFileNames: ["einstein-plus.pdf"],
          importantRules: [],
          summary: "Plano premium, acima do budget"
        }
      ]
    }
  ],
  analysisText:
    "=== ANÁLISE DE PLANOS === Perfil: 30 anos, SP, R$500\n\n--- PLANO 1: Einstein Saúde ---\nCompatibilidade alta.",
  metadata: {
    query: "plano de saúde adulto 30 anos SP R$500",
    totalFiles: 3,
    filesWithResults: 2,
    totalChunks: 10,
    ragModel: "gpt-5-mini",
    executionTimeMs: 2000,
    gradingStats: {
      highRelevance: 1,
      mediumRelevance: 1,
      lowRelevance: 0,
      irrelevant: 0
    }
  }
}

const mockGraphResultEmpty = {
  collectionAnalyses: [],
  analysisText: "Nenhum plano encontrado.",
  metadata: {
    query: "...",
    totalFiles: 0,
    filesWithResults: 0,
    totalChunks: 0,
    ragModel: "gpt-5-mini",
    executionTimeMs: 500,
    gradingStats: {
      highRelevance: 0,
      mediumRelevance: 0,
      lowRelevance: 0,
      irrelevant: 0
    }
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("searchPlans", () => {
  beforeEach(() => {
    mockInvokeSearchPlansGraph.mockReset()
  })

  it("2. should return guidance message when client data is insufficient", async () => {
    const state = createState({ clientInfo: {} }) // no age/city/budget

    const result = await searchPlans(state)

    expect(mockInvokeSearchPlansGraph).not.toHaveBeenCalled()
    expect(result.searchResults).toBeUndefined()
    expect(result.currentResponse).toContain("idade")
  })

  it("1. should search plans with complete client data and return searchResults", async () => {
    mockInvokeSearchPlansGraph.mockResolvedValueOnce(mockGraphResultWithPlans)

    const state = createState()
    const result = await searchPlans(state)

    expect(result.searchResults).toBeDefined()
    expect(result.searchResults!.length).toBeGreaterThan(0)
    expect(result.ragAnalysisContext).toContain("ANÁLISE")
    expect(result.searchMetadata).toBeDefined()
  })

  it("should include only non-irrelevant plans in searchResults", async () => {
    const graphResultWithIrrelevant = {
      ...mockGraphResultWithPlans,
      collectionAnalyses: [
        {
          collectionId: "col1",
          collectionName: "Meta Saúde",
          identifiedPlans: [
            {
              planName: "Meta Básico",
              planType: "individual",
              coverage: ["RJ"],
              clientRelevance: "irrelevant", // ← este deve ser excluído
              relevanceJustification: "Não disponível em SP",
              sourceFileNames: [],
              importantRules: [],
              summary: "Fora da cobertura",
              coparticipation: null,
              network: [],
              basePrice: null,
              waitingPeriods: []
            },
            {
              planName: "Meta Plus",
              planType: "individual",
              coverage: ["SP"],
              clientRelevance: "high", // ← este deve ser incluído
              relevanceJustification: "Disponível em SP",
              sourceFileNames: [],
              importantRules: [],
              summary: "Disponível",
              coparticipation: null,
              network: [],
              basePrice: { value: 400 },
              waitingPeriods: []
            }
          ]
        }
      ],
      analysisText: "...",
      metadata: mockGraphResultWithPlans.metadata
    }
    mockInvokeSearchPlansGraph.mockResolvedValueOnce(graphResultWithIrrelevant)

    const state = createState()
    const result = await searchPlans(state)

    // Only "Meta Plus" (high) should be in results, "Meta Básico" (irrelevant) should not
    expect(result.searchResults!.length).toBe(1)
    expect(result.searchResults![0].nome_plano).toBe("Meta Plus")
  })

  it("4. when sub-graph returns empty, should return message and empty searchResults", async () => {
    mockInvokeSearchPlansGraph.mockResolvedValueOnce(mockGraphResultEmpty)

    const state = createState()
    const result = await searchPlans(state)

    expect(result.searchResults).toHaveLength(0)
    expect(result.currentResponse).toContain("Não encontrei planos")
  })

  it("5. should handle sub-graph error gracefully", async () => {
    mockInvokeSearchPlansGraph.mockRejectedValueOnce(new Error("Graph crash"))

    const state = createState()
    const result = await searchPlans(state)

    expect(result.searchResults).toBeUndefined()
    expect(result.errors).toBeDefined()
    expect(result.errors![0].capability).toBe("searchPlans")
  })

  it("7. should track searchResultsVersion incrementally", async () => {
    mockInvokeSearchPlansGraph.mockResolvedValue(mockGraphResultWithPlans)

    const state = createState({ searchResultsVersion: 3 })
    const result = await searchPlans(state)

    expect(result.searchResultsVersion).toBe(4) // 3 + 1
  })

  it("6. should be idempotent on multiple calls (consistent results)", async () => {
    mockInvokeSearchPlansGraph
      .mockResolvedValueOnce(mockGraphResultWithPlans)
      .mockResolvedValueOnce(mockGraphResultWithPlans)

    const state = createState()
    const result1 = await searchPlans(state)
    const result2 = await searchPlans(state)

    // Same number of plans both times
    expect(result1.searchResults!.length).toBe(result2.searchResults!.length)
  })
})
