/**
 * Testes para Fase 9: Conversa Geral + Finalização (Humanização Completa)
 *
 * Cobre:
 * - humanizeResponse (utility central)
 * - update-client-info (humanizado)
 * - search-plans (humanizado)
 * - analyze-compatibility (humanizado)
 * - respondToUser (implementação completa)
 * - endConversation (implementação completa + audit)
 *
 * @see lib/agents/health-plan-v2/nodes/capabilities/humanize-response.ts
 * @see lib/agents/health-plan-v2/nodes/capabilities/respond-to-user.ts
 * @see lib/agents/health-plan-v2/nodes/capabilities/end-conversation.ts
 * @see lib/agents/health-plan-v2/audit/save-conversation-audit.ts
 */

import type { HealthPlanState } from "../state/state-annotation"

// ============================================================================
// MOCKS
// ============================================================================

// Mock AIMessage
jest.mock("@langchain/core/messages", () => ({
  AIMessage: class AIMessage {
    content: string
    constructor(content: string) {
      this.content = content
    }
    _getType() {
      return "ai"
    }
  }
}))

// Track LLM invocations
let mockLLMInvokeResponse: any = null
let mockLLMInvokeCallCount = 0

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn().mockImplementation(async () => {
        mockLLMInvokeCallCount++
        if (mockLLMInvokeResponse instanceof Error) {
          throw mockLLMInvokeResponse
        }
        return mockLLMInvokeResponse
      })
    })
  }))
}))

// Mock Supabase for audit
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: "test-system-id" },
            error: null
          })
        })
      }),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: "test-audit-id" },
            error: null
          })
        })
      })
    })
  })
}))

// Mock audit module so we can track calls
let mockAuditResult: any = { success: true, auditId: "test-audit" }
let mockAuditCallCount = 0
let mockAuditLastParams: any = null

jest.mock("../audit/save-conversation-audit", () => ({
  saveConversationAuditV2: jest.fn().mockImplementation(async (params: any) => {
    mockAuditCallCount++
    mockAuditLastParams = params
    if (mockAuditResult instanceof Error) {
      throw mockAuditResult
    }
    return mockAuditResult
  })
}))

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestState(
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
  } as HealthPlanState
}

// ============================================================================
// SETUP
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks()
  mockLLMInvokeCallCount = 0
  mockLLMInvokeResponse = null
  mockAuditCallCount = 0
  mockAuditLastParams = null
  mockAuditResult = { success: true, auditId: "test-audit" }

  // Set required env vars for audit
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
})

// ============================================================================
// humanizeResponse (utility)
// ============================================================================

describe("humanizeResponse", () => {
  test("1. returns humanized text when LLM succeeds", async () => {
    mockLLMInvokeResponse = {
      response: "Olá! Que bom ter você aqui!",
      detectedTerms: ["carência"],
      tone: "greeting"
    }

    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    const result = await humanizeResponse({
      rawResponse: "Olá! Para encontrar planos...",
      state: createTestState(),
      messageType: "greeting"
    })

    expect(result.response).toBe("Olá! Que bom ter você aqui!")
    expect(result.detectedTerms).toEqual(["carência"])
    expect(result.tone).toBe("greeting")
  })

  test("2. falls back to glossary enrichment when LLM fails", async () => {
    mockLLMInvokeResponse = new Error("LLM timeout")

    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    const result = await humanizeResponse({
      rawResponse: "O plano tem carência de 180 dias.",
      state: createTestState(),
      messageType: "informative"
    })

    // Should contain the glossary explanation for "carência"
    expect(result.response).toContain("carência")
    expect(result.response).toContain("período de espera")
    expect(result.tone).toBe("neutral")
  })

  test("3. glossaryOnly applies glossary without LLM", async () => {
    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    const callCountBefore = mockLLMInvokeCallCount

    const result = await humanizeResponse({
      rawResponse: "Verifique a coparticipação e a rede credenciada.",
      state: createTestState(),
      messageType: "confirmation",
      glossaryOnly: true
    })

    // Should NOT have called LLM
    expect(mockLLMInvokeCallCount).toBe(callCountBefore)

    // Should have glossary enrichments
    expect(result.response).toContain("coparticipação")
    expect(result.tone).toBe("neutral")
  })

  test("4. preserves numeric data in responses", async () => {
    mockLLMInvokeResponse = {
      response: "Você tem 35 anos e orçamento de R$500/mês.",
      detectedTerms: [],
      tone: "informative"
    }

    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    const result = await humanizeResponse({
      rawResponse: "Idade: 35, Orçamento: R$500",
      state: createTestState({ clientInfo: { age: 35, budget: 500 } }),
      messageType: "confirmation"
    })

    expect(result.response).toContain("35")
    expect(result.response).toContain("500")
  })

  test("5. different messageTypes produce different tones", async () => {
    const tonesByType: Record<string, string> = {}

    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    for (const messageType of ["greeting", "error", "farewell"] as const) {
      mockLLMInvokeResponse = {
        response: `Response for ${messageType}`,
        detectedTerms: [],
        tone: messageType === "error" ? "neutral" : messageType
      }

      const result = await humanizeResponse({
        rawResponse: "Test message",
        state: createTestState(),
        messageType
      })

      tonesByType[messageType] = result.tone
    }

    // At least greeting and farewell should have distinct tones
    expect(tonesByType["greeting"]).toBe("greeting")
    expect(tonesByType["farewell"]).toBe("farewell")
  })
})

