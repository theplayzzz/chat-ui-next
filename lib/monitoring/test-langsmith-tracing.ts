/**
 * LangSmith Tracing Validation Test
 *
 * Tests the complete tracing flow with simulated responses
 * to validate that LangSmith is properly recording traces.
 *
 * Run with:
 * LANGSMITH_API_KEY=... LANGSMITH_WORKSPACE_ID=... LANGSMITH_PROJECT=health-plan-agent npx tsx lib/monitoring/test-langsmith-tracing.ts
 */

import { v4 as uuidv4 } from "uuid"
import {
  getLangSmithClient,
  isLangSmithEnabled,
  LANGSMITH_CONFIG
} from "./langsmith-config"
import { createOrchestratorTracer, STEP_NAMES } from "./orchestrator-tracer"
import { generateCorrelationId } from "./correlation"

// =============================================================================
// SIMULATED WORKFLOW DATA
// =============================================================================

const SIMULATED_DATA = {
  clientInfo: {
    age: 35,
    location: "São Paulo",
    occupation: "Desenvolvedor de Software",
    dependents: [{ relationship: "spouse", age: 33 }],
    budget: 1500,
    coveragePreferences: ["consultas", "exames", "emergências"]
  },
  searchResults: {
    plansFound: 8,
    topPlans: [
      { id: "bradesco-top", name: "Bradesco Saúde Top Nacional", score: 0.92 },
      { id: "sulamerica-especial", name: "SulAmérica Especial", score: 0.88 },
      { id: "unimed-flex", name: "Unimed Flex 200", score: 0.85 }
    ]
  },
  analysis: {
    rankedPlans: [
      {
        planId: "bradesco-top",
        planName: "Bradesco Saúde Top Nacional",
        score: { overall: 92, price: 85, coverage: 95, network: 90 }
      },
      {
        planId: "sulamerica-especial",
        planName: "SulAmérica Especial",
        score: { overall: 88, price: 90, coverage: 85, network: 88 }
      },
      {
        planId: "unimed-flex",
        planName: "Unimed Flex 200",
        score: { overall: 85, price: 92, coverage: 80, network: 85 }
      }
    ]
  },
  erpPrices: {
    "bradesco-top": { monthly: 1450, annual: 15660 },
    "sulamerica-especial": { monthly: 1280, annual: 13824 },
    "unimed-flex": { monthly: 1120, annual: 12096 }
  },
  recommendation: {
    topPlan: "Bradesco Saúde Top Nacional",
    reasoning:
      "Melhor cobertura e rede credenciada para profissionais de TI em São Paulo"
  }
}

// =============================================================================
// MAIN TEST
// =============================================================================

