/**
 * Logger Tests
 *
 * Tests for structured logging and sensitive data masking
 *
 * Task #10.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  HealthPlanLogger,
  maskSensitiveData,
  createLogger,
  createNoopLogger
} from "../logger"

describe("maskSensitiveData", () => {
  describe("should mask CPF field", () => {
    it("masks CPF in nested object", () => {
      const data = {
        name: "João",
        cpf: "123.456.789-00",
        city: "São Paulo"
      }

      const masked = maskSensitiveData(data)

      expect(masked.name).toBe("João")
      expect(masked.cpf).toBe("***MASKED***")
      expect(masked.city).toBe("São Paulo")
    })

    it("masks CPF pattern in string value", () => {
      const cpf = "123.456.789-00"
      const masked = maskSensitiveData(cpf)
      expect(masked).toBe("***CPF***")
    })
  })

  describe("should mask telefone field", () => {
    it("masks phone numbers", () => {
      const data = {
        name: "Maria",
        telefone: "(11) 99999-8888"
      }

      const masked = maskSensitiveData(data)

      expect(masked.name).toBe("Maria")
      expect(masked.telefone).toBe("***MASKED***")
    })

    it("masks phone field by key name", () => {
      const data = {
        phone: "+55 11 98765-4321"
      }

      const masked = maskSensitiveData(data)
      expect(masked.phone).toBe("***MASKED***")
    })
  })

  describe("should mask email field", () => {
    it("masks email by key name", () => {
      const data = {
        email: "test@example.com",
        name: "Test"
      }

      const masked = maskSensitiveData(data)

      expect(masked.email).toBe("***MASKED***")
      expect(masked.name).toBe("Test")
    })

    it("masks email pattern in string value", () => {
      const email = "user@domain.com"
      const masked = maskSensitiveData(email)
      expect(masked).toBe("***EMAIL***")
    })
  })

  describe("should handle nested objects", () => {
    it("masks fields in deeply nested structures", () => {
      const data = {
        user: {
          profile: {
            cpf: "111.222.333-44",
            contact: {
              email: "deep@test.com",
              phone: "(21) 99999-0000"
            }
          }
        },
        metadata: {
          timestamp: "2024-01-01"
        }
      }

      const masked = maskSensitiveData(data)

      expect(masked.user.profile.cpf).toBe("***MASKED***")
      expect(masked.user.profile.contact.email).toBe("***MASKED***")
      expect(masked.user.profile.contact.phone).toBe("***MASKED***")
      expect(masked.metadata.timestamp).toBe("2024-01-01")
    })
  })

  describe("should not modify original data", () => {
    it("returns a new object without mutating original", () => {
      const original = {
        cpf: "123.456.789-00",
        name: "Test"
      }

      const masked = maskSensitiveData(original)

      expect(original.cpf).toBe("123.456.789-00")
      expect(masked.cpf).toBe("***MASKED***")
    })
  })

  describe("should handle arrays", () => {
    it("masks sensitive data in arrays", () => {
      const data = [
        { name: "User1", email: "user1@test.com" },
        { name: "User2", email: "user2@test.com" }
      ]

      const masked = maskSensitiveData(data)

      expect(masked[0].name).toBe("User1")
      expect(masked[0].email).toBe("***MASKED***")
      expect(masked[1].email).toBe("***MASKED***")
    })
  })

  describe("should handle edge cases", () => {
    it("handles null values", () => {
      expect(maskSensitiveData(null)).toBeNull()
    })

    it("handles undefined values", () => {
      expect(maskSensitiveData(undefined)).toBeUndefined()
    })

    it("handles primitive values", () => {
      expect(maskSensitiveData(123)).toBe(123)
      expect(maskSensitiveData(true)).toBe(true)
      expect(maskSensitiveData("normal string")).toBe("normal string")
    })

    it("prevents infinite recursion on deep objects", () => {
      // Create a deep nested object
      let deep: any = { value: "test" }
      for (let i = 0; i < 15; i++) {
        deep = { nested: deep }
      }

      // Should not throw
      const masked = maskSensitiveData(deep)
      expect(masked).toBeDefined()
    })
  })

  describe("should mask API keys and secrets", () => {
    it("masks api_key field", () => {
      const data = { api_key: "sk-abc123xyz" }
      const masked = maskSensitiveData(data)
      expect(masked.api_key).toBe("***MASKED***")
    })

    it("masks apiKey field", () => {
      const data = { apiKey: "secret-key" }
      const masked = maskSensitiveData(data)
      expect(masked.apiKey).toBe("***MASKED***")
    })

    it("masks password field", () => {
      const data = { password: "super-secret" }
      const masked = maskSensitiveData(data)
      expect(masked.password).toBe("***MASKED***")
    })

    it("masks token field", () => {
      const data = { token: "jwt-token-here" }
      const masked = maskSensitiveData(data)
      expect(masked.token).toBe("***MASKED***")
    })
  })
})

describe("HealthPlanLogger", () => {
  let logger: HealthPlanLogger
  let consoleLogSpy: any
  let consoleWarnSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    logger = new HealthPlanLogger("workspace-123", "user-456")
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("logStepStart", () => {
    it("should output structured JSON log", () => {
      logger.logStepStart(1, { test: "input" })

      expect(consoleLogSpy).toHaveBeenCalled()
      const logCall = consoleLogSpy.mock.calls[0]
      expect(logCall[0]).toContain("[health-plan-agent]")

      const logJson = JSON.parse(logCall[1])
      expect(logJson.level).toBe("INFO")
      expect(logJson.action).toBe("step_start")
    })

    it("should include all required fields", () => {
      logger.setSessionId("session-789")
      logger.logStepStart(2, {})

      const logCall = consoleLogSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.timestamp).toBeDefined()
      expect(logJson.workspaceId).toBe("workspace-123")
      expect(logJson.userId).toBe("user-456")
      expect(logJson.sessionId).toBe("session-789")
      expect(logJson.step).toBe(2)
      expect(logJson.stepName).toBe("searchHealthPlans")
    })

    it("should mask sensitive data in inputs", () => {
      logger.logStepStart(1, {
        clientInfo: {
          name: "João",
          cpf: "123.456.789-00",
          email: "test@test.com"
        }
      })

      const logCall = consoleLogSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.inputs.clientInfo.name).toBe("João")
      expect(logJson.inputs.clientInfo.cpf).toBe("***MASKED***")
      expect(logJson.inputs.clientInfo.email).toBe("***MASKED***")
    })
  })

  describe("logStepEnd", () => {
    it("should log step completion with duration", () => {
      logger.logStepEnd(1, { success: true }, 1500)

      const logCall = consoleLogSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.action).toBe("step_end")
      expect(logJson.durationMs).toBe(1500)
    })

    it("should summarize large outputs", () => {
      const largeOutput = {
        results: new Array(100).fill({ id: "test" }),
        metadata: { count: 100 }
      }

      logger.logStepEnd(2, largeOutput, 2000)

      const logCall = consoleLogSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.outputSummary.resultsCount).toBe(100)
    })
  })

  describe("logStepError", () => {
    it("should log errors with ERROR level", () => {
      const error = new Error("Test error")
      logger.logStepError(3, error, 500)

      expect(consoleErrorSpy).toHaveBeenCalled()
      const logCall = consoleErrorSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.level).toBe("ERROR")
      expect(logJson.action).toBe("step_error")
      expect(logJson.error.message).toBe("Test error")
    })
  })

  describe("logStepRetry", () => {
    it("should log retries with WARN level", () => {
      logger.logStepRetry(2, 1, "Rate limit exceeded")

      expect(consoleWarnSpy).toHaveBeenCalled()
      const logCall = consoleWarnSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.level).toBe("WARN")
      expect(logJson.action).toBe("step_retry")
      expect(logJson.attempt).toBe(1)
      expect(logJson.reason).toBe("Rate limit exceeded")
    })
  })

  describe("logWorkflowStart", () => {
    it("should log workflow start", () => {
      logger.logWorkflowStart()

      const logCall = consoleLogSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.action).toBe("workflow_start")
    })
  })

  describe("logWorkflowEnd", () => {
    it("should log successful workflow end", () => {
      logger.logWorkflowEnd(true, 5000)

      const logCall = consoleLogSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.action).toBe("workflow_end")
      expect(logJson.success).toBe(true)
      expect(logJson.durationMs).toBe(5000)
    })

    it("should log failed workflow end with error", () => {
      const error = new Error("Workflow failed")
      logger.logWorkflowEnd(false, 3000, error)

      const logCall = consoleErrorSpy.mock.calls[0]
      const logJson = JSON.parse(logCall[1])

      expect(logJson.action).toBe("workflow_end")
      expect(logJson.success).toBe(false)
      expect(logJson.error.message).toBe("Workflow failed")
    })
  })
})

describe("createLogger", () => {
  it("should create a logger instance", () => {
    const logger = createLogger("workspace-1", "user-1", "session-1")
    expect(logger).toBeInstanceOf(HealthPlanLogger)
  })
})

describe("createNoopLogger", () => {
  it("should create a logger for testing", () => {
    const logger = createNoopLogger()
    expect(logger).toBeInstanceOf(HealthPlanLogger)
  })
})
