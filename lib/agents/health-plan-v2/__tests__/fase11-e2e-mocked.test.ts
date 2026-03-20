/**
 * Testes E2E Mockados - Fase 11
 *
 * Simula cenários E2E completos usando mocks de LLM,
 * validando routing + capability output em sequência.
 *
 * Cenários do manual-testes-futuros.md:
 * E2E-5, E2E-7, E2E-8, E2E-9, E2E-10, E2E-11, E2E-13
 *
 * @see .taskmaster/docs/manual-testes-futuros.md
 */

import { routeToCapabilityWithReason } from "../nodes/router"
import {
  processClientInfoUpdate,
  getStaleCapabilities
} from "../state/cache-invalidation"
import type { HealthPlanState } from "../state/state-annotation"

// Mock ChatOpenAI for capabilities that use LLM
jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        response: "Resposta mockada",
        detectedTerms: [],
        tone: "friendly"
      })
    }),
    invoke: jest.fn().mockResolvedValue({
      content: "Resposta mockada do LLM"
    })
  }))
}))

// Mock Supabase
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest
            .fn()
            .mockResolvedValue({ data: { id: "test" }, error: null })
        }))
      }))
    }))
  }))
}))

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
// E2E-7: Conversa geral
// =============================================================================

describe("E2E-7: Conversa geral (glossário)", () => {
  it("should route conversar intent to respondToUser", () => {
    const state = createMockState({ lastIntent: "conversar" })
    const route = routeToCapabilityWithReason(state)

    expect(route.capability).toBe("respondToUser")
    expect(route.redirected).toBe(false)
  })

  it("should route conversar even with existing analysis context", () => {
    const state = createMockState({
      lastIntent: "conversar",
      searchResults: [{ id: "1" } as any],
      compatibilityAnalysis: { analyses: [] } as any,
      ragAnalysisContext: "Plano A: cobertura ampla"
    })
    const route = routeToCapabilityWithReason(state)

    expect(route.capability).toBe("respondToUser")
  })
})

// =============================================================================
// E2E-8: Finalização com auditoria
// =============================================================================

describe("E2E-8: Finalização com auditoria", () => {
  it("should route finalizar to endConversation", () => {
    const state = createMockState({
      lastIntent: "finalizar",
      clientInfo: { name: "João", age: 30, city: "SP" },
      recommendation: { markdown: "Recomendação final..." } as any
    })
    const route = routeToCapabilityWithReason(state)

    expect(route.capability).toBe("endConversation")
    expect(route.redirected).toBe(false)
  })

  it("should route finalizar even without recommendation", () => {
    const state = createMockState({ lastIntent: "finalizar" })
    const route = routeToCapabilityWithReason(state)

    expect(route.capability).toBe("endConversation")
  })
})

// =============================================================================
// E2E-9: Simulação (stub)
// =============================================================================

describe("E2E-9: Simulação de cenário", () => {
  it("should route simular_cenario to respondToUser (Phase 10 disabled)", () => {
    const state = createMockState({
      lastIntent: "simular_cenario",
      clientInfo: {
        age: 30,
        city: "SP",
        dependents: [{ age: 28, relationship: "spouse" as const }]
      }
    })
    const route = routeToCapabilityWithReason(state)

    expect(route.capability).toBe("respondToUser")
    expect(route.redirected).toBe(true)
  })
})

// =============================================================================
// E2E-10: Mensagem vazia
// =============================================================================

describe("E2E-10: Mensagem vazia / sem intent", () => {
  it("should route null intent to respondToUser gracefully", () => {
    const state = createMockState({ lastIntent: null })
    const route = routeToCapabilityWithReason(state)

    expect(route.capability).toBe("respondToUser")
    expect(route.redirected).toBe(false)
    expect(route.reason).toContain("Sem intenção")
  })
})

// =============================================================================
// E2E-11: Dados inválidos
// =============================================================================

describe("E2E-11: Dados inválidos", () => {
  it("should route fornecer_dados to updateClientInfo for validation", () => {
    // Even with invalid data, it routes to updateClientInfo which handles validation
    const state = createMockState({
      lastIntent: "fornecer_dados",
      clientInfo: { age: 200, city: "SP" }
    })
    const route = routeToCapabilityWithReason(state)

    expect(route.capability).toBe("updateClientInfo")
  })

  it("should have hasRequiredClientData return true even for invalid age (validation is in capability)", () => {
    // Router only checks existence, not validity
    // Validation happens in updateClientInfo capability
    const hasData = require("../nodes/router").hasRequiredClientData({
      age: 200,
      city: "SP"
    })
    expect(hasData).toBe(true) // Router doesn't validate range, just presence
  })
})

// =============================================================================
// E2E-13: Loop protection
// =============================================================================

