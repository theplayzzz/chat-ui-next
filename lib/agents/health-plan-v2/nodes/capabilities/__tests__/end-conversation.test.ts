/**
 * Testes unitários para endConversation
 * Cobre: finalização com LLM, proteção contre finalização acidental, fallback LLM, isConversationActive
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

jest.mock("../../../audit/save-conversation-audit", () => ({
  saveConversationAuditV2: jest.fn().mockResolvedValue(undefined)
}))

import { endConversation } from "../end-conversation"
import { HumanMessage, AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../../state/state-annotation"

function createState(
  overrides: Partial<HealthPlanState> = {}
): HealthPlanState {
  return {
    workspaceId: "ws1",
    userId: "u1",
    assistantId: "a1",
    chatId: "c1",
    messages: [
      new HumanMessage("Olá"),
      new AIMessage("Olá! Como posso ajudar?"),
      new HumanMessage("Quero encerrar"),
      new AIMessage("Claro!"),
      new HumanMessage("Tchau")
    ],
    lastIntent: "finalizar",
    lastIntentConfidence: 0.9,
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

describe("endConversation", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockWithStructuredOutput.mockReturnValue({ invoke: mockInvoke })
  })

  it("1. should finalize conversation with farewell when LLM succeeds", async () => {
    mockInvoke.mockResolvedValueOnce({
      farewell: "Foi um prazer te ajudar! Até logo!",
      conversationSummary: "O usuário pesquisou planos",
      hasRecommendation: false
    })

    const state = createState()
    const result = await endConversation(state)

    expect(result.isConversationActive).toBe(false)
    expect(result.currentResponse).toBe("Foi um prazer te ajudar! Até logo!")
    expect(result.messages!.length).toBeGreaterThan(0)
    expect(result.messages![0]).toBeInstanceOf(AIMessage)
  })

  it("2. should protect against accidental ending (few messages, no recommendation)", async () => {
    const state = createState({
      messages: [new HumanMessage("Oi")],
      recommendation: null
    })

    const result = await endConversation(state)

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.currentResponse).toContain("certeza")
    expect(result.isConversationActive).toBeUndefined() // Not set (not finalized)
  })

  it("3. should use fallback when LLM fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("LLM crash"))

    const state = createState()
    const result = await endConversation(state)

    expect(result.isConversationActive).toBe(false)
    expect(result.currentResponse).toContain("prazer")
    expect(result.messages![0]).toBeInstanceOf(AIMessage)
  })

  it("4. should set isConversationActive=false after successful end", async () => {
    mockInvoke.mockResolvedValueOnce({
      farewell: "Até mais!",
      conversationSummary: "-",
      hasRecommendation: true
    })

    const state = createState()
    const result = await endConversation(state)

    expect(result.isConversationActive).toBe(false)
  })
})
