/**
 * Agent Interaction Test Script
 *
 * Tests the Health Plan Agent with LangSmith tracing enabled.
 * Validates that interactions are properly recorded in LangSmith.
 *
 * Run with:
 * LANGSMITH_API_KEY=... LANGSMITH_WORKSPACE_ID=... LANGSMITH_PROJECT=health-plan-agent OPENAI_API_KEY=... npx tsx lib/monitoring/test-agent-interaction.ts
 */

import OpenAI from "openai"
import { v4 as uuidv4 } from "uuid"
import {
  getLangSmithClient,
  isLangSmithEnabled,
  LANGSMITH_CONFIG
} from "./langsmith-config"
import { createOrchestratorTracer, traceStep } from "./orchestrator-tracer"
import { generateCorrelationId } from "./correlation"

// =============================================================================
// CONFIGURATION
// =============================================================================

const TEST_CONFIG = {
  workspaceId: "test-workspace-" + Date.now(),
  userId: "test-user-001",
  sessionId: "test-session-" + Date.now()
}

// =============================================================================
// OPENAI TRACED CLIENT
// =============================================================================

async function createTracedCompletion(
  openai: OpenAI,
  tracer: ReturnType<typeof createOrchestratorTracer>,
  messages: OpenAI.ChatCompletionMessageParam[],
  options: { model?: string; temperature?: number } = {}
): Promise<string> {
  const client = getLangSmithClient()
  const runId = uuidv4()
  const startTime = Date.now()

  const model = options.model || "gpt-4o-mini"
  const temperature = options.temperature ?? 0.7

  // Log to LangSmith
  if (client) {
    try {
      await client.createRun({
        id: runId,
        parent_run_id: tracer.getCurrentStepRunId() || tracer.getSessionRunId(),
        name: "openai-chat-completion",
        run_type: "llm",
        inputs: {
          messages,
          model,
          temperature
        },
        project_name: LANGSMITH_CONFIG.projectName,
        start_time: new Date().toISOString(),
        extra: {
          metadata: {
            correlationId: tracer.getCorrelationId(),
            provider: "openai",
            model
          },
          tags: ["health-plan", "llm", model]
        }
      })
    } catch (e) {
      console.warn("[traced-completion] Failed to create run:", e)
    }
  }

  // Make actual OpenAI call
  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature
  })

  const content = completion.choices[0]?.message?.content || ""
  const usage = completion.usage

  // Update LangSmith run
  if (client) {
    try {
      await client.updateRun(runId, {
        outputs: {
          content,
          usage
        },
        end_time: new Date().toISOString(),
        extra: {
          runtime_ms: Date.now() - startTime,
          tokens: {
            input: usage?.prompt_tokens,
            output: usage?.completion_tokens,
            total: usage?.total_tokens
          }
        }
      })
    } catch (e) {
      console.warn("[traced-completion] Failed to update run:", e)
    }
  }

  return content
}

// =============================================================================
// TEST SCENARIOS
// =============================================================================

interface TestScenario {
  name: string
  userMessage: string
  systemPrompt: string
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: "Saudação inicial",
    userMessage: "Olá, preciso de ajuda para escolher um plano de saúde",
    systemPrompt: `Você é um assistente especializado em planos de saúde.
Responda de forma amigável e pergunte informações básicas do cliente.`
  },
  {
    name: "Perfil do cliente",
    userMessage:
      "Tenho 35 anos, moro em São Paulo, trabalho como desenvolvedor de software. Quero um plano empresarial para mim e minha esposa de 33 anos.",
    systemPrompt: `Você é um assistente especializado em planos de saúde.
Analise as informações do cliente e confirme que entendeu o perfil.
Liste as informações coletadas.`
  },
  {
    name: "Preferências específicas",
    userMessage:
      "Preciso de cobertura para consultas, exames e emergências. Orçamento de até R$ 1.500 por mês para os dois.",
    systemPrompt: `Você é um assistente especializado em planos de saúde.
Confirme as preferências e explique que vai buscar opções compatíveis.`
  }
]

// =============================================================================
// MAIN TEST FUNCTION
// =============================================================================

