/**
 * Health Plan Agent v2 API Route
 *
 * Agente conversacional adaptativo usando LangGraph.js para
 * recomendação de planos de saúde.
 *
 * Diferenças do v1:
 * - Loop conversacional contínuo (não pipeline de 5 steps)
 * - Capacidades sob demanda
 * - Estado persistido via PostgresSaver
 * - Classificação de intenções do usuário
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Task Master: Task #19
 */

import { NextRequest } from "next/server"
import { StreamingTextResponse } from "ai"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { HumanMessage, AIMessage } from "@langchain/core/messages"
import {
  compileWorkflow,
  createInitialState,
  type HealthPlanWorkflowApp
} from "@/lib/agents/health-plan-v2/workflow/workflow"
import { getCheckpointer } from "@/lib/agents/health-plan-v2/checkpointer/postgres-checkpointer"
import {
  traceable,
  validateAndLogConfig
} from "@/lib/monitoring/langsmith-setup"

// Configuração Vercel: runtime Node.js com 5 minutos de timeout
export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutos (máximo Vercel Pro)

// Validar LangSmith no startup (logga erros/warnings uma vez)
let langsmithValidated = false
function ensureLangSmithValidated() {
  if (!langsmithValidated) {
    validateAndLogConfig()
    langsmithValidated = true
  }
}

/**
 * Invoca o workflow com tracing do LangSmith
 */
const invokeWorkflowTraced = traceable(
  async (
    app: HealthPlanWorkflowApp,
    initialState: ReturnType<typeof createInitialState>,
    chatId: string
  ) => {
    return await app.invoke(initialState, {
      configurable: {
        thread_id: chatId
      }
    })
  },
  {
    name: "health-plan-agent-v2-workflow",
    run_type: "chain",
    tags: ["health-plan-v2", "workflow"],
    metadata: { component: "api-route", version: "2.0.0" }
  }
)

/**
 * Request body interface
 */
interface HealthPlanAgentV2Request {
  workspaceId: string
  assistantId: string
  chatId?: string
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
}