// ============================================================================
// update-client-info (humanizado)
// ============================================================================

describe("updateClientInfo (humanizado)", () => {
  test("6. initial greeting is generated by LLM", async () => {
    mockLLMInvokeResponse = {
      response: "Oi! Sou a Bia, sua consultora de planos!",
      detectedTerms: [],
      tone: "greeting"
    }

    const { updateClientInfo } = await import(
      "../nodes/capabilities/update-client-info"
    )

    const result = await updateClientInfo(createTestState({ clientInfo: {} }))

    expect(result.currentResponse).toBe(
      "Oi! Sou a Bia, sua consultora de planos!"
    )
    expect(result.messages).toHaveLength(1)
    expect(mockLLMInvokeCallCount).toBeGreaterThan(0)
  })

  test("7. follow-up questions are humanized", async () => {
    mockLLMInvokeResponse = {
      response: "Que legal, 30 anos! E em qual cidade você mora?",
      detectedTerms: [],
      tone: "informative"
    }

    const { updateClientInfo } = await import(
      "../nodes/capabilities/update-client-info"
    )

    const result = await updateClientInfo(
      createTestState({ clientInfo: { age: 30 } })
    )

    expect(result.currentResponse).toContain("cidade")
    expect(mockLLMInvokeCallCount).toBeGreaterThan(0)
  })

  test("8. confirmation is humanized while preserving exact data", async () => {
    mockLLMInvokeResponse = {
      response:
        "Perfeito! Seus dados: 35 anos, São Paulo-SP, orçamento R$500/mês.",
      detectedTerms: [],
      tone: "informative"
    }

    const { updateClientInfo } = await import(
      "../nodes/capabilities/update-client-info"
    )

    const result = await updateClientInfo(
      createTestState({
        clientInfo: {
          age: 35,
          city: "São Paulo",
          state: "SP",
          budget: 500
        }
      })
    )

    expect(result.currentResponse).toContain("35")
    expect(result.currentResponse).toContain("500")
    expect(mockLLMInvokeCallCount).toBeGreaterThan(0)
  })

  test("9. validation errors are handled with humanized messages", async () => {
    mockLLMInvokeResponse = {
      response: "Hmm, 150 anos parece bastante! Pode confirmar sua idade?",
      detectedTerms: [],
      tone: "neutral"
    }

    const { updateClientInfo } = await import(
      "../nodes/capabilities/update-client-info"
    )

    const result = await updateClientInfo(
      createTestState({ clientInfo: { age: 150 } })
    )

    // Should still work (humanized response), and have validation errors
    expect(result.currentResponse).toBeTruthy()
    expect(result.errors).toBeDefined()
  })
})

// ============================================================================
// search-plans (humanizado)
// ============================================================================

describe("searchPlans (humanizado)", () => {
  test("10. success message is humanized", async () => {
    mockLLMInvokeResponse = {
      response: "Ótimas notícias! Encontrei 3 planos que combinam com você!",
      detectedTerms: [],
      tone: "informative"
    }

    // Test at humanization level (search-plans has complex sub-graph deps)
    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    const result = await humanizeResponse({
      rawResponse: "Encontrei 3 planos compatíveis. Analisando...",
      state: createTestState(),
      messageType: "search_status"
    })

    expect(result.response).toBe(
      "Ótimas notícias! Encontrei 3 planos que combinam com você!"
    )
    expect(mockLLMInvokeCallCount).toBe(1)
  })

  test("11. error message is empathetic", async () => {
    mockLLMInvokeResponse = {
      response:
        "Poxa, tive um probleminha na busca. Mas não se preocupe, vamos tentar de outro jeito!",
      detectedTerms: [],
      tone: "neutral"
    }

    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    const result = await humanizeResponse({
      rawResponse:
        "Desculpe, houve um problema ao buscar os planos. Pode me contar mais?",
      state: createTestState(),
      messageType: "error"
    })

    expect(result.response).toBeTruthy()
    expect(result.response).not.toBe(
      "Desculpe, houve um problema ao buscar os planos. Pode me contar mais?"
    )
  })
})

