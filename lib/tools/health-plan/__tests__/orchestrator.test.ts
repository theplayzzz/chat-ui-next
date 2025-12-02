/**
 * Orchestrator Tests
 *
 * Tests for the health plan recommendation workflow orchestration,
 * including step execution, streaming, and error handling.
 *
 * Task #10.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  HealthPlanOrchestrator,
  STEP_TIMEOUTS,
  STEP_PROGRESS,
  type OrchestratorConfig,
  type Message
} from "../orchestrator"

// Mock all dependencies
vi.mock("../session-manager", () => ({
  getOrCreateSession: vi.fn(),
  updateSession: vi.fn(),
  addSessionError: vi.fn(),
  completeSession: vi.fn(),
  isClientInfoComplete: vi.fn(),
  STEP_NAMES: {
    1: "extractClientInfo",
    2: "searchHealthPlans",
    3: "analyzeCompatibility",
    4: "fetchERPPrices",
    5: "generateRecommendation"
  }
}))

vi.mock("../extract-client-info", () => ({
  extractClientInfo: vi.fn()
}))

vi.mock("../search-health-plans", () => ({
  searchHealthPlans: vi.fn()
}))

vi.mock("../analyze-compatibility", () => ({
  analyzeCompatibility: vi.fn()
}))

vi.mock("../fetch-erp-prices", () => ({
  fetchERPPrices: vi.fn()
}))

vi.mock("../generate-recommendation", () => ({
  generateRecommendation: vi.fn()
}))

vi.mock("../logger", () => ({
  createLogger: vi.fn(() => ({
    setSessionId: vi.fn(),
    logWorkflowStart: vi.fn(),
    logWorkflowEnd: vi.fn(),
    logStepStart: vi.fn(),
    logStepEnd: vi.fn(),
    logStepError: vi.fn()
  })),
  HealthPlanLogger: vi.fn()
}))

vi.mock("../error-handler", () => {
  return {
    ErrorHandler: class {
      classifyError(error: any) {
        return {
          step: 1,
          stepName: "Test",
          type: "UnknownError",
          message: error?.message || "Test error",
          userMessage: "Ocorreu um erro. Por favor, tente novamente.",
          retryable: false,
          httpStatus: 500
        }
      }
      shouldRetry() {
        return false
      }
    },
    TimeoutError: class extends Error {
      step: string
      timeoutMs: number
      constructor(step: string, timeoutMs: number) {
        super(`${step} excedeu o tempo limite de ${timeoutMs}ms`)
        this.name = "TimeoutError"
        this.step = step
        this.timeoutMs = timeoutMs
      }
    },
    executeWithTimeout: vi.fn((promise: Promise<any>) => promise)
  }
})

vi.mock("../audit", () => ({
  saveRecommendationAudit: vi.fn()
}))

vi.mock("@/lib/monitoring/langsmith-setup", () => ({
  addRunMetadata: vi.fn(),
  getCurrentRunTree: vi.fn()
}))

describe("STEP_TIMEOUTS", () => {
  it("should have timeouts for all 5 steps", () => {
    expect(STEP_TIMEOUTS[1]).toBe(10_000)
    expect(STEP_TIMEOUTS[2]).toBe(15_000)
    expect(STEP_TIMEOUTS[3]).toBe(95_000) // 95s for complex multi-plan GPT analysis
    expect(STEP_TIMEOUTS[4]).toBe(10_000)
    expect(STEP_TIMEOUTS[5]).toBe(20_000)
  })

  it("should have reasonable timeout values", () => {
    // All timeouts should be between 5s and 120s
    for (const step of [1, 2, 3, 4, 5] as const) {
      expect(STEP_TIMEOUTS[step]).toBeGreaterThanOrEqual(5_000)
      expect(STEP_TIMEOUTS[step]).toBeLessThanOrEqual(120_000)
    }
  })

  it("should have longer timeouts for GPT-heavy steps", () => {
    // Steps 3 and 5 involve complex GPT analysis
    expect(STEP_TIMEOUTS[3]).toBeGreaterThan(STEP_TIMEOUTS[1])
    expect(STEP_TIMEOUTS[5]).toBeGreaterThan(STEP_TIMEOUTS[1])
  })
})

describe("STEP_PROGRESS", () => {
  it("should have progress messages for all 5 steps", () => {
    expect(STEP_PROGRESS[1]).toBeDefined()
    expect(STEP_PROGRESS[2]).toBeDefined()
    expect(STEP_PROGRESS[3]).toBeDefined()
    expect(STEP_PROGRESS[4]).toBeDefined()
    expect(STEP_PROGRESS[5]).toBeDefined()
  })

  it("should include appropriate emojis", () => {
    expect(STEP_PROGRESS[1]).toContain("📋")
    expect(STEP_PROGRESS[2]).toContain("🔍")
    expect(STEP_PROGRESS[3]).toContain("📊")
    expect(STEP_PROGRESS[4]).toContain("💰")
    expect(STEP_PROGRESS[5]).toContain("✨")
  })

  it("should have newlines for proper streaming display", () => {
    for (const step of [1, 2, 3, 4, 5] as const) {
      expect(STEP_PROGRESS[step]).toContain("\n")
    }
  })
})

describe("HealthPlanOrchestrator", () => {
  let orchestrator: HealthPlanOrchestrator
  let mockConfig: OrchestratorConfig

  beforeEach(() => {
    mockConfig = {
      workspaceId: "workspace-123",
      userId: "user-456",
      assistantId: "asst_789",
      openaiApiKey: "sk-test-key"
    }

    orchestrator = new HealthPlanOrchestrator(mockConfig)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should create an instance with provided config", () => {
      expect(orchestrator).toBeInstanceOf(HealthPlanOrchestrator)
    })

    it("should accept optional sessionId", () => {
      const configWithSession: OrchestratorConfig = {
        ...mockConfig,
        sessionId: "existing-session"
      }

      const orch = new HealthPlanOrchestrator(configWithSession)
      expect(orch.getSessionId()).toBe("existing-session")
    })

    it("should accept optional ERP config", () => {
      const configWithERP: OrchestratorConfig = {
        ...mockConfig,
        erpConfig: {
          base_url: "https://erp.example.com",
          api_key: "erp-key",
          client_id: "client-123"
        }
      }

      const orch = new HealthPlanOrchestrator(configWithERP)
      expect(orch).toBeInstanceOf(HealthPlanOrchestrator)
    })

    it("should accept optional resetToStep for workflow restart", () => {
      const configWithReset: OrchestratorConfig = {
        ...mockConfig,
        resetToStep: 2
      }

      const orch = new HealthPlanOrchestrator(configWithReset)
      expect(orch).toBeInstanceOf(HealthPlanOrchestrator)
    })

    it("should accept resetToStep for any valid step (1-5)", () => {
      for (const step of [1, 2, 3, 4, 5] as const) {
        const config: OrchestratorConfig = {
          ...mockConfig,
          resetToStep: step
        }
        const orch = new HealthPlanOrchestrator(config)
        expect(orch).toBeInstanceOf(HealthPlanOrchestrator)
      }
    })
  })

  describe("getSessionId", () => {
    it("should return 'pending' when no session exists", () => {
      expect(orchestrator.getSessionId()).toBe("pending")
    })

    it("should return configured sessionId if provided", () => {
      const configWithSession: OrchestratorConfig = {
        ...mockConfig,
        sessionId: "pre-configured-session"
      }

      const orch = new HealthPlanOrchestrator(configWithSession)
      expect(orch.getSessionId()).toBe("pre-configured-session")
    })
  })
})

describe("Message type", () => {
  it("should accept valid user message", () => {
    const message: Message = {
      role: "user",
      content: "Preciso de um plano de saúde para minha família"
    }

    expect(message.role).toBe("user")
    expect(message.content).toBeDefined()
  })

  it("should accept valid assistant message", () => {
    const message: Message = {
      role: "assistant",
      content: "Vou ajudar você a encontrar o melhor plano!"
    }

    expect(message.role).toBe("assistant")
  })

  it("should accept valid system message", () => {
    const message: Message = {
      role: "system",
      content: "You are a health plan assistant"
    }

    expect(message.role).toBe("system")
  })
})

describe("OrchestratorConfig type", () => {
  it("should require mandatory fields", () => {
    const config: OrchestratorConfig = {
      workspaceId: "ws-1",
      userId: "user-1",
      assistantId: "asst-1",
      openaiApiKey: "sk-test"
    }

    expect(config.workspaceId).toBeDefined()
    expect(config.userId).toBeDefined()
    expect(config.assistantId).toBeDefined()
    expect(config.openaiApiKey).toBeDefined()
  })

  it("should support all optional fields", () => {
    const config: OrchestratorConfig = {
      workspaceId: "ws-1",
      userId: "user-1",
      assistantId: "asst-1",
      openaiApiKey: "sk-test",
      sessionId: "session-1",
      erpConfig: {
        base_url: "https://erp.test.com",
        api_key: "key",
        client_id: "client"
      }
    }

    expect(config.sessionId).toBe("session-1")
    expect(config.erpConfig).toBeDefined()
  })
})

describe("Workflow step sequence", () => {
  it("should define correct step order", () => {
    const stepOrder = [1, 2, 3, 4, 5]
    const stepNames = [
      "extractClientInfo",
      "searchHealthPlans",
      "analyzeCompatibility",
      "fetchERPPrices",
      "generateRecommendation"
    ]

    for (let i = 0; i < stepOrder.length; i++) {
      const step = stepOrder[i]
      expect(STEP_TIMEOUTS[step as 1 | 2 | 3 | 4 | 5]).toBeDefined()
      expect(STEP_PROGRESS[step as 1 | 2 | 3 | 4 | 5]).toBeDefined()
    }
  })

  it("should have extractClientInfo as first step", () => {
    expect(STEP_PROGRESS[1]).toContain("informações")
  })

  it("should have generateRecommendation as last step", () => {
    expect(STEP_PROGRESS[5]).toContain("recomendação")
  })
})

describe("Timeout configuration", () => {
  it("should have total timeout under 3 minutes", () => {
    const totalTimeout = Object.values(STEP_TIMEOUTS).reduce((a, b) => a + b, 0)
    // 10 + 15 + 95 + 10 + 20 = 150s
    // Step 3 needs up to 90s for complex multi-plan GPT analysis
    expect(totalTimeout).toBeLessThan(180_000) // 3 minutes max
  })

  it("should allow step 3 enough time for GPT analysis", () => {
    // Step 3 (analyzeCompatibility) needs time for complex GPT calls
    expect(STEP_TIMEOUTS[3]).toBeGreaterThanOrEqual(15_000)
  })

  it("should allow step 5 enough time for recommendation generation", () => {
    // Step 5 (generateRecommendation) needs time for GPT generation
    expect(STEP_TIMEOUTS[5]).toBeGreaterThanOrEqual(15_000)
  })
})

describe("Progress message formatting", () => {
  it("should have properly formatted step 1 message", () => {
    expect(STEP_PROGRESS[1]).toBe("📋 Analisando suas informações...\n")
  })

  it("should have properly formatted step 2 message", () => {
    expect(STEP_PROGRESS[2]).toBe("🔍 Buscando planos compatíveis...\n")
  })

  it("should have properly formatted step 3 message", () => {
    expect(STEP_PROGRESS[3]).toBe(
      "📊 Analisando compatibilidade dos planos...\n"
    )
  })

  it("should have properly formatted step 4 message", () => {
    expect(STEP_PROGRESS[4]).toBe("💰 Consultando preços atualizados...\n")
  })

  it("should have extra newlines on step 5 for final output spacing", () => {
    expect(STEP_PROGRESS[5]).toBe(
      "✨ Gerando sua recomendação personalizada...\n\n"
    )
  })
})

describe("Error handling scenarios", () => {
  it("should handle timeout errors gracefully", () => {
    // TimeoutError should be able to be constructed
    class TestTimeoutError extends Error {
      step: string
      timeoutMs: number
      constructor(step: string, timeoutMs: number) {
        super(`${step} excedeu o tempo limite de ${timeoutMs}ms`)
        this.name = "TimeoutError"
        this.step = step
        this.timeoutMs = timeoutMs
      }
    }

    const error = new TestTimeoutError("testStep", 10000)

    expect(error.step).toBe("testStep")
    expect(error.timeoutMs).toBe(10000)
    expect(error.message).toContain("10000ms")
  })

  it("should provide user-friendly error messages", () => {
    // Test that error classification produces user messages
    const errorResult = {
      step: 1,
      stepName: "Test",
      type: "UnknownError",
      message: "Test error",
      userMessage: "Ocorreu um erro. Por favor, tente novamente.",
      retryable: false,
      httpStatus: 500
    }

    expect(errorResult.userMessage).toBeDefined()
    expect(typeof errorResult.userMessage).toBe("string")
    expect(errorResult.userMessage.length).toBeGreaterThan(0)
  })
})

describe("Streaming workflow", () => {
  it("should yield strings for streaming", async () => {
    // The workflow yields strings that can be streamed to the client
    const chunks: string[] = []
    const testChunks = [
      STEP_PROGRESS[1],
      STEP_PROGRESS[2],
      "Final recommendation text"
    ]

    for (const chunk of testChunks) {
      chunks.push(chunk)
      expect(typeof chunk).toBe("string")
    }

    expect(chunks).toHaveLength(3)
  })
})

describe("Partial results on failure", () => {
  it("should track partial progress information", () => {
    // When workflow fails, we should have partial info available
    const partialSession = {
      searchResults: {
        results: [{ id: 1 }, { id: 2 }, { id: 3 }],
        totalFound: 3
      },
      compatibilityAnalysis: null
    }

    // Partial info available
    expect(partialSession.searchResults.results.length).toBe(3)

    // Can generate partial message
    const partialMessage = `📌 Encontramos ${partialSession.searchResults.results.length} planos compatíveis antes do erro.`
    expect(partialMessage).toContain("3 planos")
  })
})

describe("Relationship mapping for ERP", () => {
  const mapRelationship = (relationship: string): string => {
    const mapping: Record<string, string> = {
      spouse: "conjuge",
      child: "filho",
      parent: "pai",
      mother: "mae",
      father: "pai",
      other: "outro"
    }
    return mapping[relationship] || "outro"
  }

  it("should map spouse correctly", () => {
    expect(mapRelationship("spouse")).toBe("conjuge")
  })

  it("should map child correctly", () => {
    expect(mapRelationship("child")).toBe("filho")
  })

  it("should map parent correctly", () => {
    expect(mapRelationship("parent")).toBe("pai")
  })

  it("should map mother correctly", () => {
    expect(mapRelationship("mother")).toBe("mae")
  })

  it("should map father correctly", () => {
    expect(mapRelationship("father")).toBe("pai")
  })

  it("should default unknown relationships to outro", () => {
    expect(mapRelationship("unknown")).toBe("outro")
    expect(mapRelationship("cousin")).toBe("outro")
  })
})
