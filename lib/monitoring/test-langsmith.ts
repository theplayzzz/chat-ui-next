/**
 * LangSmith Connection Test Script
 *
 * Tests the LangSmith connection and sends a sample trace.
 * Run with: npx tsx lib/monitoring/test-langsmith.ts
 *
 * Requires LANGSMITH_API_KEY in environment.
 */

import {
  getLangSmithClient,
  checkLangSmithHealth,
  isLangSmithEnabled,
  LANGSMITH_CONFIG
} from "./langsmith-config"

import { createOrchestratorTracer, STEP_NAMES } from "./orchestrator-tracer"

import { generateCorrelationId } from "./correlation"

async function main() {
  console.log("=".repeat(60))
  console.log("LangSmith Connection Test")
  console.log("=".repeat(60))
  console.log()

  // Check configuration
  console.log("1. Checking configuration...")
  console.log(`   Project: ${LANGSMITH_CONFIG.projectName}`)
  console.log(`   Endpoint: ${LANGSMITH_CONFIG.apiEndpoint}`)
  console.log(`   Enabled: ${isLangSmithEnabled()}`)
  console.log()

  if (!isLangSmithEnabled()) {
    console.error("ERROR: LANGSMITH_API_KEY not found in environment!")
    console.log(
      "Make sure to run: source .env.local && npx tsx lib/monitoring/test-langsmith.ts"
    )
    process.exit(1)
  }

  // Test health check
  console.log("2. Testing health check...")
  const health = await checkLangSmithHealth()
  console.log(`   Healthy: ${health.healthy}`)
  console.log(`   Latency: ${health.latencyMs}ms`)
  console.log(`   Project: ${health.projectName}`)
  if (health.error) {
    console.log(`   Error: ${health.error}`)
  }
  console.log()

  if (!health.healthy) {
    console.error("ERROR: Could not connect to LangSmith!")
    process.exit(1)
  }

  // Send a sample trace
  console.log("3. Sending sample trace...")
  const correlationId = generateCorrelationId()
  console.log(`   Correlation ID: ${correlationId}`)

  const tracer = createOrchestratorTracer(
    "test-workspace",
    "test-user",
    "test-session",
    correlationId
  )

  console.log(`   Session Run ID: ${tracer.getSessionRunId()}`)
  console.log()

  try {
    // Start session
    console.log("   Starting session trace...")
    await tracer.startSession({
      source: "test-script",
      testMode: true
    })

    // Simulate Step 1: Extract Client Info
    console.log("   Step 1: extractClientInfo...")
    await tracer.startStep(1, {
      conversationHistory: ["Test message from user"]
    })

    // Simulate some processing time
    await sleep(100)

    await tracer.endStep(
      1,
      true,
      {
        clientInfo: {
          age: 35,
          location: "São Paulo"
        }
      },
      {
        clientCompleteness: 75
      }
    )

    // Simulate Step 2: Search Health Plans
    console.log("   Step 2: searchHealthPlans...")
    await tracer.startStep(2, {
      query: "plano de saúde empresarial"
    })

    await sleep(50)

    await tracer.endStep(
      2,
      true,
      {
        plansFound: 5
      },
      {
        plansFound: 5
      }
    )

    // Simulate Step 3: Analyze Compatibility
    console.log("   Step 3: analyzeCompatibility...")
    await tracer.startStep(3, {
      planCount: 5
    })

    await sleep(150)

    await tracer.endStep(
      3,
      true,
      {
        rankedPlans: [
          { id: "plan-1", score: 92 },
          { id: "plan-2", score: 85 },
          { id: "plan-3", score: 78 }
        ]
      },
      {
        plansAnalyzed: 3,
        topPlanScore: 92
      }
    )

    // Skip Step 4 (ERP) for this test

    // Simulate Step 5: Generate Recommendation
    console.log("   Step 5: generateRecommendation...")
    await tracer.startStep(5, {
      topPlan: "plan-1"
    })

    await sleep(100)

    await tracer.endStep(5, true, {
      recommendation: "Recomendamos o Plano Premium..."
    })

    // End session
    console.log("   Ending session...")
    const summary = await tracer.endSession(true, {
      recommendedPlan: "plan-1",
      success: true
    })

    console.log()
    console.log("4. Trace Summary:")
    console.log(`   Session Run ID: ${summary.sessionRunId}`)
    console.log(`   Correlation ID: ${summary.correlationId}`)
    console.log(`   Steps Completed: ${summary.stepsCompleted}`)
    console.log(`   Total Duration: ${summary.totalDurationMs}ms`)
    console.log(`   Success: ${summary.success}`)
    console.log()

    console.log("=".repeat(60))
    console.log("SUCCESS! Trace sent to LangSmith.")
    console.log()
    console.log("View your trace at:")
    console.log(
      `https://smith.langchain.com/o/default/projects/p/${LANGSMITH_CONFIG.projectName}`
    )
    console.log()
    console.log("Or search for:")
    console.log(`- Session ID: ${summary.sessionRunId}`)
    console.log(`- Correlation ID: ${correlationId}`)
    console.log("=".repeat(60))
  } catch (error) {
    console.error("ERROR sending trace:", error)

    // Try to end session with error
    try {
      await tracer.endSession(false, undefined, String(error))
    } catch {}

    process.exit(1)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run
main().catch(console.error)
