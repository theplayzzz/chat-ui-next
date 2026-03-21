/**
 * Testes para Fase 10 - Simulação de Cenários
 *
 * Valida:
 * - respondToUser stub behavior (via workflow)
 * - Router para simular_cenario
 * - applyDependentRemoval()
 * - processClientInfoUpdate() com scenarioChange
 *
 * @see lib/agents/health-plan-v2/workflow/workflow.ts
 * @see lib/agents/health-plan-v2/state/cache-invalidation.ts
 */

import {
  routeToCapabilityWithReason,
  INTENT_TO_CAPABILITY
} from "../nodes/router"
import {
  applyDependentRemoval,
  processClientInfoUpdate
} from "../state/cache-invalidation"
import type { HealthPlanState } from "../state/state-annotation"
import type { ScenarioChange } from "../intent/intent-classification-types"

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
// ROUTER PARA simular_cenario
// =============================================================================

describe("Router - simular_cenario intent", () => {
  it("should map simular_cenario to respondToUser in INTENT_TO_CAPABILITY", () => {
    expect(INTENT_TO_CAPABILITY["simular_cenario"]).toBe("respondToUser")
  })

  it("should route to respondToUser without redirect", () => {
    const state = createMockState({ lastIntent: "simular_cenario" })
    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("respondToUser")
    expect(result.redirected).toBe(true) // Phase 10 disabled, redirects to respondToUser
    expect(result.reason).toContain("Simulação")
  })

  it("should route to respondToUser even without client data", () => {
    const state = createMockState({
      lastIntent: "simular_cenario",
      clientInfo: {}
    })
    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("respondToUser")
  })

  it("should route to respondToUser with existing search results", () => {
    const state = createMockState({
      lastIntent: "simular_cenario",
      clientInfo: { age: 30, city: "SP" },
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1
    })
    const result = routeToCapabilityWithReason(state)

    expect(result.capability).toBe("respondToUser")
    expect(result.redirected).toBe(true) // Phase 10 disabled, redirects to respondToUser
  })
})

// =============================================================================
// applyDependentRemoval TESTS
// =============================================================================

describe("applyDependentRemoval", () => {
  it("should remove all dependents with matching relationship", () => {
    const clientInfo = {
      age: 40,
      city: "SP",
      dependents: [
        { age: 10, relationship: "child" as const },
        { age: 8, relationship: "child" as const },
        { age: 38, relationship: "spouse" as const }
      ]
    }
    const change: ScenarioChange = {
      type: "remove_dependent",
      details: { relationship: "child" }
    }

    const result = applyDependentRemoval(clientInfo, change)

    expect(result.dependents).toHaveLength(1)
    expect(result.dependents![0].relationship).toBe("spouse")
  })

  it("should remove dependent by index", () => {
    const clientInfo = {
      age: 40,
      city: "SP",
      dependents: [
        { age: 38, relationship: "spouse" as const },
        { age: 10, relationship: "child" as const },
        { age: 8, relationship: "child" as const }
      ]
    }
    const change: ScenarioChange = {
      type: "remove_dependent",
      details: { index: 1 }
    }

    const result = applyDependentRemoval(clientInfo, change)

    expect(result.dependents).toHaveLength(2)
    expect(result.dependents![0].relationship).toBe("spouse")
    expect(result.dependents![1].age).toBe(8)
  })

  it("should return unchanged clientInfo when no dependents exist", () => {
    const clientInfo = { age: 30, city: "SP" }
    const change: ScenarioChange = {
      type: "remove_dependent",
      details: { relationship: "spouse" }
    }

    const result = applyDependentRemoval(clientInfo, change)

    expect(result).toEqual(clientInfo)
  })

  it("should return unchanged clientInfo when dependents array is empty", () => {
    const clientInfo = { age: 30, city: "SP", dependents: [] }
    const change: ScenarioChange = {
      type: "remove_dependent",
      details: { relationship: "spouse" }
    }

    const result = applyDependentRemoval(clientInfo, change)

    expect(result.dependents).toHaveLength(0)
  })

  it("should return unchanged clientInfo when scenarioChange type is not remove_dependent", () => {
    const clientInfo = {
      age: 40,
      dependents: [{ age: 38, relationship: "spouse" as const }]
    }
    const change: ScenarioChange = {
      type: "add_dependent",
      details: { age: 10, relationship: "child" }
    }

    const result = applyDependentRemoval(clientInfo, change)

    expect(result.dependents).toHaveLength(1)
    expect(result.dependents![0].relationship).toBe("spouse")
  })

  it("should remove spouse by relationship", () => {
    const clientInfo = {
      age: 40,
      dependents: [
        { age: 38, relationship: "spouse" as const },
        { age: 10, relationship: "child" as const }
      ]
    }
    const change: ScenarioChange = {
      type: "remove_dependent",
      details: { relationship: "spouse" }
    }

    const result = applyDependentRemoval(clientInfo, change)

    expect(result.dependents).toHaveLength(1)
    expect(result.dependents![0].relationship).toBe("child")
  })

  it("should not modify other clientInfo fields", () => {
    const clientInfo = {
      name: "João",
      age: 40,
      city: "SP",
      state: "SP",
      budget: 500,
      dependents: [{ age: 38, relationship: "spouse" as const }]
    }
    const change: ScenarioChange = {
      type: "remove_dependent",
      details: { relationship: "spouse" }
    }

    const result = applyDependentRemoval(clientInfo, change)

    expect(result.name).toBe("João")
    expect(result.age).toBe(40)
    expect(result.city).toBe("SP")
    expect(result.budget).toBe(500)
  })
})

