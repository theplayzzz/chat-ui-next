/**
 * Testes completos do Router - Cobertura 100% dos 9 intents
 *
 * Valida todas as rotas possíveis, redirecionamentos,
 * funções auxiliares e edge cases.
 *
 * @see lib/agents/health-plan-v2/nodes/router.ts
 */

import {
  routeToCapabilityWithReason,
  INTENT_TO_CAPABILITY,
  MAX_LOOP_ITERATIONS,
  hasRequiredClientData,
  hasSearchResults,
  hasCompatibilityAnalysis,
  isAnalysisStale,
  isRecommendationStale,
  hasReachedLoopLimit,
  shouldContinue,
  afterCapability
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
    errors: [],
    ...overrides
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

describe("Router constants", () => {
  it("should have MAX_LOOP_ITERATIONS = 10", () => {
    expect(MAX_LOOP_ITERATIONS).toBe(10)
  })

  it("should map all 9 intents in INTENT_TO_CAPABILITY", () => {
    expect(Object.keys(INTENT_TO_CAPABILITY)).toHaveLength(9)
    expect(INTENT_TO_CAPABILITY).toEqual({
      fornecer_dados: "updateClientInfo",
      buscar_planos: "searchPlans",
      analisar: "analyzeCompatibility",
      consultar_preco: "fetchPrices",
      pedir_recomendacao: "generateRecommendation",
      conversar: "respondToUser",
      alterar_dados: "updateClientInfo",
      simular_cenario: "respondToUser",
      finalizar: "endConversation"
    })
  })
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

describe("hasRequiredClientData", () => {
  it("should return false when clientInfo is undefined", () => {
    expect(hasRequiredClientData(undefined)).toBe(false)
  })

  it("should return false when clientInfo is empty", () => {
    expect(hasRequiredClientData({})).toBe(false)
  })

  it("should return false when only age is present", () => {
    expect(hasRequiredClientData({ age: 30 })).toBe(false)
  })

  it("should return false when only city is present", () => {
    expect(hasRequiredClientData({ city: "SP" })).toBe(false)
  })

  it("should return true when age and city are present", () => {
    expect(hasRequiredClientData({ age: 30, city: "SP" })).toBe(true)
  })

  it("should return true when age and state are present", () => {
    expect(hasRequiredClientData({ age: 30, state: "SP" })).toBe(true)
  })

  it("should return false when age is 0", () => {
    expect(hasRequiredClientData({ age: 0, city: "SP" })).toBe(false)
  })

  it("should return false when age is negative", () => {
    expect(hasRequiredClientData({ age: -1, city: "SP" })).toBe(false)
  })
})

describe("hasSearchResults", () => {
  it("should return false when searchResults is empty", () => {
    expect(hasSearchResults(createMockState())).toBe(false)
  })

  it("should return true when searchResults has items", () => {
    expect(
      hasSearchResults(createMockState({ searchResults: [{ id: "1" } as any] }))
    ).toBe(true)
  })
})

describe("hasCompatibilityAnalysis", () => {
  it("should return false when compatibilityAnalysis is null", () => {
    expect(hasCompatibilityAnalysis(createMockState())).toBe(false)
  })

  it("should return true when compatibilityAnalysis exists", () => {
    expect(
      hasCompatibilityAnalysis(
        createMockState({
          compatibilityAnalysis: { analyses: [] } as any
        })
      )
    ).toBe(true)
  })
})

describe("hasReachedLoopLimit", () => {
  it("should return false when loopIterations < MAX", () => {
    expect(hasReachedLoopLimit(createMockState({ loopIterations: 5 }))).toBe(
      false
    )
  })

  it("should return true when loopIterations = MAX", () => {
    expect(hasReachedLoopLimit(createMockState({ loopIterations: 10 }))).toBe(
      true
    )
  })

  it("should return true when loopIterations > MAX", () => {
    expect(hasReachedLoopLimit(createMockState({ loopIterations: 15 }))).toBe(
      true
    )
  })
})

// =============================================================================
// ROUTING: DIRECT INTENTS (no redirect)
// =============================================================================

describe("routeToCapabilityWithReason - direct intents", () => {
  it("should route null intent to respondToUser", () => {
    const result = routeToCapabilityWithReason(createMockState())
    expect(result.capability).toBe("respondToUser")
    expect(result.redirected).toBe(false)
  })

  it("should route fornecer_dados to updateClientInfo", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "fornecer_dados" })
    )
    expect(result.capability).toBe("updateClientInfo")
    expect(result.redirected).toBe(false)
  })

  it("should route alterar_dados to updateClientInfo", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "alterar_dados" })
    )
    expect(result.capability).toBe("updateClientInfo")
    expect(result.redirected).toBe(false)
  })

  it("should route conversar to respondToUser", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "conversar" })
    )
    expect(result.capability).toBe("respondToUser")
    expect(result.redirected).toBe(false)
  })

  it("should route finalizar to endConversation", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "finalizar" })
    )
    expect(result.capability).toBe("endConversation")
    expect(result.redirected).toBe(false)
  })

  it("should route simular_cenario to respondToUser (Phase 10 disabled)", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "simular_cenario" })
    )
    expect(result.capability).toBe("respondToUser")
    expect(result.redirected).toBe(true) // Phase 10 disabled, redirects
  })
})

