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

  console.log("[route] ========================================")
  console.log("[route] 🚀 Health Plan Agent API called")
  console.log("[route] ========================================")

  try {
    // 1. Get server profile (validates user authentication)
    console.log("[route] Step 1: Authenticating user...")
    let profile
    try {
      profile = await getServerProfile()
      console.log("[route] ✅ User authenticated:", profile.user_id)
    } catch (error) {
      console.error("[route] ❌ Auth error:", error)
      return new Response(
        JSON.stringify({
          error: "User not authenticated",
          code: "UNAUTHORIZED"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    // 2. Parse request body
    let body: HealthPlanAgentRequest
    try {
      body = await request.json()
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

    // 3. Validate required fields
    const { workspaceId, assistantId, messages, sessionId, resetToStep } = body

    console.log("[route] Step 3: Request parsed successfully")
    console.log("[route] 📋 Request details:", {
      workspaceId,
      assistantId,
      messageCount: messages?.length,
      sessionId: sessionId || "new session",
      resetToStep: resetToStep || "none"
    })

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

    // 4. Get user ID from profile
    const userId = profile.user_id

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
    console.log("[route] Step 6: Initializing orchestrator...")
    console.log("[route] 🔧 Orchestrator config:", {
      userId,
      workspaceId,
      assistantId,
      hasOpenAIKey: !!profile.openai_api_key,
      hasERPConfig: !!erpConfig
    })
    const orchestrator = new HealthPlanOrchestrator({
      sessionId: sessionId || undefined,
      workspaceId,
      userId,
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
    console.log("[route] Step 7: Starting workflow execution with streaming...")
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        let chunkCount = 0

        try {
          console.log("[route] 🎬 Workflow generator started")
          for await (const chunk of orchestrator.executeWorkflow(messages)) {
            chunkCount++
            if (chunkCount <= 5 || chunkCount % 10 === 0) {
              console.log(
                `[route] 📦 Chunk ${chunkCount}:`,
                chunk.substring(0, 100)
              )
            }
            controller.enqueue(encoder.encode(chunk))
          }
          console.log(
            `[route] ✅ Workflow completed, total chunks: ${chunkCount}`
          )
          controller.close()
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred"
          console.error("[route] ❌ Workflow error:", error)

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