describe("E2E-13: Loop protection", () => {
  it("should route to __end__ when loop limit reached", () => {
    const state = createMockState({
      lastIntent: "buscar_planos",
      loopIterations: 10,
      clientInfo: { age: 30, city: "SP" }
    })
    const route = routeToCapabilityWithReason(state)

    expect(route.capability).toBe("__end__")
    expect(route.redirected).toBe(true)
  })

  it("should route to __end__ for any business intent at loop limit", () => {
    const intents = [
      "fornecer_dados",
      "buscar_planos",
      "analisar",
      "consultar_preco",
      "pedir_recomendacao",
      "conversar",
      "alterar_dados",
      "simular_cenario"
    ] as const

    for (const intent of intents) {
      const state = createMockState({
        lastIntent: intent,
        loopIterations: 10
      })
      const route = routeToCapabilityWithReason(state)

      expect(route.capability).toBe("__end__")
    }
  })

  it("should route finalizar to __end__ at loop limit (loop limit checked first)", () => {
    const state = createMockState({
      lastIntent: "finalizar",
      loopIterations: 10
    })
    const route = routeToCapabilityWithReason(state)

    // Loop limit is checked before finalizar in the router
    expect(route.capability).toBe("__end__")
  })
})

// =============================================================================
// E2E-5: Cache invalidation flow
// =============================================================================

describe("E2E-5: Cache invalidation on data change", () => {
  it("should invalidate searchResults and analysis when age changes", () => {
    const state = createMockState({
      clientInfo: { age: 30, city: "SP" },
      clientInfoVersion: 1,
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1,
      compatibilityAnalysis: { analyses: [] } as any,
      analysisVersion: 1,
      recommendation: { markdown: "rec" } as any,
      recommendationVersion: 1
    })

    const updates = processClientInfoUpdate(state, { age: 55 })

    // Age changed → all downstream caches invalidated
    expect(updates.clientInfo?.age).toBe(55)
    expect(updates.clientInfoVersion).toBe(2)
    expect(updates.searchResults).toEqual([])
    expect(updates.searchResultsVersion).toBe(0)
    expect(updates.compatibilityAnalysis).toBeNull()
    expect(updates.analysisVersion).toBe(0)
    expect(updates.recommendation).toBeNull()
    expect(updates.recommendationVersion).toBe(0)
  })

  it("should detect stale capabilities after invalidation", () => {
    const stateAfterInvalidation = createMockState({
      clientInfoVersion: 2,
      searchResults: [],
      searchResultsVersion: 0,
      compatibilityAnalysis: null,
      analysisVersion: 0
    })

    const stale = getStaleCapabilities(stateAfterInvalidation)

    expect(stale).toContain("searchPlans")
  })

  it("should redirect pedir_recomendacao to searchPlans after invalidation", () => {
    const stateAfterInvalidation = createMockState({
      lastIntent: "pedir_recomendacao",
      clientInfo: { age: 55, city: "SP" },
      clientInfoVersion: 2,
      searchResults: [],
      searchResultsVersion: 0
    })

    const route = routeToCapabilityWithReason(stateAfterInvalidation)

    expect(route.capability).toBe("searchPlans")
    expect(route.redirected).toBe(true)
  })

  it("should not invalidate when data doesn't change", () => {
    const state = createMockState({
      clientInfo: { age: 30, city: "SP" },
      clientInfoVersion: 1,
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1
    })

    // Same data
    const updates = processClientInfoUpdate(state, { age: 30, city: "SP" })

    // No invalidation (searchResults kept)
    expect(updates.searchResults).toBeUndefined()
  })
})

// =============================================================================
// E2E: Multi-step routing chain
// =============================================================================

describe("E2E: Multi-step routing chain simulation", () => {
  it("should demonstrate full chain: no data → collect → search → analyze → recommend", () => {
    // Step 1: User asks for recommendation with no data
    const state1 = createMockState({ lastIntent: "pedir_recomendacao" })
    const route1 = routeToCapabilityWithReason(state1)
    expect(route1.capability).toBe("updateClientInfo")
    expect(route1.redirected).toBe(true)

    // Step 2: After data collection, user asks again
    const state2 = createMockState({
      lastIntent: "pedir_recomendacao",
      clientInfo: { age: 30, city: "SP" },
      clientInfoVersion: 1
    })
    const route2 = routeToCapabilityWithReason(state2)
    expect(route2.capability).toBe("searchPlans")
    expect(route2.redirected).toBe(true)

    // Step 3: After search, user asks again
    const state3 = createMockState({
      lastIntent: "pedir_recomendacao",
      clientInfo: { age: 30, city: "SP" },
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1
    })
    const route3 = routeToCapabilityWithReason(state3)
    expect(route3.capability).toBe("analyzeCompatibility")
    expect(route3.redirected).toBe(true)

    // Step 4: After analysis, user asks again
    const state4 = createMockState({
      lastIntent: "pedir_recomendacao",
      clientInfo: { age: 30, city: "SP" },
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1,
      compatibilityAnalysis: { analyses: [] } as any,
      analysisVersion: 1
    })
    const route4 = routeToCapabilityWithReason(state4)
    expect(route4.capability).toBe("generateRecommendation")
    expect(route4.redirected).toBe(false)
  })
})