// ============================================================================
// analyze-compatibility (humanizado)
// ============================================================================

describe("analyzeCompatibility (humanizado)", () => {
  test("12. ranking is presented in humanized form", async () => {
    mockLLMInvokeResponse = {
      response:
        "Analisei tudo! O melhor plano é o Unimed Básico com score 85/100.",
      detectedTerms: ["coparticipação"],
      tone: "informative"
    }

    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    const result = await humanizeResponse({
      rawResponse:
        "Analisei 3 planos:\n🥇 Unimed Básico - Score: 85/100 (Alta)\n🥈 Amil 400 - Score: 72/100 (Média)",
      state: createTestState(),
      messageType: "analysis_result"
    })

    expect(result.response).toContain("85")
    expect(mockLLMInvokeCallCount).toBe(1)
  })

  test("13. numeric scores are preserved", async () => {
    mockLLMInvokeResponse = {
      response:
        "O plano Unimed teve score 85/100, enquanto o Amil ficou com 72/100.",
      detectedTerms: [],
      tone: "informative"
    }

    const { humanizeResponse } = await import(
      "../nodes/capabilities/humanize-response"
    )

    const result = await humanizeResponse({
      rawResponse: "Score: 85/100, 72/100",
      state: createTestState(),
      messageType: "analysis_result"
    })

    expect(result.response).toContain("85")
    expect(result.response).toContain("72")
  })
})

// ============================================================================
// respondToUser
// ============================================================================

describe("respondToUser", () => {
  test("14. generates contextual response for educational question", async () => {
    mockLLMInvokeResponse = {
      response:
        "Coparticipação é um valor que você paga a cada vez que usa um serviço do plano, além da mensalidade fixa.",
      topicCategory: "glossary",
      termsExplained: ["coparticipação"]
    }

    const { respondToUser } = await import(
      "../nodes/capabilities/respond-to-user"
    )

    const humanMsg = {
      content: "O que é coparticipação?",
      _getType: () => "human"
    }

    const result = await respondToUser(
      createTestState({ messages: [humanMsg] as any })
    )

    expect(result.currentResponse?.toLowerCase()).toContain("coparticipação")
    expect(result.messages).toHaveLength(1)
  })

  test("15. uses ragAnalysisContext when available", async () => {
    mockLLMInvokeResponse = {
      response:
        "Com base nos planos que encontrei, a Unimed oferece boa cobertura na sua região.",
      topicCategory: "plan_comparison",
      termsExplained: []
    }

    const { respondToUser } = await import(
      "../nodes/capabilities/respond-to-user"
    )

    const humanMsg = {
      content: "Qual plano tem melhor cobertura?",
      _getType: () => "human"
    }

    const result = await respondToUser(
      createTestState({
        messages: [humanMsg] as any,
        ragAnalysisContext: "Unimed: cobertura ampla em SP..."
      })
    )

    expect(result.currentResponse).toBeTruthy()
    expect(mockLLMInvokeCallCount).toBe(1)
  })

  test("16. does NOT modify cache/version fields", async () => {
    mockLLMInvokeResponse = {
      response: "Carência é o período de espera...",
      topicCategory: "glossary",
      termsExplained: ["carência"]
    }

    const { respondToUser } = await import(
      "../nodes/capabilities/respond-to-user"
    )

    const humanMsg = {
      content: "O que é carência?",
      _getType: () => "human"
    }

    const result = await respondToUser(
      createTestState({ messages: [humanMsg] as any })
    )

    // Should NOT have these fields in the update
    expect(result).not.toHaveProperty("clientInfoVersion")
    expect(result).not.toHaveProperty("searchResultsVersion")
    expect(result).not.toHaveProperty("analysisVersion")
    expect(result).not.toHaveProperty("recommendationVersion")
    expect(result).not.toHaveProperty("searchResults")
    expect(result).not.toHaveProperty("compatibilityAnalysis")
  })

  test("17. graceful fallback when LLM fails", async () => {
    mockLLMInvokeResponse = new Error("LLM timeout")

    const { respondToUser } = await import(
      "../nodes/capabilities/respond-to-user"
    )

    const humanMsg = {
      content: "Me explique sobre planos",
      _getType: () => "human"
    }

    const result = await respondToUser(
      createTestState({ messages: [humanMsg] as any })
    )

    expect(result.currentResponse).toBeTruthy()
    expect(result.currentResponse).toContain("planos de saúde")
    expect(result.messages).toHaveLength(1)
  })
})

