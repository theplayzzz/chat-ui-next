/**
 * Health Plan Agent API Route
 *
 * Orquestra os 5 passos do processo de recomendação de planos de saúde:
 * 1. extractClientInfo - Coleta de informações do cliente
 * 2. searchHealthPlans - Busca RAG em múltiplas collections
 * 3. analyzeCompatibility - Análise de compatibilidade com scoring
 * 4. fetchERPPrices - Consulta de preços no ERP
 * 5. generateRecommendation - Geração de recomendação humanizada
 *
 * Referência: PRD RF-008 (Orquestrador Multi-Step)
 * Task Master: Task #10
 */

import { NextRequest } from "next/server"
import { StreamingTextResponse } from "ai"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import {
  validateWorkspaceAuthMiddleware,
  logAuthAttempt
} from "@/lib/middleware/workspace-auth"
import { getERPConfigByWorkspaceId } from "@/db/workspace-erp-config"
import { HealthPlanOrchestrator } from "@/lib/tools/health-plan/orchestrator"
import type { WorkspaceERPConfig } from "@/lib/tools/health-plan/types"

// Use Node.js runtime for 60s timeout (edge has 30s limit)
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Request body interface
 */
interface HealthPlanAgentRequest {
  workspaceId: string
  assistantId: string
  sessionId?: string // Optional - for resuming sessions
  resetToStep?: number // Optional - for resetting to a specific step
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
}

/**
 * POST /api/chat/health-plan-agent
 *
 * Main endpoint for health plan recommendation workflow
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 1. Parse request body first (need to clone for middleware)
    const clonedRequest = request.clone()
    let body: HealthPlanAgentRequest

    try {
      body = await clonedRequest.json()
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          code: "INVALID_JSON"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    // 2. Validate required fields
    const { workspaceId, assistantId, messages, sessionId, resetToStep } = body

    if (!workspaceId) {
      return new Response(
        JSON.stringify({
          error: "workspaceId is required",
          code: "MISSING_WORKSPACE_ID"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    if (!assistantId) {
      return new Response(
        JSON.stringify({
          error: "assistantId is required",
          code: "MISSING_ASSISTANT_ID"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({
          error: "messages array is required and cannot be empty",
          code: "MISSING_MESSAGES"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    // 3. Validate workspace authorization
    // Create a new request with the same body for the middleware
    const authRequest = new NextRequest(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body)
    })

    const authResult = await validateWorkspaceAuthMiddleware(authRequest)

    // Log authorization attempt
    logAuthAttempt(authResult, {
      endpoint: "/api/chat/health-plan-agent",
      action: "health-plan-recommendation"
    })

    if (!authResult.isAuthorized) {
      return (
        authResult.response ||
        new Response(
          JSON.stringify({
            error: "Unauthorized access to workspace",
            code: "UNAUTHORIZED"
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    }

    // 4. Get server profile for API keys
    const profile = await getServerProfile()

    if (!profile.openai_api_key) {
      return new Response(
        JSON.stringify({
          error:
            "OpenAI API key not configured. Please set it in your profile.",
          code: "MISSING_OPENAI_KEY"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    // 5. Get ERP configuration for workspace (optional)
    let erpConfig: WorkspaceERPConfig | null = null
    try {
      erpConfig = await getERPConfigByWorkspaceId(workspaceId)
    } catch (error) {
      console.warn(
        `[health-plan-agent] Failed to fetch ERP config for workspace ${workspaceId}:`,
        error
      )
      // Continue without ERP - prices will be unavailable
    }

    // 6. Initialize orchestrator
    const orchestrator = new HealthPlanOrchestrator({
      sessionId: sessionId || undefined,
      workspaceId,
      userId: authResult.userId!,
      assistantId,
      openaiApiKey: profile.openai_api_key,
      erpConfig: erpConfig || undefined,
      // Allow explicit reset to a previous step (1-5)
      resetToStep:
        resetToStep && resetToStep >= 1 && resetToStep <= 5
          ? (resetToStep as 1 | 2 | 3 | 4 | 5)
          : undefined
    })

    // 7. Execute workflow with streaming
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          for await (const chunk of orchestrator.executeWorkflow(messages)) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred"
          console.error("[health-plan-agent] Workflow error:", error)

          // Send error message to client
          controller.enqueue(
            encoder.encode(
              `\n\n❌ **Erro**: ${errorMessage}\n\nPor favor, tente novamente ou entre em contato com o suporte.`
            )
          )
          controller.close()
        }
      }
    })

    const executionTime = Date.now() - startTime
    console.log(
      `[health-plan-agent] Request completed in ${executionTime}ms for workspace ${workspaceId}`
    )

    return new StreamingTextResponse(stream, {
      headers: {
        "X-Session-Id": orchestrator.getSessionId(),
        "X-Execution-Time": executionTime.toString()
      }
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred"
    const executionTime = Date.now() - startTime

    console.error(
      `[health-plan-agent] Critical error after ${executionTime}ms:`,
      error
    )

    return new Response(
      JSON.stringify({
        error: errorMessage,
        code: "INTERNAL_ERROR",
        executionTime
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    )
  }
}
