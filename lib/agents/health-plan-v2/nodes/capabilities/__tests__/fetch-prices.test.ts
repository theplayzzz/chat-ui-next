/**
 * Testes unitários para fetchPrices (stub)
 * Cobre: comportamento stub, não alterar state existente
 */

import { fetchPrices } from "../fetch-prices"
import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../../state/state-annotation"

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

describe("fetchPrices (stub)", () => {
  it("1. should return a placeholder price response", async () => {
    const state = createState()
    const result = await fetchPrices(state)

    expect(result.currentResponse).toBeDefined()
    expect(result.currentResponse!.length).toBeGreaterThan(20)
    expect(result.pricesRequested).toBe(true)
  })

  it("2. should return an AIMessage in messages", async () => {
    const state = createState()
    const result = await fetchPrices(state)

    expect(result.messages).toBeDefined()
    expect(result.messages!.length).toBe(1)
    expect(result.messages![0]).toBeInstanceOf(AIMessage)
  })

  it("2b. should not modify other existing state fields", async () => {
    const state = createState({
      clientInfo: { age: 40, city: "RJ" },
      searchResults: [{ id: "1" } as any],
      analysisVersion: 5
    })

    const result = await fetchPrices(state)

    // Only pricesRequested, currentResponse, messages should be in result
    expect(result.clientInfo).toBeUndefined()
    expect(result.searchResults).toBeUndefined()
    expect(result.analysisVersion).toBeUndefined()
    expect(result.pricesRequested).toBe(true)
  })
})
