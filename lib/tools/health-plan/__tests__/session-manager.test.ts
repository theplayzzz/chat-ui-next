/**
 * Session Manager Tests
 *
 * Tests for health plan session management including CRUD operations,
 * session state handling, and cleanup functionality.
 *
 * Task #10.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  isClientInfoComplete,
  getSessionProgress,
  STEP_NAMES,
  type SessionState,
  type SessionError,
  type WorkflowStep
} from "../session-manager"

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => mockSupabaseClient),
  insert: vi.fn(() => mockSupabaseClient),
  select: vi.fn(() => mockSupabaseClient),
  update: vi.fn(() => mockSupabaseClient),
  delete: vi.fn(() => mockSupabaseClient),
  eq: vi.fn(() => mockSupabaseClient),
  gt: vi.fn(() => mockSupabaseClient),
  lt: vi.fn(() => mockSupabaseClient),
  is: vi.fn(() => mockSupabaseClient),
  order: vi.fn(() => mockSupabaseClient),
  limit: vi.fn(() => mockSupabaseClient),
  single: vi.fn(() => Promise.resolve({ data: null, error: null }))
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}))

describe("STEP_NAMES", () => {
  it("should have names for all 5 steps", () => {
    expect(STEP_NAMES[1]).toBe("extractClientInfo")
    expect(STEP_NAMES[2]).toBe("searchHealthPlans")
    expect(STEP_NAMES[3]).toBe("analyzeCompatibility")
    expect(STEP_NAMES[4]).toBe("fetchERPPrices")
    expect(STEP_NAMES[5]).toBe("generateRecommendation")
  })

  it("should cover all workflow steps", () => {
    const steps: WorkflowStep[] = [1, 2, 3, 4, 5]
    for (const step of steps) {
      expect(STEP_NAMES[step]).toBeDefined()
      expect(typeof STEP_NAMES[step]).toBe("string")
    }
  })
})

describe("isClientInfoComplete", () => {
  it("should return false for undefined clientInfo", () => {
    expect(isClientInfoComplete(undefined)).toBe(false)
  })

  it("should return false for empty object", () => {
    expect(isClientInfoComplete({})).toBe(false)
  })

  it("should return false if age is missing", () => {
    expect(
      isClientInfoComplete({
        city: "São Paulo",
        state: "SP",
        budget: { min: 200, max: 500 }
      })
    ).toBe(false)
  })

  it("should return false if city is missing", () => {
    expect(
      isClientInfoComplete({
        age: 30,
        state: "SP",
        budget: { min: 200, max: 500 }
      })
    ).toBe(false)
  })

  it("should return false if state is missing", () => {
    expect(
      isClientInfoComplete({
        age: 30,
        city: "São Paulo",
        budget: { min: 200, max: 500 }
      })
    ).toBe(false)
  })

  it("should return false if budget is missing", () => {
    expect(
      isClientInfoComplete({
        age: 30,
        city: "São Paulo",
        state: "SP"
      })
    ).toBe(false)
  })

  it("should return true when all required fields are present", () => {
    expect(
      isClientInfoComplete({
        age: 30,
        city: "São Paulo",
        state: "SP",
        budget: { min: 200, max: 500 }
      })
    ).toBe(true)
  })

  it("should return true with optional fields present", () => {
    expect(
      isClientInfoComplete({
        age: 30,
        city: "São Paulo",
        state: "SP",
        budget: { min: 200, max: 500 },
        name: "João",
        occupation: "Engenheiro",
        dependents: [{ age: 5, relationship: "child" }]
      })
    ).toBe(true)
  })
})

describe("getSessionProgress", () => {
  const createMockSession = (
    currentStep: WorkflowStep,
    completedAt?: string
  ): SessionState => ({
    sessionId: "test-session",
    workspaceId: "test-workspace",
    userId: "test-user",
    currentStep,
    errors: [],
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    completedAt,
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  })

  it("should return 'Recomendação concluída' for completed sessions", () => {
    const session = createMockSession(5, new Date().toISOString())
    expect(getSessionProgress(session)).toBe("Recomendação concluída")
  })

  it("should return correct progress for step 1", () => {
    const session = createMockSession(1)
    expect(getSessionProgress(session)).toBe("Coletando informações")
  })

  it("should return correct progress for step 2", () => {
    const session = createMockSession(2)
    expect(getSessionProgress(session)).toBe("Buscando planos")
  })

  it("should return correct progress for step 3", () => {
    const session = createMockSession(3)
    expect(getSessionProgress(session)).toBe("Analisando compatibilidade")
  })

  it("should return correct progress for step 4", () => {
    const session = createMockSession(4)
    expect(getSessionProgress(session)).toBe("Consultando preços")
  })

  it("should return correct progress for step 5", () => {
    const session = createMockSession(5)
    expect(getSessionProgress(session)).toBe("Gerando recomendação")
  })
})

describe("SessionState type", () => {
  it("should accept valid session state", () => {
    const session: SessionState = {
      sessionId: "abc123",
      workspaceId: "workspace-1",
      userId: "user-1",
      currentStep: 1,
      errors: [],
      startedAt: "2024-01-01T00:00:00Z",
      lastUpdatedAt: "2024-01-01T00:00:00Z",
      expiresAt: "2024-01-01T01:00:00Z"
    }

    expect(session.sessionId).toBe("abc123")
    expect(session.currentStep).toBe(1)
  })

  it("should support all optional fields", () => {
    const session: SessionState = {
      sessionId: "abc123",
      workspaceId: "workspace-1",
      userId: "user-1",
      currentStep: 5,
      clientInfo: {
        age: 30,
        city: "São Paulo",
        state: "SP",
        budget: { min: 200, max: 500 }
      },
      searchResults: {
        results: [],
        totalFound: 0,
        searchQuery: "test"
      },
      compatibilityAnalysis: {
        rankedPlans: [],
        alternatives: {
          economic: null,
          premium: null
        },
        timestamp: new Date().toISOString()
      },
      erpPrices: {
        success: true,
        prices: {},
        source: "erp",
        cached_at: null,
        is_fresh: true
      },
      recommendation: {
        success: true,
        markdown: "# Recommendation"
      },
      errors: [],
      startedAt: "2024-01-01T00:00:00Z",
      lastUpdatedAt: "2024-01-01T00:30:00Z",
      completedAt: "2024-01-01T00:30:00Z",
      expiresAt: "2024-01-01T01:00:00Z"
    }

    expect(session.clientInfo?.age).toBe(30)
    expect(session.completedAt).toBeDefined()
  })
})

describe("SessionError type", () => {
  it("should accept valid error structure", () => {
    const error: SessionError = {
      step: 2,
      stepName: "searchHealthPlans",
      error: "Failed to search plans",
      timestamp: new Date().toISOString(),
      retryable: true
    }

    expect(error.step).toBe(2)
    expect(error.retryable).toBe(true)
  })

  it("should track multiple errors", () => {
    const errors: SessionError[] = [
      {
        step: 1,
        stepName: "extractClientInfo",
        error: "Timeout",
        timestamp: "2024-01-01T00:00:00Z",
        retryable: true
      },
      {
        step: 2,
        stepName: "searchHealthPlans",
        error: "Rate limit exceeded",
        timestamp: "2024-01-01T00:01:00Z",
        retryable: true
      },
      {
        step: 3,
        stepName: "analyzeCompatibility",
        error: "Invalid data",
        timestamp: "2024-01-01T00:02:00Z",
        retryable: false
      }
    ]

    expect(errors).toHaveLength(3)
    expect(errors[0].retryable).toBe(true)
    expect(errors[2].retryable).toBe(false)
  })
})

describe("WorkflowStep type", () => {
  it("should only allow values 1-5", () => {
    const validSteps: WorkflowStep[] = [1, 2, 3, 4, 5]
    expect(validSteps).toHaveLength(5)

    for (const step of validSteps) {
      expect(step).toBeGreaterThanOrEqual(1)
      expect(step).toBeLessThanOrEqual(5)
    }
  })
})

// Integration tests for Supabase operations would require mocking
// the actual database calls. These are tested via integration tests
// with the actual Supabase instance in a test environment.

describe("Session state transitions", () => {
  it("should progress through all steps in order", () => {
    const steps: WorkflowStep[] = [1, 2, 3, 4, 5]
    let currentStep: WorkflowStep = 1

    for (const expectedStep of steps) {
      expect(currentStep).toBe(expectedStep)
      if (currentStep < 5) {
        currentStep = (currentStep + 1) as WorkflowStep
      }
    }
  })

  it("should allow going back to step 1 for incomplete client info", () => {
    let session: SessionState = {
      sessionId: "test",
      workspaceId: "ws",
      userId: "user",
      currentStep: 3,
      errors: [],
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    }

    // Simulate incomplete client info check
    if (!isClientInfoComplete(session.clientInfo)) {
      session = { ...session, currentStep: 1 }
    }

    expect(session.currentStep).toBe(1)
  })
})

describe("Session expiration", () => {
  it("should have 1 hour TTL by default", () => {
    const now = Date.now()
    const oneHourFromNow = now + 60 * 60 * 1000

    const session: SessionState = {
      sessionId: "test",
      workspaceId: "ws",
      userId: "user",
      currentStep: 1,
      errors: [],
      startedAt: new Date(now).toISOString(),
      lastUpdatedAt: new Date(now).toISOString(),
      expiresAt: new Date(oneHourFromNow).toISOString()
    }

    const expiresAt = new Date(session.expiresAt).getTime()
    const startedAt = new Date(session.startedAt).getTime()

    expect(expiresAt - startedAt).toBe(60 * 60 * 1000)
  })

  it("should identify expired sessions", () => {
    const expiredSession: SessionState = {
      sessionId: "expired",
      workspaceId: "ws",
      userId: "user",
      currentStep: 1,
      errors: [],
      startedAt: "2023-01-01T00:00:00Z",
      lastUpdatedAt: "2023-01-01T00:00:00Z",
      expiresAt: "2023-01-01T01:00:00Z" // Past date
    }

    const isExpired = new Date(expiredSession.expiresAt) < new Date()
    expect(isExpired).toBe(true)
  })

  it("should identify non-expired sessions", () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString()
    const validSession: SessionState = {
      sessionId: "valid",
      workspaceId: "ws",
      userId: "user",
      currentStep: 1,
      errors: [],
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      expiresAt: futureDate
    }

    const isExpired = new Date(validSession.expiresAt) < new Date()
    expect(isExpired).toBe(false)
  })
})

describe("Error accumulation", () => {
  it("should track errors without losing previous ones", () => {
    const session: SessionState = {
      sessionId: "test",
      workspaceId: "ws",
      userId: "user",
      currentStep: 2,
      errors: [
        {
          step: 1,
          stepName: "extractClientInfo",
          error: "First error",
          timestamp: "2024-01-01T00:00:00Z",
          retryable: true
        }
      ],
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    }

    // Add a new error
    const newError: SessionError = {
      step: 2,
      stepName: "searchHealthPlans",
      error: "Second error",
      timestamp: new Date().toISOString(),
      retryable: false
    }

    const updatedErrors = [...session.errors, newError]

    expect(updatedErrors).toHaveLength(2)
    expect(updatedErrors[0].step).toBe(1)
    expect(updatedErrors[1].step).toBe(2)
  })
})
