/**
 * Testes para Router Invalidation Logic (Fase 7)
 *
 * Testa as funções de verificação de versão que garantem
 * que análise e recomendação são regeneradas quando dados mudam.
 *
 * @see lib/agents/health-plan-v2/nodes/router.ts
 */

import {
  hasSearchResults,
  hasCompatibilityAnalysis,
  isAnalysisStale,
  isRecommendationStale,
  hasRequiredClientData,
  routeToCapabilityWithReason
} from "../nodes/router"
import type { HealthPlanState } from "../state/state-annotation"

// =============================================================================
// MOCK STATE FACTORY
// =============================================================================

function createMockState(
  overrides: Partial<HealthPlanState> = {}
): HealthPlanState {
  return {
    workspaceId: "test-workspace",
    userId: "test-user",
    assistantId: "test-assistant",
    chatId: "test-chat",
    messages: [],
    lastIntent: null,
    lastIntentConfidence: 0,
    clientInfo: {},
    clientInfoVersion: 0,
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
    queryClassification: null,
    selectedCollections: [],
    selectedFiles: [],
    rerankedChunks: [],
    ragLevel: "level1" as const,
    errors: [],
    ...overrides
  }
}

// =============================================================================
// isAnalysisStale TESTS
// =============================================================================

describe("isAnalysisStale", () => {
  it("should return true when analysisVersion < searchResultsVersion", () => {
    const state = createMockState({
      searchResultsVersion: 3,
      analysisVersion: 2
    })

    expect(isAnalysisStale(state)).toBe(true)
  })

  it("should return false when analysisVersion >= searchResultsVersion", () => {
    const state = createMockState({
      searchResultsVersion: 2,
      analysisVersion: 2
    })

    expect(isAnalysisStale(state)).toBe(false)
  })

  it("should return false when analysisVersion > searchResultsVersion", () => {
    const state = createMockState({
      searchResultsVersion: 1,
      analysisVersion: 2
    })

    expect(isAnalysisStale(state)).toBe(false)
  })

  it("should handle zero versions", () => {
    const state = createMockState({
      searchResultsVersion: 0,
      analysisVersion: 0
    })

    expect(isAnalysisStale(state)).toBe(false)
  })

  it("should return true when searchResults updated but analysis never run", () => {
    const state = createMockState({
      searchResultsVersion: 1,
      analysisVersion: 0
    })

    expect(isAnalysisStale(state)).toBe(true)
  })
})

// =============================================================================
// isRecommendationStale TESTS
// =============================================================================

describe("isRecommendationStale", () => {
  it("should return true when recommendationVersion < analysisVersion", () => {
    const state = createMockState({
      analysisVersion: 3,
      recommendationVersion: 2
    })

    expect(isRecommendationStale(state)).toBe(true)
  })

  it("should return false when recommendationVersion >= analysisVersion", () => {
    const state = createMockState({
      analysisVersion: 2,
      recommendationVersion: 2
    })

    expect(isRecommendationStale(state)).toBe(false)
  })

  it("should return false when recommendationVersion > analysisVersion", () => {
    const state = createMockState({
      analysisVersion: 1,
      recommendationVersion: 2
    })

    expect(isRecommendationStale(state)).toBe(false)
  })

  it("should handle zero versions", () => {
    const state = createMockState({
      analysisVersion: 0,
      recommendationVersion: 0
    })

    expect(isRecommendationStale(state)).toBe(false)
  })

  it("should return true when analysis updated but recommendation never run", () => {
    const state = createMockState({
      analysisVersion: 1,
      recommendationVersion: 0
    })

    expect(isRecommendationStale(state)).toBe(true)
  })
})

// =============================================================================
// ROUTING TESTS
// =============================================================================

describe("routeToCapabilityWithReason - pedir_recomendacao", () => {
  it("should route to analyzeCompatibility when analysis is stale", () => {
    const state = createMockState({
      lastIntent: "pedir_recomendacao",
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 2,
      compatibilityAnalysis: { analyses: [] } as any,
      analysisVersion: 1 // stale
    })

    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("analyzeCompatibility")
    expect(result.redirected).toBe(true)
    expect(result.reason).toContain("desatualizada")
  })

  it("should route to generateRecommendation when analysis is current", () => {
    const state = createMockState({
      lastIntent: "pedir_recomendacao",
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1,
      compatibilityAnalysis: { analyses: [] } as any,
      analysisVersion: 1, // current
      recommendationVersion: 0
    })

    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("generateRecommendation")
    expect(result.redirected).toBe(false)
  })

  it("should indicate recommendation is stale in reason", () => {
    const state = createMockState({
      lastIntent: "pedir_recomendacao",
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1,
      compatibilityAnalysis: { analyses: [] } as any,
      analysisVersion: 2,
      recommendationVersion: 1 // stale
    })

    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("generateRecommendation")
    expect(result.reason).toContain("desatualizada")
  })

  it("should route to searchPlans when no search results", () => {
    const state = createMockState({
      lastIntent: "pedir_recomendacao",
      clientInfo: { age: 30, city: "SP" },
      searchResults: []
    })

    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("searchPlans")
    expect(result.redirected).toBe(true)
  })

  it("should route to analyzeCompatibility when no analysis", () => {
    const state = createMockState({
      lastIntent: "pedir_recomendacao",
      searchResults: [{ id: "1" } as any],
      compatibilityAnalysis: null
    })

    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("analyzeCompatibility")
    expect(result.redirected).toBe(true)
  })
})