// =============================================================================
// ROUTING: buscar_planos
// =============================================================================

describe("routeToCapabilityWithReason - buscar_planos", () => {
  it("should redirect to updateClientInfo when no client data", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "buscar_planos", clientInfo: {} })
    )
    expect(result.capability).toBe("updateClientInfo")
    expect(result.redirected).toBe(true)
    expect(result.originalIntent).toBe("buscar_planos")
  })

  it("should route to searchPlans when client data is sufficient", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "buscar_planos",
        clientInfo: { age: 30, city: "SP" }
      })
    )
    expect(result.capability).toBe("searchPlans")
    expect(result.redirected).toBe(false)
  })
})

// =============================================================================
// ROUTING: analisar
// =============================================================================

describe("routeToCapabilityWithReason - analisar", () => {
  it("should redirect to updateClientInfo when no data and no search", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "analisar" })
    )
    expect(result.capability).toBe("updateClientInfo")
    expect(result.redirected).toBe(true)
  })

  it("should redirect to searchPlans when has data but no search", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "analisar",
        clientInfo: { age: 30, city: "SP" }
      })
    )
    expect(result.capability).toBe("searchPlans")
    expect(result.redirected).toBe(true)
  })

  it("should route to analyzeCompatibility when search results exist", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "analisar",
        searchResults: [{ id: "1" } as any]
      })
    )
    expect(result.capability).toBe("analyzeCompatibility")
    expect(result.redirected).toBe(false)
  })

  it("should route to analyzeCompatibility when analysis is stale", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "analisar",
        searchResults: [{ id: "1" } as any],
        searchResultsVersion: 2,
        compatibilityAnalysis: { analyses: [] } as any,
        analysisVersion: 1
      })
    )
    expect(result.capability).toBe("analyzeCompatibility")
    expect(result.reason).toContain("desatualizada")
  })
})

// =============================================================================
// ROUTING: consultar_preco
// =============================================================================

describe("routeToCapabilityWithReason - consultar_preco", () => {
  it("should redirect to respondToUser when analysis/search exists", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "consultar_preco",
        compatibilityAnalysis: { analyses: [] } as any
      })
    )
    expect(result.capability).toBe("respondToUser")
    expect(result.redirected).toBe(true)
    expect(result.originalIntent).toBe("consultar_preco")
  })

  it("should redirect to respondToUser when only searchResults exist", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "consultar_preco",
        searchResults: [{ id: "1" } as any]
      })
    )
    expect(result.capability).toBe("respondToUser")
    expect(result.redirected).toBe(true)
  })

  it("should redirect to updateClientInfo when no data", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "consultar_preco" })
    )
    expect(result.capability).toBe("updateClientInfo")
    expect(result.redirected).toBe(true)
  })

  it("should redirect to searchPlans when has data but no search", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "consultar_preco",
        clientInfo: { age: 30, city: "SP" }
      })
    )
    expect(result.capability).toBe("searchPlans")
    expect(result.redirected).toBe(true)
  })
})

// =============================================================================
// ROUTING: pedir_recomendacao (full chain)
// =============================================================================

