/**
 * Health Plan Agent Route Tests
 *
 * Integration tests for the health-plan-agent API route
 * Testing request validation, authorization, and workflow execution.
 *
 * Task #10 - Testes de Integração
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

// Mock ai package first
vi.mock("ai", () => ({
  StreamingTextResponse: class MockStreamingTextResponse extends Response {
    constructor(stream: ReadableStream, options?: ResponseInit) {
      super(stream, {
        ...options,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...(options?.headers || {})
        }
      })
    }
  }
}))

// Mock dependencies before importing route
vi.mock("@/lib/middleware/workspace-auth", () => ({
  validateWorkspaceAuthMiddleware: vi.fn(),
  logAuthAttempt: vi.fn()
}))

vi.mock("@/lib/server/server-chat-helpers", () => ({
  getServerProfile: vi.fn()
}))

vi.mock("@/db/workspace-erp-config", () => ({
  getERPConfigByWorkspaceId: vi.fn()
}))

vi.mock("@/lib/tools/health-plan/orchestrator", () => ({
  HealthPlanOrchestrator: vi.fn().mockImplementation(() => ({
    executeWorkflow: async function* () {
      yield "Test response chunk 1\n"
      yield "Test response chunk 2\n"
    },
    getSessionId: () => "mock-session-123"
  }))
}))

// Import after mocks
import { POST } from "../route"
import { validateWorkspaceAuthMiddleware } from "@/lib/middleware/workspace-auth"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { getERPConfigByWorkspaceId } from "@/db/workspace-erp-config"
import { HealthPlanOrchestrator } from "@/lib/tools/health-plan/orchestrator"

// Helper to create NextRequest
function createRequest(body: unknown, options: RequestInit = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/chat/health-plan-agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  })
}

// Helper to read streaming response
async function readStreamResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ""

  const decoder = new TextDecoder()
  let result = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value)
  }

  return result
}

describe("POST /api/chat/health-plan-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    vi.mocked(validateWorkspaceAuthMiddleware).mockResolvedValue({
      isAuthorized: true,
      userId: "user-123",
      workspaceId: "workspace-123",
      response: null
    })

    vi.mocked(getServerProfile).mockResolvedValue({
      openai_api_key: "sk-test-key",
      openai_organization_id: "org-123"
    } as any)

    vi.mocked(getERPConfigByWorkspaceId).mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // Request Validation Tests
  // ==========================================================================

  describe("Request Validation", () => {
    it("returns 400 for invalid JSON", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/chat/health-plan-agent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{ invalid json }"
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe("INVALID_JSON")
    })

    it("returns 400 when workspaceId is missing", async () => {
      const request = createRequest({
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }]
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe("MISSING_WORKSPACE_ID")
    })

    it("returns 400 when assistantId is missing", async () => {
      const request = createRequest({
        workspaceId: "ws-123",
        messages: [{ role: "user", content: "Hello" }]
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe("MISSING_ASSISTANT_ID")
    })

    it("returns 400 when messages is missing", async () => {
      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe("MISSING_MESSAGES")
    })

    it("returns 400 when messages is empty array", async () => {
      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: []
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe("MISSING_MESSAGES")
    })
  })

  // ==========================================================================
  // Authorization Tests
  // ==========================================================================

  describe("Authorization", () => {
    it("returns 403 for unauthorized workspace access", async () => {
      vi.mocked(validateWorkspaceAuthMiddleware).mockResolvedValue({
        isAuthorized: false,
        userId: null,
        workspaceId: null,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403
        })
      })

      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }]
      })

      const response = await POST(request)

      expect(response.status).toBe(403)
    })

    it("returns 500 when OpenAI key is not configured", async () => {
      vi.mocked(getServerProfile).mockResolvedValue({
        openai_api_key: null
      } as any)

      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }]
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.code).toBe("MISSING_OPENAI_KEY")
    })
  })

  // ==========================================================================
  // Workflow Execution Tests
  // ==========================================================================

  describe("Workflow Execution", () => {
    it("passes sessionId to orchestrator when provided", async () => {
      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        sessionId: "existing-session-456",
        messages: [{ role: "user", content: "Hello" }]
      })

      await POST(request)

      expect(HealthPlanOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "existing-session-456"
        })
      )
    })

    it("initializes orchestrator with correct config", async () => {
      vi.mocked(getERPConfigByWorkspaceId).mockResolvedValue({
        base_url: "https://erp.test.com",
        api_key: "erp-key",
        client_id: "client-123"
      } as any)

      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }]
      })

      await POST(request)

      expect(HealthPlanOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-123",
          userId: "user-123",
          assistantId: "asst-123",
          openaiApiKey: "sk-test-key",
          erpConfig: expect.objectContaining({
            base_url: "https://erp.test.com"
          })
        })
      )
    })

    it("initializes orchestrator without erpConfig when not available", async () => {
      vi.mocked(getERPConfigByWorkspaceId).mockResolvedValue(null)

      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }]
      })

      await POST(request)

      expect(HealthPlanOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-123",
          erpConfig: undefined
        })
      )
    })

    it("passes resetToStep to orchestrator when provided", async () => {
      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }],
        resetToStep: 2
      })

      await POST(request)

      expect(HealthPlanOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          resetToStep: 2
        })
      )
    })

    it("ignores invalid resetToStep values", async () => {
      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }],
        resetToStep: 10 // Invalid - must be 1-5
      })

      await POST(request)

      expect(HealthPlanOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          resetToStep: undefined
        })
      )
    })
  })

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe("Integration", () => {
    it("calls auth middleware with correct request", async () => {
      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }]
      })

      await POST(request)

      expect(validateWorkspaceAuthMiddleware).toHaveBeenCalledTimes(1)
    })

    it("logs auth attempt after validation", async () => {
      const { logAuthAttempt } = await import("@/lib/middleware/workspace-auth")

      const request = createRequest({
        workspaceId: "ws-123",
        assistantId: "asst-123",
        messages: [{ role: "user", content: "Hello" }]
      })

      await POST(request)

      expect(logAuthAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthorized: true }),
        expect.objectContaining({
          endpoint: "/api/chat/health-plan-agent",
          action: "health-plan-recommendation"
        })
      )
    })
  })
})