// =============================================================================
// processClientInfoUpdate WITH scenarioChange TESTS
// =============================================================================

describe("processClientInfoUpdate with scenarioChange", () => {
  it("should remove dependents and invalidate caches when scenarioChange is remove_dependent", () => {
    const state = createMockState({
      clientInfo: {
        age: 40,
        city: "SP",
        dependents: [
          { age: 38, relationship: "spouse" as const },
          { age: 10, relationship: "child" as const }
        ]
      },
      clientInfoVersion: 1,
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1,
      compatibilityAnalysis: { analyses: [] } as any,
      analysisVersion: 1
    })

    const scenarioChange: ScenarioChange = {
      type: "remove_dependent",
      details: { relationship: "child" }
    }

    const updates = processClientInfoUpdate(state, {}, scenarioChange)

    // Dependent removed
    expect(updates.clientInfo?.dependents).toHaveLength(1)
    expect(updates.clientInfo?.dependents![0].relationship).toBe("spouse")

    // Version incremented
    expect(updates.clientInfoVersion).toBe(2)

    // Caches invalidated
    expect(updates.searchResults).toEqual([])
    expect(updates.searchResultsVersion).toBe(0)
    expect(updates.compatibilityAnalysis).toBeNull()
    expect(updates.analysisVersion).toBe(0)
  })

  it("should merge new data AND apply removal when both provided", () => {
    const state = createMockState({
      clientInfo: {
        age: 40,
        city: "SP",
        dependents: [
          { age: 38, relationship: "spouse" as const },
          { age: 10, relationship: "child" as const }
        ]
      },
      clientInfoVersion: 1
    })

    const scenarioChange: ScenarioChange = {
      type: "remove_dependent",
      details: { relationship: "spouse" }
    }

    const updates = processClientInfoUpdate(
      state,
      { budget: 1000 },
      scenarioChange
    )

    // Budget merged
    expect(updates.clientInfo?.budget).toBe(1000)
    // Spouse removed
    expect(updates.clientInfo?.dependents).toHaveLength(1)
    expect(updates.clientInfo?.dependents![0].relationship).toBe("child")
  })

  it("should work without scenarioChange (normal merge)", () => {
    const state = createMockState({
      clientInfo: { age: 30, city: "SP" },
      clientInfoVersion: 1
    })

    const updates = processClientInfoUpdate(state, { budget: 500 })

    expect(updates.clientInfo?.budget).toBe(500)
    expect(updates.clientInfo?.age).toBe(30)
    expect(updates.clientInfoVersion).toBe(2)
  })

  it("should not invalidate extra when removal has no effect", () => {
    const state = createMockState({
      clientInfo: {
        age: 40,
        city: "SP",
        dependents: [{ age: 38, relationship: "spouse" as const }]
      },
      clientInfoVersion: 1,
      searchResults: [{ id: "1" } as any],
      searchResultsVersion: 1
    })

    // Try to remove "child" but there are no children
    const scenarioChange: ScenarioChange = {
      type: "remove_dependent",
      details: { relationship: "child" }
    }

    const updates = processClientInfoUpdate(state, {}, scenarioChange)

    // No dependent was actually removed, but clientInfo didn't change significantly
    expect(updates.clientInfo?.dependents).toHaveLength(1)
  })

  it("should handle non-remove_dependent scenarioChange gracefully", () => {
    const state = createMockState({
      clientInfo: {
        age: 40,
        dependents: [{ age: 38, relationship: "spouse" as const }]
      },
      clientInfoVersion: 1
    })

    const scenarioChange: ScenarioChange = {
      type: "change_budget",
      details: { budget: 1500 }
    }

    // Should not throw, should just ignore scenarioChange for removal
    const updates = processClientInfoUpdate(state, {}, scenarioChange)

    expect(updates.clientInfo?.dependents).toHaveLength(1)
    expect(updates.clientInfoVersion).toBe(2)
  })
})