/**
 * POST /api/chat/health-plan-agent-v2
 *
 * Endpoint principal para o agente conversacional v2
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Validar LangSmith na primeira request
  ensureLangSmithValidated()

  console.log("[health-plan-v2] ========================================")
  console.log("[health-plan-v2] Health Plan Agent v2 API called")
  console.log("[health-plan-v2] ========================================")

  try {
    // 1. Autenticação
    console.log("[health-plan-v2] Step 1: Authenticating user...")
    let profile
    try {
      profile = await getServerProfile()
      console.log("[health-plan-v2] ✅ User authenticated:", profile.user_id)
    } catch (error) {
      console.error("[health-plan-v2] ❌ Auth error:", error)
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
    let body: HealthPlanAgentV2Request
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

    // 3. Validar campos obrigatórios
    const { workspaceId, assistantId, chatId, messages } = body

    console.log("[health-plan-v2] Step 3: Request parsed successfully")
    console.log("[health-plan-v2] 📋 Request details:", {
      workspaceId,
      assistantId,
      chatId: chatId || "new chat",
      messageCount: messages?.length
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

    // 4. Gerar chatId se não fornecido
    const effectiveChatId =
      chatId || `chat-${Date.now()}-${Math.random().toString(36).substring(7)}`

    console.log("[health-plan-v2] Step 4: Setting up LangGraph workflow...")

    // 5. Converter mensagens para formato LangChain
    const langchainMessages = messages.map(msg => {
      if (msg.role === "user") {
        return new HumanMessage(msg.content)
      } else {
        return new AIMessage(msg.content)
      }
    })

    // 6. Compilar workflow com checkpointer (Fase 2)
    let app: HealthPlanWorkflowApp
    let checkpointerEnabled = false
    try {
      const checkpointer = await getCheckpointer()
      app = compileWorkflow(checkpointer)
      checkpointerEnabled = true
      console.log(
        "[health-plan-v2] ✅ Checkpointer enabled - state will persist"
      )
    } catch (checkpointerError) {
      // Modo degradado: funciona sem persistência
      console.warn(
        "[health-plan-v2] ⚠️ Checkpointer unavailable, running without persistence:",
        checkpointerError instanceof Error
          ? checkpointerError.message
          : checkpointerError
      )
      app = compileWorkflow()
    }

    // 7. Criar estado inicial
    // BUG FIX (PRD Fase 4, Task 22.8): Quando checkpointer está ativo,
    // passar APENAS a última mensagem para evitar duplicação.
    // O messagesStateReducer faz append, então se passarmos todas as mensagens
    // e o checkpointer restaurar o histórico, haverá duplicação.
    const messagesToSend = checkpointerEnabled
      ? langchainMessages.slice(-1) // Apenas última mensagem (nova)
      : langchainMessages // Todas as mensagens (sem checkpointer)

    console.log("[health-plan-v2] Message handling:", {
      checkpointerEnabled,
      totalMessages: langchainMessages.length,
      messagesToSend: messagesToSend.length,
      strategy: checkpointerEnabled
        ? "last-only (checkpointer restores history)"
        : "all (no persistence)"
    })

    const initialState = createInitialState({
      workspaceId,
      userId: profile.user_id,
      assistantId,
      chatId: effectiveChatId,
      messages: messagesToSend
    })

    // 8. Criar stream de resposta
    console.log("[health-plan-v2] Step 8: Creating response stream...")

    // Flag para enviar debug apenas em dev/staging
    const isDev = process.env.NODE_ENV !== "production"

    // Variáveis para capturar resultado do workflow para headers
    let lastIntent: string | null = null
    let lastIntentConfidence: number = 0
    let clientInfoVersion: number = 0

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          // Invocar o workflow com tracing LangSmith
          const result = await invokeWorkflowTraced(
            app,
            initialState,
            effectiveChatId
          )

          // Capturar dados para headers
          lastIntent = result.lastIntent || null
          lastIntentConfidence = result.lastIntentConfidence || 0
          clientInfoVersion = result.clientInfoVersion || 0

          // Extrair resposta do resultado
          const response =
            result.currentResponse ||
            "Olá! Sou o assistente de planos de saúde v2. Em breve estarei totalmente funcional."

          // Enviar debug metadata no início do stream (apenas em dev)
          if (isDev) {
            const debugInfo = {
              __debug: {
                intent: result.lastIntent,
                confidence: result.lastIntentConfidence,
                clientInfo: result.clientInfo,
                clientInfoVersion: result.clientInfoVersion,
                timestamp: new Date().toISOString()
              }
            }
            controller.enqueue(
              encoder.encode(
                `__DEBUG__${JSON.stringify(debugInfo)}__DEBUG__\n\n`
              )
            )
          }

          // Simular streaming enviando a resposta em chunks
          const words = response.split(" ")
          for (let i = 0; i < words.length; i++) {
            const chunk = (i === 0 ? "" : " ") + words[i]
            controller.enqueue(encoder.encode(chunk))
            // Pequeno delay para simular streaming
            await new Promise(resolve => setTimeout(resolve, 30))
          }

          console.log("[health-plan-v2] ✅ Response streamed successfully", {
            intent: lastIntent,
            confidence: lastIntentConfidence
          })
          controller.close()
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred"
          console.error("[health-plan-v2] ❌ Workflow error:", error)

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
    console.log(`[health-plan-v2] Request completed in ${executionTime}ms`)

    // 9. Retornar resposta em streaming com headers de debug
    return new StreamingTextResponse(stream, {
      headers: {
        "X-Chat-Id": effectiveChatId,
        "X-Execution-Time": executionTime.toString(),
        "X-Checkpointer-Enabled": checkpointerEnabled.toString(),
        // Headers de debug para intenção (sempre visíveis em devtools)
        "X-Last-Intent": lastIntent || "unknown",
        "X-Intent-Confidence": lastIntentConfidence.toString(),
        "X-Client-Info-Version": clientInfoVersion.toString()
      }
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred"
    const executionTime = Date.now() - startTime

    console.error(
      `[health-plan-v2] Critical error after ${executionTime}ms:`,
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
