/**
 * Testes para Cache Invalidation Logic
 *
 * @see lib/agents/health-plan-v2/state/cache-invalidation.ts
 */

import {
  INVALIDATION_RULES,
  hasSignificantChange,
  onClientInfoChange,
  getInvalidationUpdates,
  isCacheStale,
  getStaleCapabilities
} from "../state/cache-invalidation"
import type { PartialClientInfo } from "../types"
import type { HealthPlanState } from "../state/state-annotation"

describe("INVALIDATION_RULES", () => {
  it("should have correct dependencies for clientInfo", () => {
    expect(INVALIDATION_RULES.clientInfo).toContain("searchResults")
    expect(INVALIDATION_RULES.clientInfo).toContain("compatibilityAnalysis")
    expect(INVALIDATION_RULES.clientInfo).toContain("recommendation")
  })

  it("should have correct dependencies for searchResults", () => {
    expect(INVALIDATION_RULES.searchResults).toContain("compatibilityAnalysis")
    expect(INVALIDATION_RULES.searchResults).toContain("recommendation")
    expect(INVALIDATION_RULES.searchResults).not.toContain("searchResults")
  })

  it("should have correct dependencies for compatibilityAnalysis", () => {
    expect(INVALIDATION_RULES.compatibilityAnalysis).toContain("recommendation")
    expect(INVALIDATION_RULES.compatibilityAnalysis).toHaveLength(1)
  })

  it("should have empty dependencies for erpPrices", () => {
    expect(INVALIDATION_RULES.erpPrices).toHaveLength(0)
  })
})

describe("hasSignificantChange", () => {
  it("should return true when age changes", () => {
    const oldInfo: PartialClientInfo = { age: 30, name: "João" }
    const newInfo: PartialClientInfo = { age: 35, name: "João" }

    expect(hasSignificantChange(oldInfo, newInfo)).toBe(true)
  })

  it("should return true when city changes", () => {
    const oldInfo: PartialClientInfo = { city: "São Paulo", age: 30 }
    const newInfo: PartialClientInfo = { city: "Rio de Janeiro", age: 30 }

    expect(hasSignificantChange(oldInfo, newInfo)).toBe(true)
  })

  it("should return true when dependents are added", () => {
    const oldInfo: PartialClientInfo = { dependents: [], age: 30 }
    const newInfo: PartialClientInfo = {
      dependents: [{ age: 5, relationship: "child" }],
      age: 30
    }

    expect(hasSignificantChange(oldInfo, newInfo)).toBe(true)
  })

  it("should return true when budget changes", () => {
    const oldInfo: PartialClientInfo = { budget: 500, age: 30 }
    const newInfo: PartialClientInfo = { budget: 800, age: 30 }

    expect(hasSignificantChange(oldInfo, newInfo)).toBe(true)
  })

  it("should return false when only name changes", () => {
    const oldInfo: PartialClientInfo = { name: "João", age: 30 }
    const newInfo: PartialClientInfo = { name: "João Silva", age: 30 }

    expect(hasSignificantChange(oldInfo, newInfo)).toBe(false)
  })

  it("should return false when only preferences change", () => {
    const oldInfo: PartialClientInfo = { preferences: ["hospital"], age: 30 }
    const newInfo: PartialClientInfo = {
      preferences: ["hospital", "dentista"],
      age: 30
    }

    expect(hasSignificantChange(oldInfo, newInfo)).toBe(false)
  })

  it("should return false when nothing changes", () => {
    const info: PartialClientInfo = { age: 30, city: "SP" }

    expect(hasSignificantChange(info, info)).toBe(false)
  })

  it("should return true when healthConditions change", () => {
    const oldInfo: PartialClientInfo = { healthConditions: [], age: 30 }
    const newInfo: PartialClientInfo = {
      healthConditions: ["diabetes"],
      age: 30
    }

    expect(hasSignificantChange(oldInfo, newInfo)).toBe(true)
  })
})

