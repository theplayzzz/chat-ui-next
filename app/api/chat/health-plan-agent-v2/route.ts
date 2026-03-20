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
import {
  buildDebugPayload,
  saveWorkflowLog
} from "@/lib/agents/health-plan-v2/audit/save-workflow-log"
import { routeToCapabilityWithReason } from "@/lib/agents/health-plan-v2/nodes/router"

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
 * Reconstrói clientInfo a partir do histórico de mensagens do assistente.
 * Usado como fallback quando o checkpointer está inativo.
 * Busca dados estruturados (idade, cidade, dependentes, etc.) nas respostas
 * de confirmação do assistente que contêm os dados coletados.
 */
function reconstructClientInfoFromHistory(
  messages: Array<{ role: string; content: string }>
): Record<string, unknown> | null {
  // Procurar nas mensagens do assistente por confirmações de dados
  const assistantMessages = messages
    .filter(m => m.role === "assistant")
    .map(m => m.content)

  const clientInfo: Record<string, unknown> = {}

  for (const content of assistantMessages) {
    // Extrair idade: "Idade: 29 anos"
    const ageMatch = content.match(/Idade:\s*(\d+)\s*anos/i)
    if (ageMatch) clientInfo.age = parseInt(ageMatch[1])

    // Extrair cidade/estado: "Localização: Nova Iguaçu, RJ"
    const locMatch = content.match(
      /Localiza[çc][aã]o:\s*([^,\n]+),\s*([A-Z]{2})/i
    )
    if (locMatch) {
      clientInfo.city = locMatch[1].trim()
      clientInfo.state = locMatch[2].trim()
    }

    // Extrair orçamento: "Orçamento: R$ 900/mês"
    const budgetMatch = content.match(/Or[çc]amento:\s*R\$\s*([\d.,]+)/i)
    if (budgetMatch)
      clientInfo.budget = parseFloat(
        budgetMatch[1].replace(".", "").replace(",", ".")
      )

    // Extrair dependentes: "cônjuge, 25 anos" e "filho(a), 3 anos"
    const depMatches = [
      ...content.matchAll(/(?:cônjuge|esposa|marido|spouse),?\s*(\d+)\s*anos/gi)
    ]
    const childMatches = [
      ...content.matchAll(
        /(?:filho|filha|filho\(a\)|child),?\s*(\d+)\s*anos?/gi
      )
    ]

    if (depMatches.length > 0 || childMatches.length > 0) {
      const dependents: Array<{ age: number; relationship: string }> = []
      for (const m of depMatches) {
        dependents.push({ age: parseInt(m[1]), relationship: "spouse" })
      }
      for (const m of childMatches) {
        dependents.push({ age: parseInt(m[1]), relationship: "child" })
      }
      if (dependents.length > 0) clientInfo.dependents = dependents
    }
  }

  return Object.keys(clientInfo).length > 0 ? clientInfo : null
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
    let profile: Awaited<ReturnType<typeof getServerProfile>>
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
      const envInfo = {
        DATABASE_URL_POOLER: process.env.DATABASE_URL_POOLER
          ? "SET"
          : "MISSING",
        DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
        NODE_ENV: process.env.NODE_ENV
      }
      console.error(
        "[health-plan-v2] ❌ CHECKPOINTER FAILED - State will NOT persist between messages!",
        {
          error:
            checkpointerError instanceof Error
              ? checkpointerError.message
              : checkpointerError,
          envVars: envInfo,
          impact:
            "Agent will lose context (clientInfo, searchResults) between requests"
        }
      )
      app = compileWorkflow()
    }

    // 7. Criar estado inicial
    // Quando checkpointer está ativo: APENAS última mensagem (checkpointer restaura histórico)
    // Quando checkpointer falha: TODAS as mensagens (sem persistência de estado)
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

    // FALLBACK: Quando checkpointer está inativo, reconstruir clientInfo
    // do histórico de mensagens para não perder contexto entre requests
    if (!checkpointerEnabled && messages.length > 1) {
      const reconstructed = reconstructClientInfoFromHistory(messages)
      if (reconstructed && Object.keys(reconstructed).length > 0) {
        ;(initialState as Record<string, unknown>).clientInfo = reconstructed
        ;(initialState as Record<string, unknown>).clientInfoVersion = 1
        console.log(
          "[health-plan-v2] 🔄 Reconstructed clientInfo from history (no checkpointer):",
          Object.keys(reconstructed)
        )
      }
    }

    // 8. Criar stream de resposta
    console.log("[health-plan-v2] Step 8: Creating response stream...")

    // Flag para enviar debug - controlada por env var (ativa por padrão em dev, opt-in em produção)
    const isDev =
      process.env.NODE_ENV !== "production" ||
      process.env.ENABLE_AGENT_DEBUG === "true"

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

          // Capturar decisão de roteamento para debug
          const routeDecision = result.lastIntent
            ? routeToCapabilityWithReason(result)
            : undefined

          const workflowExecutionTime = Date.now() - startTime

          // Extrair resposta do resultado
          const response =
            result.currentResponse ||
            "Olá! Sou o assistente de planos de saúde v2. Em breve estarei totalmente funcional."

          // Build debug payload (used for both stream and DB)
          const logParams = {
            workspaceId,
            userId: profile.user_id,
            chatId: effectiveChatId,
            assistantId,
            result,
            executionTimeMs: workflowExecutionTime,
            checkpointerEnabled,
            routeDecision: routeDecision
              ? {
                  capability: routeDecision.capability,
                  reason: routeDecision.reason,
                  redirected: routeDecision.redirected
                }
              : undefined
          }

          const debugPayload = buildDebugPayload(logParams)

          // Enviar debug metadata no início do stream
          if (isDev) {
            controller.enqueue(
              encoder.encode(
                `__DEBUG__${JSON.stringify({ __debug: debugPayload })}__DEBUG__\n\n`
              )
            )
          }

          // Save workflow log asynchronously (fire-and-forget)
          saveWorkflowLog(logParams).catch(err => {
            console.error(
              "[health-plan-v2] Workflow log save failed (non-blocking):",
              err
            )
          })

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
