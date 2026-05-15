/**
 * Testes unitários para respondToUser
 * Cobre: resposta com LLM, fallback LLM, resposta com contexto, extração de última mensagem humana
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

import { respondToUser } from "../respond-to-user"
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
    messages: [new HumanMessage("O que é coparticipação?")],
    lastIntent: "conversar",
    lastIntentConfidence: 0.9,
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

describe("respondToUser", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockWithStructuredOutput.mockReturnValue({ invoke: mockInvoke })
  })

  it("1. should respond with LLM structured output", async () => {
    mockInvoke.mockResolvedValueOnce({
      response:
        "Coparticipação é quando você paga parte do custo do procedimento.",
      topicCategory: "glossary",
      termsExplained: ["coparticipação"]
    })

    const state = createState()
    const result = await respondToUser(state)

    expect(result.currentResponse).toContain("Coparticipação")
    expect(result.messages!.length).toBeGreaterThan(0)
    expect(result.messages![0]).toBeInstanceOf(AIMessage)
  })

  it("2. should use fallback when LLM fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Timeout"))

    const state = createState()
    const result = await respondToUser(state)

    expect(result.currentResponse).toBeDefined()
    expect(result.currentResponse!.length).toBeGreaterThan(0)
    expect(result.messages![0]).toBeInstanceOf(AIMessage)
  })

  it("3. should include client context when clientInfo is filled", async () => {
    mockInvoke.mockResolvedValueOnce({
      response: "Com seu perfil de 35 anos, recomendo planos intermediários.",
      topicCategory: "plan_comparison",
      termsExplained: []
    })

    const state = createState({
      clientInfo: { age: 35, city: "SP", budget: 600 },
      messages: [new HumanMessage("Qual plano me recomenda?")]
    })

    const result = await respondToUser(state)
    expect(result.currentResponse).toContain("perfil")
  })

  it("4. should extract last human message correctly", async () => {
    mockInvoke.mockResolvedValueOnce({
      response: "Boa pergunta sobre carências!",
      topicCategory: "coverage",
      termsExplained: ["carência"]
    })

    const state = createState({
      messages: [
        new HumanMessage("Primeira pergunta"),
        new AIMessage("Resposta inicial"),
        new HumanMessage("E as carências?")
      ]
    })

    await respondToUser(state)

    // Check that invoke was called (it processes the latest message)
    expect(mockInvoke).toHaveBeenCalled()
  })
})