// ============================================================================
// endConversation
// ============================================================================

describe("endConversation", () => {
  test("18. sets isConversationActive to false", async () => {
    mockLLMInvokeResponse = {
      farewell: "Foi um prazer ajudar! Até a próxima!",
      conversationSummary: "Discutimos planos de saúde",
      hasRecommendation: false
    }

    const { endConversation } = await import(
      "../nodes/capabilities/end-conversation"
    )

    // Need enough messages to bypass accidental finalization protection
    const messages = Array.from({ length: 5 }, (_, i) => ({
      content: `Message ${i}`,
      _getType: () => (i % 2 === 0 ? "human" : "ai")
    }))

    const result = await endConversation(
      createTestState({ messages: messages as any })
    )

    expect(result.isConversationActive).toBe(false)
  })

  test("19. generates farewell with conversation summary", async () => {
    mockLLMInvokeResponse = {
      farewell:
        "Bia aqui! Foi ótimo ajudar você a encontrar um plano. Lembre-se de verificar a rede credenciada!",
      conversationSummary: "Buscamos planos para pessoa de 35 anos em SP",
      hasRecommendation: true
    }

    const { endConversation } = await import(
      "../nodes/capabilities/end-conversation"
    )

    const messages = Array.from({ length: 5 }, (_, i) => ({
      content: `Message ${i}`,
      _getType: () => (i % 2 === 0 ? "human" : "ai")
    }))

    const result = await endConversation(
      createTestState({
        messages: messages as any,
        clientInfo: { age: 35, city: "São Paulo", state: "SP" },
        recommendation: {
          markdown: "# Recomendação",
          topPlanId: "unimed-basico",
          alternativeIds: [],
          highlights: [],
          warnings: [],
          nextSteps: [],
          version: 1,
          timestamp: new Date().toISOString()
        }
      })
    )

    expect(result.currentResponse).toContain("rede credenciada")
    expect(result.messages).toHaveLength(1)
  })

  test("20. calls audit save with correct parameters", async () => {
    mockLLMInvokeResponse = {
      farewell: "Obrigada pela conversa!",
      conversationSummary: "Conversa sobre planos",
      hasRecommendation: false
    }

    const { endConversation } = await import(
      "../nodes/capabilities/end-conversation"
    )

    const messages = Array.from({ length: 5 }, (_, i) => ({
      content: `Message ${i}`,
      _getType: () => (i % 2 === 0 ? "human" : "ai")
    }))

    await endConversation(createTestState({ messages: messages as any }))

    // Wait a tick for the non-blocking audit
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockAuditCallCount).toBeGreaterThanOrEqual(1)
    expect(mockAuditLastParams).toEqual(
      expect.objectContaining({
        state: expect.objectContaining({ workspaceId: "test-workspace" }),
        farewellMessage: expect.any(String)
      })
    )
  })

  test("21. protection against accidental finalization", async () => {
    const { endConversation } = await import(
      "../nodes/capabilities/end-conversation"
    )

    // Only 1 message, no recommendation = should ask for confirmation
    const result = await endConversation(
      createTestState({
        messages: [{ content: "oi", _getType: () => "human" }] as any
      })
    )

    // Should NOT set isConversationActive to false
    expect(result.isConversationActive).toBeUndefined()
    expect(result.currentResponse).toContain("certeza")
  })

  test("22. audit failure does not block response", async () => {
    mockLLMInvokeResponse = {
      farewell: "Até logo!",
      conversationSummary: "Conversa curta",
      hasRecommendation: false
    }

    // Make audit fail
    mockAuditResult = new Error("Database down")

    const { endConversation } = await import(
      "../nodes/capabilities/end-conversation"
    )

    const messages = Array.from({ length: 5 }, (_, i) => ({
      content: `Message ${i}`,
      _getType: () => (i % 2 === 0 ? "human" : "ai")
    }))

    const result = await endConversation(
      createTestState({ messages: messages as any })
    )

    // Response should still be returned even though audit failed
    expect(result.isConversationActive).toBe(false)
    expect(result.currentResponse).toBe("Até logo!")
  })
})