describe("routeToCapabilityWithReason - pedir_recomendacao", () => {
  it("should redirect to updateClientInfo when no data at all", () => {
    const result = routeToCapabilityWithReason(
      createMockState({ lastIntent: "pedir_recomendacao" })
    )
    expect(result.capability).toBe("updateClientInfo")
    expect(result.redirected).toBe(true)
  })

  it("should redirect to searchPlans when has data but no search", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "pedir_recomendacao",
        clientInfo: { age: 30, city: "SP" }
      })
    )
    expect(result.capability).toBe("searchPlans")
    expect(result.redirected).toBe(true)
  })

  it("should redirect to analyzeCompatibility when has search but no analysis", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "pedir_recomendacao",
        searchResults: [{ id: "1" } as any]
      })
    )
    expect(result.capability).toBe("analyzeCompatibility")
    expect(result.redirected).toBe(true)
  })

  it("should redirect to analyzeCompatibility when analysis is stale", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "pedir_recomendacao",
        searchResults: [{ id: "1" } as any],
        searchResultsVersion: 2,
        compatibilityAnalysis: { analyses: [] } as any,
        analysisVersion: 1
      })
    )
    expect(result.capability).toBe("analyzeCompatibility")
    expect(result.redirected).toBe(true)
    expect(result.reason).toContain("desatualizada")
  })

  it("should route to generateRecommendation when all prerequisites met", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "pedir_recomendacao",
        searchResults: [{ id: "1" } as any],
        searchResultsVersion: 1,
        compatibilityAnalysis: { analyses: [] } as any,
        analysisVersion: 1
      })
    )
    expect(result.capability).toBe("generateRecommendation")
    expect(result.redirected).toBe(false)
  })
})

// =============================================================================
// LOOP LIMIT
// =============================================================================

describe("routeToCapabilityWithReason - loop limit", () => {
  it("should route to __end__ when loop limit reached", () => {
    const result = routeToCapabilityWithReason(
      createMockState({
        lastIntent: "buscar_planos",
        loopIterations: 10
      })
    )
    expect(result.capability).toBe("__end__")
    expect(result.redirected).toBe(true)
    expect(result.originalIntent).toBe("buscar_planos")
  })

  it("should override any intent when loop limit reached", () => {
    // Loop limit is checked before finalizar in the router,
    // so ALL intents (including finalizar) go to __end__
    const intents = [
      "fornecer_dados",
      "conversar",
      "finalizar",
      "simular_cenario"
    ] as const

    for (const intent of intents) {
      const result = routeToCapabilityWithReason(
        createMockState({
          lastIntent: intent,
          loopIterations: 10
        })
      )
      expect(result.capability).toBe("__end__")
    }
  })
})

// =============================================================================
// shouldContinue
// =============================================================================

describe("shouldContinue", () => {
  it('should return "continue" for active conversation', () => {
    expect(shouldContinue(createMockState())).toBe("continue")
  })

  it('should return "end" when conversation is not active', () => {
    expect(
      shouldContinue(createMockState({ isConversationActive: false }))
    ).toBe("end")
  })

  it('should return "end" when lastIntent is finalizar', () => {
    expect(shouldContinue(createMockState({ lastIntent: "finalizar" }))).toBe(
      "end"
    )
  })

  it('should return "end" when loop limit reached', () => {
    expect(shouldContinue(createMockState({ loopIterations: 10 }))).toBe("end")
  })
})

// =============================================================================
// afterCapability
// =============================================================================

describe("afterCapability", () => {
  it('should return "awaiting" for normal intents', () => {
    expect(afterCapability(createMockState({ lastIntent: "conversar" }))).toBe(
      "awaiting"
    )
  })

  it('should return "__end__" when lastIntent is finalizar', () => {
    expect(afterCapability(createMockState({ lastIntent: "finalizar" }))).toBe(
      "__end__"
    )
  })

  it('should return "__end__" when conversation is not active', () => {
    expect(
      afterCapability(createMockState({ isConversationActive: false }))
    ).toBe("__end__")
  })

  it('should return "awaiting" for simular_cenario', () => {
    expect(
      afterCapability(createMockState({ lastIntent: "simular_cenario" }))
    ).toBe("awaiting")
  })
})