describe("routeToCapabilityWithReason - analisar", () => {
  it("should indicate analysis is stale in reason", () => {
    const state = createMockState({
      lastIntent: "analisar",
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 2,
      compatibilityAnalysis: { analyses: [] } as any,
      analysisVersion: 1 // stale
    })

    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("analyzeCompatibility")
    expect(result.reason).toContain("desatualizada")
  })

  it("should route to analyzeCompatibility when search results available", () => {
    const state = createMockState({
      lastIntent: "analisar",
      searchResults: [{ id: "1" } as any]
    })

    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("analyzeCompatibility")
    expect(result.redirected).toBe(false)
  })
})

// =============================================================================
// VERSION CHAIN TESTS
// =============================================================================

describe("version chain integrity", () => {
  it("should detect full chain invalidation", () => {
    // Simula: clientInfo mudou → searchResults nova versão → analysis stale → recommendation stale
    const state = createMockState({
      clientInfoVersion: 2,
      searchResultsVersion: 2,
      analysisVersion: 1,
      recommendationVersion: 1
    })

    expect(isAnalysisStale(state)).toBe(true)
    expect(isRecommendationStale(state)).toBe(false) // analysis=1, rec=1

    // Após re-análise
    const stateAfterAnalysis = createMockState({
      clientInfoVersion: 2,
      searchResultsVersion: 2,
      analysisVersion: 2,
      recommendationVersion: 1
    })

    expect(isAnalysisStale(stateAfterAnalysis)).toBe(false)
    expect(isRecommendationStale(stateAfterAnalysis)).toBe(true)
  })

  it("should not invalidate when versions are synchronized", () => {
    const state = createMockState({
      clientInfoVersion: 3,
      searchResultsVersion: 3,
      analysisVersion: 3,
      recommendationVersion: 3
    })

    expect(isAnalysisStale(state)).toBe(false)
    expect(isRecommendationStale(state)).toBe(false)
  })
})

// =============================================================================
// PRD ROUTING CASES (A1.12)
// =============================================================================

describe("routeToCapabilityWithReason - Routing Intents", () => {
  it("should route correctly for all basic intents", () => {
    const state = createMockState()
    expect(
      routeToCapabilityWithReason({ ...state, lastIntent: "conversar" })
        .capability
    ).toBe("respondToUser")
    expect(
      routeToCapabilityWithReason({ ...state, lastIntent: "finalizar" })
        .capability
    ).toBe("endConversation")
    expect(
      routeToCapabilityWithReason({ ...state, lastIntent: "fornecer_dados" })
        .capability
    ).toBe("updateClientInfo")
    expect(
      routeToCapabilityWithReason({ ...state, lastIntent: "alterar_dados" })
        .capability
    ).toBe("updateClientInfo")
    expect(
      routeToCapabilityWithReason({ ...state, lastIntent: "simular_cenario" })
        .capability
    ).toBe("simulateScenario")
  })

  it("should redirect to updateClientInfo when searching without data", () => {
    const state = createMockState({
      lastIntent: "buscar_planos",
      clientInfo: {}
    })
    const result = routeToCapabilityWithReason(state)
    expect(result.capability).toBe("updateClientInfo")
    expect(result.redirected).toBe(true)
  })

  it("should route searchPlans when searching with data", () => {
    const state = createMockState({
      lastIntent: "buscar_planos",
      clientInfo: { age: 30, city: "SP" }
    })
    const result = routeToCapabilityWithReason(state)
    expect(result.capability).toBe("searchPlans")
    expect(result.redirected).toBe(false)
  })

  it("should redirect to searchPlans when analyzing without search results", () => {
    const state = createMockState({
      lastIntent: "analisar",
      clientInfo: { age: 30, city: "SP" },
      searchResults: []
    })
    const result = routeToCapabilityWithReason(state)
    expect(result.capability).toBe("searchPlans")
    expect(result.redirected).toBe(true)
  })

  it("should fallback to updateClientInfo when analyzing without results and data", () => {
    const state = createMockState({
      lastIntent: "analisar",
      clientInfo: {},
      searchResults: []
    })
    const result = routeToCapabilityWithReason(state)
    expect(result.capability).toBe("updateClientInfo")
    expect(result.redirected).toBe(true)
  })

  it("should fallback to respondToUser on unknown intent", () => {
    const state = createMockState({ lastIntent: "intent_inexistente" as any })
    const result = routeToCapabilityWithReason(state)
    expect(result.capability).toBe("respondToUser")
  })

  it("should return __end__ when loop limit reached", () => {
    const state = createMockState({
      lastIntent: "conversar",
      loopIterations: 10
    })
    const result = routeToCapabilityWithReason(state)
    expect(result.capability).toBe("__end__")
    expect(result.redirected).toBe(true)
  })

  it("should end conversation explicitly if not active", () => {
    const { shouldContinue } = require("../nodes/router")
    const state = createMockState({
      isConversationActive: false,
      lastIntent: "conversar"
    })
    expect(shouldContinue(state)).toBe("end")
  })
})
