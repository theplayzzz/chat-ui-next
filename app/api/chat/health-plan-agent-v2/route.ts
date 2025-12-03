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
  createInitialState
} from "@/lib/agents/health-plan-v2/workflow/workflow"

// Configuração Vercel: runtime Node.js com 5 minutos de timeout
export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutos (máximo Vercel Pro)

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

  console.log("[health-plan-v2] ========================================")
  console.log("[health-plan-v2] 🚀 Health Plan Agent v2 API called")
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

    // 6. Criar estado inicial
    const initialState = createInitialState({
      workspaceId,
      userId: profile.user_id,
      assistantId,
      chatId: effectiveChatId,
      messages: langchainMessages
    })

    // 7. Compilar workflow (sem checkpointer por enquanto - Fase 1 stub)
    // TODO: Adicionar checkpointer na Fase 2
    const app = compileWorkflow()

    // 8. Criar stream de resposta
    console.log("[health-plan-v2] Step 8: Creating response stream...")

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          // Invocar o workflow
          const result = await app.invoke(initialState, {
            configurable: {
              thread_id: effectiveChatId
            }
          })

          // Extrair resposta do resultado
          const response =
            result.currentResponse ||
            "Olá! Sou o assistente de planos de saúde v2. Em breve estarei totalmente funcional."

          // Simular streaming enviando a resposta em chunks
          const words = response.split(" ")
          for (let i = 0; i < words.length; i++) {
            const chunk = (i === 0 ? "" : " ") + words[i]
            controller.enqueue(encoder.encode(chunk))
            // Pequeno delay para simular streaming
            await new Promise(resolve => setTimeout(resolve, 30))
          }

          console.log("[health-plan-v2] ✅ Response streamed successfully")
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

    // 9. Retornar resposta em streaming
    return new StreamingTextResponse(stream, {
      headers: {
        "X-Chat-Id": effectiveChatId,
        "X-Execution-Time": executionTime.toString()
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