async function main() {
  console.log("=".repeat(70))
  console.log("Health Plan Agent - Interaction Test with LangSmith Tracing")
  console.log("=".repeat(70))
  console.log()

  // Check configuration
  console.log("1. Checking configuration...")
  console.log(`   LangSmith Project: ${LANGSMITH_CONFIG.projectName}`)
  console.log(`   LangSmith Enabled: ${isLangSmithEnabled()}`)
  console.log(
    `   OpenAI API Key: ${process.env.OPENAI_API_KEY ? "✓ Set" : "✗ Missing"}`
  )
  console.log()

  if (!isLangSmithEnabled()) {
    console.error("ERROR: LANGSMITH_API_KEY not found!")
    process.exit(1)
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY not found!")
    process.exit(1)
  }

  // Initialize OpenAI
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })

  // Create tracer
  const correlationId = generateCorrelationId()
  const tracer = createOrchestratorTracer(
    TEST_CONFIG.workspaceId,
    TEST_CONFIG.userId,
    TEST_CONFIG.sessionId,
    correlationId
  )

  console.log("2. Starting traced session...")
  console.log(`   Session ID: ${tracer.getSessionRunId()}`)
  console.log(`   Correlation ID: ${correlationId}`)
  console.log()

  // Start session trace
  await tracer.startSession({
    source: "test-agent-interaction",
    testMode: true,
    scenarios: TEST_SCENARIOS.length
  })

  let totalTokens = 0
  const conversationHistory: OpenAI.ChatCompletionMessageParam[] = []

  // Execute test scenarios
  console.log("3. Running test scenarios...")
  console.log()

  for (let i = 0; i < TEST_SCENARIOS.length; i++) {
    const scenario = TEST_SCENARIOS[i]
    const stepNumber = (i + 1) as 1 | 2 | 3 | 4 | 5

    console.log(`   Scenario ${i + 1}: ${scenario.name}`)
    console.log(`   User: "${scenario.userMessage.substring(0, 50)}..."`)

    // Start step trace
    await tracer.startStep(stepNumber, {
      scenarioName: scenario.name,
      userMessage: scenario.userMessage
    })

    // Build messages
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: scenario.systemPrompt },
      ...conversationHistory,
      { role: "user", content: scenario.userMessage }
    ]

    const startTime = Date.now()

    try {
      // Make traced completion
      const response = await createTracedCompletion(openai, tracer, messages, {
        model: "gpt-4o-mini",
        temperature: 0.7
      })

      const duration = Date.now() - startTime

      // Update conversation history
      conversationHistory.push(
        { role: "user", content: scenario.userMessage },
        { role: "assistant", content: response }
      )

      console.log(`   Assistant: "${response.substring(0, 80)}..."`)
      console.log(`   Duration: ${duration}ms`)
      console.log()

      // End step with success
      await tracer.endStep(stepNumber, true, {
        response: response.substring(0, 200),
        durationMs: duration
      })
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`   ERROR: ${error}`)

      await tracer.endStep(
        stepNumber,
        false,
        undefined,
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }

    // Small delay between scenarios
    await sleep(500)
  }

  // End session
  console.log("4. Ending session...")
  const summary = await tracer.endSession(true, {
    scenariosCompleted: TEST_SCENARIOS.length,
    conversationTurns: conversationHistory.length / 2
  })

  console.log()
  console.log("=".repeat(70))
  console.log("TEST COMPLETE!")
  console.log("=".repeat(70))
  console.log()
  console.log("Session Summary:")
  console.log(`   Session Run ID: ${summary.sessionRunId}`)
  console.log(`   Correlation ID: ${summary.correlationId}`)
  console.log(`   Total Duration: ${summary.totalDurationMs}ms`)
  console.log(`   Steps Completed: ${summary.stepsCompleted}`)
  console.log(`   Success: ${summary.success}`)
  console.log()
  console.log("View traces at LangSmith:")
  console.log(
    `   https://smith.langchain.com/o/default/projects/p/${LANGSMITH_CONFIG.projectName}`
  )
  console.log()
  console.log("Search for:")
  console.log(`   - Session ID: ${summary.sessionRunId}`)
  console.log(`   - Correlation ID: ${correlationId}`)
  console.log("=".repeat(70))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run
main().catch(error => {
  console.error("Fatal error:", error)
  process.exit(1)
})
