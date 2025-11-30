/**
 * Correlation ID Management Tests
 *
 * Tests for correlation ID generation and context propagation.
 *
 * Referência: Task #14.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  generateCorrelationId,
  generateDomainCorrelationId,
  isValidCorrelationId,
  createTracingContext,
  createChildContext,
  getCorrelationHeaders,
  extractCorrelationFromHeaders,
  getLogPrefix,
  getLogMetadata,
  getLangSmithMetadata,
  getLangSmithTags,
  storeContext,
  getStoredContext,
  clearStoredContext,
  getContextStoreSize,
  mergeCorrelationMetadata,
  createCorrelatedError,
  type TracingContext
} from "../correlation"

describe("Correlation ID Generation", () => {
  describe("generateCorrelationId", () => {
    it("should generate ID with hp prefix", () => {
      const id = generateCorrelationId()
      expect(id).toMatch(/^hp-\d+-[a-f0-9]{8}$/)
    })

    it("should generate unique IDs", () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId())
      }
      expect(ids.size).toBe(100)
    })

    it("should include timestamp", () => {
      const before = Date.now()
      const id = generateCorrelationId()
      const after = Date.now()

      const timestamp = parseInt(id.split("-")[1])
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe("generateDomainCorrelationId", () => {
    it("should generate ID with custom prefix", () => {
      const id = generateDomainCorrelationId("erp")
      expect(id).toMatch(/^erp-\d+-[a-f0-9]{8}$/)
    })

    it("should work with different prefixes", () => {
      expect(generateDomainCorrelationId("llm")).toMatch(/^llm-/)
      expect(generateDomainCorrelationId("db")).toMatch(/^db-/)
      expect(generateDomainCorrelationId("api")).toMatch(/^api-/)
    })
  })

  describe("isValidCorrelationId", () => {
    it("should validate correct format", () => {
      expect(isValidCorrelationId("hp-1732923840000-a1b2c3d4")).toBe(true)
      expect(isValidCorrelationId("erp-1732923840000-deadbeef")).toBe(true)
      expect(isValidCorrelationId("llm-1732923840000-12345678")).toBe(true)
    })

    it("should reject invalid formats", () => {
      expect(isValidCorrelationId("invalid")).toBe(false)
      expect(isValidCorrelationId("hp-notanumber-a1b2c3d4")).toBe(false)
      expect(isValidCorrelationId("hp-123-short")).toBe(false)
      expect(isValidCorrelationId("HP-1732923840000-a1b2c3d4")).toBe(false) // uppercase
      expect(isValidCorrelationId("")).toBe(false)
    })

    it("should validate generated IDs", () => {
      const id = generateCorrelationId()
      expect(isValidCorrelationId(id)).toBe(true)
    })
  })
})

describe("Context Creation", () => {
  describe("createTracingContext", () => {
    it("should create context with required fields", () => {
      const context = createTracingContext("workspace-1", "session-1")

      expect(context.workspaceId).toBe("workspace-1")
      expect(context.sessionId).toBe("session-1")
      expect(context.correlationId).toMatch(/^hp-\d+-[a-f0-9]{8}$/)
      expect(context.createdAt).toBeTruthy()
    })

    it("should include optional userId", () => {
      const context = createTracingContext("workspace-1", "session-1", "user-1")
      expect(context.userId).toBe("user-1")
    })

    it("should reuse existing correlation ID if provided", () => {
      const existingId = "hp-1234567890-abcd1234"
      const context = createTracingContext(
        "workspace-1",
        "session-1",
        undefined,
        existingId
      )
      expect(context.correlationId).toBe(existingId)
    })

    it("should set createdAt timestamp", () => {
      const before = new Date().toISOString()
      const context = createTracingContext("ws", "sess")
      const after = new Date().toISOString()

      expect(context.createdAt >= before).toBe(true)
      expect(context.createdAt <= after).toBe(true)
    })
  })

  describe("createChildContext", () => {
    it("should preserve correlation ID from parent", () => {
      const parent = createTracingContext("ws", "sess", "user")
      const child = createChildContext(parent, { currentStep: 1 })

      expect(child.correlationId).toBe(parent.correlationId)
    })

    it("should apply updates", () => {
      const parent = createTracingContext("ws", "sess")
      const child = createChildContext(parent, {
        currentStep: 2,
        parentRunId: "run-123"
      })

      expect(child.currentStep).toBe(2)
      expect(child.parentRunId).toBe("run-123")
    })

    it("should merge metadata with parent correlation reference", () => {
      const parent = createTracingContext("ws", "sess")
      parent.metadata = { original: true }

      const child = createChildContext(parent, {
        metadata: { child: true }
      })

      expect(child.metadata?.original).toBe(true)
      expect(child.metadata?.child).toBe(true)
      expect(child.metadata?.parentCorrelationId).toBe(parent.correlationId)
    })

    it("should not allow overwriting correlation ID", () => {
      const parent = createTracingContext("ws", "sess")
      const child = createChildContext(parent, {
        correlationId: "different-id"
      } as any)

      expect(child.correlationId).toBe(parent.correlationId)
    })
  })
})

describe("Header Generation", () => {
  const baseContext: TracingContext = {
    correlationId: "hp-1234567890-abcd1234",
    sessionId: "session-123",
    workspaceId: "workspace-456",
    createdAt: new Date().toISOString()
  }

  describe("getCorrelationHeaders", () => {
    it("should always include correlation ID", () => {
      const headers = getCorrelationHeaders(baseContext)
      expect(headers["X-Correlation-Id"]).toBe("hp-1234567890-abcd1234")
    })

    it("should include optional fields when present", () => {
      const context: TracingContext = {
        ...baseContext,
        userId: "user-789",
        parentRunId: "run-abc"
      }

      const headers = getCorrelationHeaders(context)

      expect(headers["X-Session-Id"]).toBe("session-123")
      expect(headers["X-Workspace-Id"]).toBe("workspace-456")
      expect(headers["X-User-Id"]).toBe("user-789")
      expect(headers["X-Parent-Run-Id"]).toBe("run-abc")
    })

    it("should omit undefined fields", () => {
      const headers = getCorrelationHeaders(baseContext)
      expect(headers["X-User-Id"]).toBeUndefined()
      expect(headers["X-Parent-Run-Id"]).toBeUndefined()
    })
  })

  describe("extractCorrelationFromHeaders", () => {
    it("should extract lowercase headers", () => {
      const headers = {
        "x-correlation-id": "hp-123-abc",
        "x-session-id": "sess-1",
        "x-workspace-id": "ws-1"
      }

      const context = extractCorrelationFromHeaders(headers)

      expect(context.correlationId).toBe("hp-123-abc")
      expect(context.sessionId).toBe("sess-1")
      expect(context.workspaceId).toBe("ws-1")
    })

    it("should extract mixed case headers", () => {
      const headers = {
        "X-Correlation-Id": "hp-456-def",
        "X-User-Id": "user-1",
        "X-Parent-Run-Id": "run-1"
      }

      const context = extractCorrelationFromHeaders(headers)

      expect(context.correlationId).toBe("hp-456-def")
      expect(context.userId).toBe("user-1")
      expect(context.parentRunId).toBe("run-1")
    })

    it("should handle uppercase headers", () => {
      const headers = {
        "X-CORRELATION-ID": "hp-789-ghi"
      }

      const context = extractCorrelationFromHeaders(headers)
      expect(context.correlationId).toBe("hp-789-ghi")
    })

    it("should return empty object for missing headers", () => {
      const context = extractCorrelationFromHeaders({})
      expect(Object.keys(context)).toHaveLength(0)
    })
  })
})

describe("Logging Helpers", () => {
  const context: TracingContext = {
    correlationId: "hp-1234567890-abcd1234",
    sessionId: "session-123",
    workspaceId: "workspace-456",
    userId: "user-789",
    parentRunId: "run-abc",
    currentStep: 2,
    createdAt: new Date().toISOString()
  }

  describe("getLogPrefix", () => {
    it("should return formatted prefix with correlation ID", () => {
      const prefix = getLogPrefix(context)
      expect(prefix).toBe("[hp-1234567890-abcd1234]")
    })
  })

  describe("getLogMetadata", () => {
    it("should return all context fields for structured logging", () => {
      const metadata = getLogMetadata(context)

      expect(metadata.correlationId).toBe("hp-1234567890-abcd1234")
      expect(metadata.sessionId).toBe("session-123")
      expect(metadata.workspaceId).toBe("workspace-456")
      expect(metadata.userId).toBe("user-789")
      expect(metadata.parentRunId).toBe("run-abc")
      expect(metadata.currentStep).toBe(2)
    })
  })
})

describe("LangSmith Integration", () => {
  const context: TracingContext = {
    correlationId: "hp-1234567890-abcd1234",
    sessionId: "session-123",
    workspaceId: "workspace-456",
    userId: "user-789",
    createdAt: "2024-01-01T00:00:00.000Z",
    currentStep: 3,
    metadata: { custom: "value" }
  }

  describe("getLangSmithMetadata", () => {
    it("should include all required fields", () => {
      const metadata = getLangSmithMetadata(context)

      expect(metadata.correlationId).toBe("hp-1234567890-abcd1234")
      expect(metadata.sessionId).toBe("session-123")
      expect(metadata.workspaceId).toBe("workspace-456")
      expect(metadata.userId).toBe("user-789")
      expect(metadata.createdAt).toBe("2024-01-01T00:00:00.000Z")
    })

    it("should merge custom metadata", () => {
      const metadata = getLangSmithMetadata(context)
      expect(metadata.custom).toBe("value")
    })
  })

  describe("getLangSmithTags", () => {
    it("should always include health-plan tag", () => {
      const tags = getLangSmithTags(context)
      expect(tags).toContain("health-plan")
    })

    it("should include workspace tag", () => {
      const tags = getLangSmithTags(context)
      expect(tags).toContain("workspace:workspace-456")
    })

    it("should include step tag when present", () => {
      const tags = getLangSmithTags(context)
      expect(tags).toContain("step:3")
    })

    it("should not include step tag when not present", () => {
      const contextNoStep: TracingContext = {
        correlationId: "hp-123-abc",
        sessionId: "s",
        workspaceId: "w",
        createdAt: new Date().toISOString()
      }
      const tags = getLangSmithTags(contextNoStep)
      expect(tags.some(t => t.startsWith("step:"))).toBe(false)
    })
  })
})

describe("Context Storage", () => {
  beforeEach(() => {
    // Clear store before each test
    const context = createTracingContext("ws", "sess")
    clearStoredContext(context.correlationId)
  })

  afterEach(() => {
    // Clean up after tests
    const size = getContextStoreSize()
    // Note: We can't easily clear all, but tests should clean up after themselves
  })

  describe("storeContext and getStoredContext", () => {
    it("should store and retrieve context", () => {
      const context = createTracingContext("ws", "sess", "user")
      storeContext(context)

      const retrieved = getStoredContext(context.correlationId)
      expect(retrieved).toEqual(context)
    })

    it("should return undefined for non-existent context", () => {
      const retrieved = getStoredContext("non-existent-id")
      expect(retrieved).toBeUndefined()
    })

    it("should overwrite existing context with same ID", () => {
      const context1 = createTracingContext("ws1", "sess1")
      const context2: TracingContext = {
        ...context1,
        workspaceId: "ws2",
        sessionId: "sess2"
      }

      storeContext(context1)
      storeContext(context2)

      const retrieved = getStoredContext(context1.correlationId)
      expect(retrieved?.workspaceId).toBe("ws2")
    })
  })

  describe("clearStoredContext", () => {
    it("should remove context from store", () => {
      const context = createTracingContext("ws", "sess")
      storeContext(context)

      clearStoredContext(context.correlationId)

      expect(getStoredContext(context.correlationId)).toBeUndefined()
    })

    it("should not throw for non-existent context", () => {
      expect(() => clearStoredContext("non-existent")).not.toThrow()
    })
  })

  describe("getContextStoreSize", () => {
    it("should return current store size", () => {
      const initialSize = getContextStoreSize()

      const context = createTracingContext("ws", "sess")
      storeContext(context)

      expect(getContextStoreSize()).toBe(initialSize + 1)

      clearStoredContext(context.correlationId)
      expect(getContextStoreSize()).toBe(initialSize)
    })
  })
})

describe("Utility Functions", () => {
  describe("mergeCorrelationMetadata", () => {
    it("should merge context into existing metadata", () => {
      const metadata = { existing: "value", count: 5 }
      const context = createTracingContext("ws", "sess")

      const merged = mergeCorrelationMetadata(metadata, context)

      expect(merged.existing).toBe("value")
      expect(merged.count).toBe(5)
      expect(merged.correlationId).toBe(context.correlationId)
      expect(merged.sessionId).toBe("sess")
      expect(merged.workspaceId).toBe("ws")
    })

    it("should handle undefined metadata", () => {
      const context = createTracingContext("ws", "sess")
      const merged = mergeCorrelationMetadata(undefined, context)

      expect(merged.correlationId).toBe(context.correlationId)
      expect(merged.sessionId).toBe("sess")
      expect(merged.workspaceId).toBe("ws")
    })

    it("should override metadata with context values", () => {
      const metadata = { correlationId: "old-id", sessionId: "old-session" }
      const context = createTracingContext("ws", "sess")

      const merged = mergeCorrelationMetadata(metadata, context)

      expect(merged.correlationId).toBe(context.correlationId)
      expect(merged.sessionId).toBe("sess")
    })
  })

  describe("createCorrelatedError", () => {
    it("should create error with correlation metadata", () => {
      const context = createTracingContext("ws", "sess")
      const error = createCorrelatedError("Test error message", context)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("Test error message")
      expect((error as any).correlationId).toBe(context.correlationId)
      expect((error as any).sessionId).toBe("sess")
      expect((error as any).workspaceId).toBe("ws")
    })

    it("should preserve error prototype chain", () => {
      const context = createTracingContext("ws", "sess")
      const error = createCorrelatedError("Test", context)

      expect(error.stack).toBeTruthy()
      expect(error.name).toBe("Error")
    })
  })
})