describe("onClientInfoChange", () => {
  it("should detect significant change and return merged info", () => {
    const oldInfo: PartialClientInfo = { age: 30, name: "João" }
    const newData: Partial<PartialClientInfo> = { age: 35 }

    const result = onClientInfoChange(oldInfo, newData)

    expect(result.shouldInvalidate).toBe(true)
    expect(result.changedFields).toContain("age")
    expect(result.mergedInfo.age).toBe(35)
    expect(result.mergedInfo.name).toBe("João")
  })

  it("should detect non-significant change", () => {
    const oldInfo: PartialClientInfo = { age: 30, name: "João" }
    const newData: Partial<PartialClientInfo> = { name: "João Silva" }

    const result = onClientInfoChange(oldInfo, newData)

    expect(result.shouldInvalidate).toBe(false)
    expect(result.changedFields).toContain("name")
    expect(result.mergedInfo.name).toBe("João Silva")
  })

  it("should merge new fields correctly", () => {
    const oldInfo: PartialClientInfo = { age: 30 }
    const newData: Partial<PartialClientInfo> = { city: "SP", state: "SP" }

    const result = onClientInfoChange(oldInfo, newData)

    expect(result.shouldInvalidate).toBe(true) // city é campo crítico
    expect(result.mergedInfo.age).toBe(30)
    expect(result.mergedInfo.city).toBe("SP")
    expect(result.mergedInfo.state).toBe("SP")
  })
})

describe("getInvalidationUpdates", () => {
  it("should return updates for clientInfo change", () => {
    const updates = getInvalidationUpdates("clientInfo")

    expect(updates.searchResults).toEqual([])
    expect(updates.searchResultsVersion).toBe(0)
    expect(updates.compatibilityAnalysis).toBeNull()
    expect(updates.analysisVersion).toBe(0)
    expect(updates.recommendation).toBeNull()
    expect(updates.recommendationVersion).toBe(0)
  })

  it("should return updates for searchResults change", () => {
    const updates = getInvalidationUpdates("searchResults")

    expect(updates.searchResults).toBeUndefined() // Não invalida a si mesmo
    expect(updates.compatibilityAnalysis).toBeNull()
    expect(updates.recommendation).toBeNull()
  })

  it("should return updates for compatibilityAnalysis change", () => {
    const updates = getInvalidationUpdates("compatibilityAnalysis")

    expect(updates.recommendation).toBeNull()
    expect(updates.recommendationVersion).toBe(0)
    expect(updates.searchResults).toBeUndefined()
    expect(updates.compatibilityAnalysis).toBeUndefined()
  })

  it("should return empty updates for erpPrices change", () => {
    const updates = getInvalidationUpdates("erpPrices")

    expect(Object.keys(updates)).toHaveLength(0)
  })
})

describe("isCacheStale", () => {
  it("should return true when cache is older than upstream", () => {
    expect(isCacheStale(0, 1)).toBe(true)
    expect(isCacheStale(1, 2)).toBe(true)
  })

  it("should return false when cache is current", () => {
    expect(isCacheStale(1, 1)).toBe(false)
    expect(isCacheStale(2, 1)).toBe(false)
  })
})

describe("getStaleCapabilities", () => {
  it("should return searchPlans when clientInfo exists but searchResults is empty", () => {
    const state = {
      clientInfoVersion: 1,
      searchResults: [],
      searchResultsVersion: 0,
      compatibilityAnalysis: null,
      analysisVersion: 0,
      recommendation: null,
      recommendationVersion: 0
    } as unknown as HealthPlanState

    const stale = getStaleCapabilities(state)

    expect(stale).toContain("searchPlans")
  })

  it("should return analyzeCompatibility when searchResults exists but analysis is null", () => {
    const state = {
      clientInfoVersion: 1,
      searchResults: [{ id: "1" }],
      searchResultsVersion: 1,
      compatibilityAnalysis: null,
      analysisVersion: 0,
      recommendation: null,
      recommendationVersion: 0
    } as unknown as HealthPlanState

    const stale = getStaleCapabilities(state)

    expect(stale).toContain("analyzeCompatibility")
  })

  it("should return generateRecommendation when analysis exists but recommendation is null", () => {
    const state = {
      clientInfoVersion: 1,
      searchResults: [{ id: "1" }],
      searchResultsVersion: 1,
      compatibilityAnalysis: { analyses: [] },
      analysisVersion: 1,
      recommendation: null,
      recommendationVersion: 0
    } as unknown as HealthPlanState

    const stale = getStaleCapabilities(state)

    expect(stale).toContain("generateRecommendation")
  })

  it("should return empty array when everything is up to date", () => {
    const state = {
      clientInfoVersion: 1,
      searchResults: [{ id: "1" }],
      searchResultsVersion: 1,
      compatibilityAnalysis: { analyses: [] },
      analysisVersion: 1,
      recommendation: { markdown: "test" },
      recommendationVersion: 1
    } as unknown as HealthPlanState

    const stale = getStaleCapabilities(state)

    expect(stale).toHaveLength(0)
  })
})