async function main() {
  console.log("=".repeat(70))
  console.log("LangSmith Tracing Validation Test")
  console.log("=".repeat(70))
  console.log()

  // Check configuration
  console.log("1. Validating LangSmith configuration...")
  if (!isLangSmithEnabled()) {
    console.error("ERROR: LANGSMITH_API_KEY not found!")
    process.exit(1)
  }

  const client = getLangSmithClient()
  if (!client) {
    console.error("ERROR: Could not create LangSmith client!")
    process.exit(1)
  }

  console.log(`   Project: ${LANGSMITH_CONFIG.projectName}`)
  console.log(`   ✓ LangSmith client ready`)
  console.log()

  // Create tracer
  const correlationId = generateCorrelationId()
  const tracer = createOrchestratorTracer(
    "workspace-test-" + Date.now(),
    "user-test-001",
    "session-" + Date.now(),
    correlationId
  )

  console.log("2. Creating traced workflow session...")
  console.log(`   Session Run ID: ${tracer.getSessionRunId()}`)
  console.log(`   Correlation ID: ${correlationId}`)
  console.log()

  // Start session
  await tracer.startSession({
    source: "tracing-validation-test",
    testMode: true,
    timestamp: new Date().toISOString()
  })

  console.log("3. Executing traced workflow steps...")
  console.log()

  // Step 1: Extract Client Info
  console.log("   [Step 1] extractClientInfo")
  await tracer.startStep(1, {
    conversationHistory: ["User: Olá, preciso de um plano de saúde"]
  })
  await sleep(200)
  await tracer.endStep(
    1,
    true,
    {
      clientInfo: SIMULATED_DATA.clientInfo,
      isComplete: true
    },
    {
      clientCompleteness: 95,
      missingFields: []
    }
  )
  console.log("      ✓ Extracted client profile")

  // Step 2: Search Health Plans
  console.log("   [Step 2] searchHealthPlans")
  await tracer.startStep(2, {
    clientProfile: SIMULATED_DATA.clientInfo
  })
  await sleep(150)

  // Simulate LLM call for embeddings
  const embeddingRunId = uuidv4()
  await client.createRun({
    id: embeddingRunId,
    parent_run_id: tracer.getCurrentStepRunId()!,
    name: "text-embedding-3-small",
    run_type: "llm",
    inputs: { text: "plano de saúde empresarial SP" },
    project_name: LANGSMITH_CONFIG.projectName,
    start_time: new Date().toISOString(),
    extra: {
      metadata: { correlationId, model: "text-embedding-3-small" },
      tags: ["embedding", "search"]
    }
  })
  await sleep(100)
  await client.updateRun(embeddingRunId, {
    outputs: { dimensions: 1536 },
    end_time: new Date().toISOString()
  })

  await tracer.endStep(
    2,
    true,
    {
      plansFound: SIMULATED_DATA.searchResults.plansFound,
      topPlans: SIMULATED_DATA.searchResults.topPlans
    },
    {
      plansFound: SIMULATED_DATA.searchResults.plansFound
    }
  )
  console.log(`      ✓ Found ${SIMULATED_DATA.searchResults.plansFound} plans`)

  // Step 3: Analyze Compatibility
  console.log("   [Step 3] analyzeCompatibility")
  await tracer.startStep(3, {
    plansToAnalyze: SIMULATED_DATA.searchResults.topPlans.length
  })
  await sleep(300)

  // Simulate GPT-4o analysis calls
  for (const plan of SIMULATED_DATA.searchResults.topPlans) {
    const analysisRunId = uuidv4()
    await client.createRun({
      id: analysisRunId,
      parent_run_id: tracer.getCurrentStepRunId()!,
      name: `analyze-${plan.id}`,
      run_type: "llm",
      inputs: { planId: plan.id, clientInfo: SIMULATED_DATA.clientInfo },
      project_name: LANGSMITH_CONFIG.projectName,
      start_time: new Date().toISOString(),
      extra: {
        metadata: { correlationId, model: "gpt-4o-mini", planName: plan.name },
        tags: ["analysis", "compatibility"]
      }
    })
    await sleep(50)
    await client.updateRun(analysisRunId, {
      outputs: { score: plan.score, eligible: true },
      end_time: new Date().toISOString()
    })
  }

  await tracer.endStep(
    3,
    true,
    {
      rankedPlans: SIMULATED_DATA.analysis.rankedPlans
    },
    {
      plansAnalyzed: SIMULATED_DATA.analysis.rankedPlans.length,
      topPlanScore: SIMULATED_DATA.analysis.rankedPlans[0].score.overall
    }
  )
  console.log(
    `      ✓ Analyzed ${SIMULATED_DATA.analysis.rankedPlans.length} plans`
  )

  // Step 4: Fetch ERP Prices
  console.log("   [Step 4] fetchERPPrices")
  await tracer.startStep(4, {
    planIds: Object.keys(SIMULATED_DATA.erpPrices)
  })
  await sleep(100)

  // Simulate ERP API call
  const erpRunId = uuidv4()
  await client.createRun({
    id: erpRunId,
    parent_run_id: tracer.getCurrentStepRunId()!,
    name: "erp-api-call",
    run_type: "tool",
    inputs: { planIds: Object.keys(SIMULATED_DATA.erpPrices) },
    project_name: LANGSMITH_CONFIG.projectName,
    start_time: new Date().toISOString(),
    extra: {
      metadata: { correlationId, service: "ERP" },
      tags: ["erp", "pricing"]
    }
  })
  await sleep(80)
  await client.updateRun(erpRunId, {
    outputs: { prices: SIMULATED_DATA.erpPrices, cached: false },
    end_time: new Date().toISOString()
  })

  await tracer.endStep(4, true, {
    prices: SIMULATED_DATA.erpPrices,
    cached: false
  })
  console.log("      ✓ Fetched pricing from ERP")

  // Step 5: Generate Recommendation
  console.log("   [Step 5] generateRecommendation")
  await tracer.startStep(5, {
    topPlan: SIMULATED_DATA.analysis.rankedPlans[0].planName
  })
  await sleep(200)

  // Simulate GPT-4o recommendation generation
  const recoRunId = uuidv4()
  await client.createRun({
    id: recoRunId,
    parent_run_id: tracer.getCurrentStepRunId()!,
    name: "generate-recommendation-gpt4o",
    run_type: "llm",
    inputs: {
      rankedPlans: SIMULATED_DATA.analysis.rankedPlans,
      clientInfo: SIMULATED_DATA.clientInfo
    },
    project_name: LANGSMITH_CONFIG.projectName,
    start_time: new Date().toISOString(),
    extra: {
      metadata: { correlationId, model: "gpt-4o", temperature: 0.1 },
      tags: ["recommendation", "final"]
    }
  })
  await sleep(150)
  await client.updateRun(recoRunId, {
    outputs: {
      recommendation: SIMULATED_DATA.recommendation,
      tokensUsed: 2500
    },
    end_time: new Date().toISOString()
  })

  await tracer.endStep(5, true, {
    recommendation: SIMULATED_DATA.recommendation.topPlan,
    reasoning: SIMULATED_DATA.recommendation.reasoning
  })
  console.log("      ✓ Generated personalized recommendation")
  console.log()

  // End session
  console.log("4. Completing session trace...")
  const summary = await tracer.endSession(true, {
    recommendedPlan: SIMULATED_DATA.recommendation.topPlan,
    success: true
  })

  console.log()
  console.log("=".repeat(70))
  console.log("✅ TRACING VALIDATION COMPLETE!")
  console.log("=".repeat(70))
  console.log()
  console.log("Session Summary:")
  console.log(`   Session Run ID: ${summary.sessionRunId}`)
  console.log(`   Correlation ID: ${summary.correlationId}`)
  console.log(`   Total Duration: ${summary.totalDurationMs}ms`)
  console.log(`   Steps Completed: ${summary.stepsCompleted}`)
  console.log(`   Success: ${summary.success}`)
  console.log()
  console.log("Trace Hierarchy:")
  console.log("   └── health-plan-recommendation (session)")
  console.log("       ├── extractClientInfo (step 1)")
  console.log("       ├── searchHealthPlans (step 2)")
  console.log("       │   └── text-embedding-3-small (llm)")
  console.log("       ├── analyzeCompatibility (step 3)")
  console.log("       │   ├── analyze-bradesco-top (llm)")
  console.log("       │   ├── analyze-sulamerica-especial (llm)")
  console.log("       │   └── analyze-unimed-flex (llm)")
  console.log("       ├── fetchERPPrices (step 4)")
  console.log("       │   └── erp-api-call (tool)")
  console.log("       └── generateRecommendation (step 5)")
  console.log("           └── generate-recommendation-gpt4o (llm)")
  console.log()
  console.log("🔍 View traces at LangSmith:")
  console.log(`   https://smith.langchain.com`)
  console.log()
  console.log("   Search for Session ID: ${summary.sessionRunId}")
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
