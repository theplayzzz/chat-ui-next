/**
 * E2E Integration Tests
 *
 * Tests the complete monitoring workflow simulating a health plan recommendation session.
 * Validates that all monitoring components work together correctly.
 *
 * Referência: Task #14.8
 */

import { describe, it, expect, beforeEach } from "vitest"

// Import all monitoring components
import {
  // LangSmith config
  generateRunId,
  generateChildRunId,
  isLangSmithEnabled,
  LANGSMITH_CONFIG,

  // Orchestrator tracing
  OrchestratorTracer,
  createOrchestratorTracer,
  STEP_NAMES,

  // Correlation
  generateCorrelationId,
  createTracingContext,
  createChildContext,
  getCorrelationHeaders,
  getLangSmithMetadata,
  getLangSmithTags,
  storeContext,
  getStoredContext,
  clearStoredContext,

  // Metrics
  MetricsCollector,
  createMetricsCollector,
  calculateCost,
  formatCost,
  formatLatency,
  formatMetricsSummary,

  // Dashboard
  PerformanceDashboard,
  createPerformanceDashboard,
  generatePerformanceReport,
  generateJSONReport,

  // Alerts
  AlertManager,
  createAlertManager,
  checkLatencyAlert,
  checkCostAlert,
  formatAlertSummary
} from "../index"

describe("E2E Integration - Complete Monitoring Workflow", () => {
  // Shared context for all tests
  const workspaceId = "workspace-test-123"
  const userId = "user-test-456"
  const sessionId = "session-test-789"

  let correlationId: string
  let orchestratorTracer: OrchestratorTracer
  let metricsCollector: MetricsCollector
  let performanceDashboard: PerformanceDashboard
  let alertManager: AlertManager

  beforeEach(() => {
    // Initialize all monitoring components with shared correlation ID
    correlationId = generateCorrelationId()

    orchestratorTracer = createOrchestratorTracer(
      workspaceId,
      userId,
      sessionId,
      correlationId
    )

    metricsCollector = createMetricsCollector(
      sessionId,
      correlationId,
      workspaceId,
      userId
    )

    performanceDashboard = createPerformanceDashboard(
      correlationId,
      sessionId,
      workspaceId,
      {},
      false // Don't log to console during tests
    )

    alertManager = createAlertManager(
      correlationId,
      sessionId,
      workspaceId,
      undefined,
      false // Don't log to console during tests
    )
  })

  describe("Correlation ID Propagation", () => {
    it("should use same correlation ID across all components", () => {
      // All components should have the same correlation ID
      expect(orchestratorTracer.getCorrelationId()).toBe(correlationId)

      const context = createTracingContext(
        workspaceId,
        sessionId,
        userId,
        correlationId
      )
      expect(context.correlationId).toBe(correlationId)

      // Headers should contain the correlation ID
      const headers = getCorrelationHeaders(context)
      expect(headers["X-Correlation-Id"]).toBe(correlationId)
    })

    it("should propagate correlation ID through child contexts", () => {
      const parentContext = createTracingContext(
        workspaceId,
        sessionId,
        userId,
        correlationId
      )
      const childContext = createChildContext(parentContext, { currentStep: 1 })

      expect(childContext.correlationId).toBe(parentContext.correlationId)
      expect(childContext.metadata?.parentCorrelationId).toBe(correlationId)
    })

    it("should store and retrieve context by correlation ID", () => {
      const context = createTracingContext(
        workspaceId,
        sessionId,
        userId,
        correlationId
      )
      storeContext(context)

      const retrieved = getStoredContext(correlationId)
      expect(retrieved).toEqual(context)

      clearStoredContext(correlationId)
      expect(getStoredContext(correlationId)).toBeUndefined()
    })
  })

  describe("Simulated Health Plan Workflow", () => {
    it("should track complete 5-step workflow with all components", async () => {
      // === Session Start ===
      await orchestratorTracer.startSession({ source: "integration-test" })
      performanceDashboard.logSessionStart({ source: "integration-test" })

      // === Step 1: Extract Client Info ===
      await orchestratorTracer.startStep(1, {
        conversationHistory: ["test message"]
      })
      metricsCollector.startStep(1, "extractClientInfo")
      performanceDashboard.logStepStart(1, "extractClientInfo")

      // Simulate LLM call
      metricsCollector.recordLLMCall(
        "llm-1",
        "extract-client-info",
        "gpt-4o",
        { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
        250,
        true
      )
      performanceDashboard.logLLMCall(
        "extract-client-info",
        "gpt-4o",
        250,
        500,
        200,
        true
      )

      // Check for alerts
      checkLatencyAlert(alertManager, "llm", 250) // Should not trigger

      await orchestratorTracer.endStep(
        1,
        true,
        { clientInfo: {} },
        { clientCompleteness: 85 }
      )
      metricsCollector.endStep(true)
      performanceDashboard.logStepEnd({
        stepNumber: 1,
        stepName: "extractClientInfo",
        latency: { durationMs: 300, startTime: "", endTime: "" },
        llmCalls: [],
        totalTokens: {
          promptTokens: 500,
          completionTokens: 200,
          totalTokens: 700
        },
        totalCost: calculateCost(
          { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
          "gpt-4o"
        ),
        success: true
      })
      metricsCollector.updateBusinessMetrics({ clientCompleteness: 85 })

      // === Step 2: Search Health Plans ===
      await orchestratorTracer.startStep(2, { embeddingQuery: "test query" })
      metricsCollector.startStep(2, "searchHealthPlans")

      // Simulate embedding call
      metricsCollector.recordLLMCall(
        "llm-2",
        "generate-embedding",
        "text-embedding-3-small",
        { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
        50,
        true
      )

      await orchestratorTracer.endStep(
        2,
        true,
        { plans: Array(5) },
        { plansFound: 5 }
      )
      metricsCollector.endStep(true)
      metricsCollector.updateBusinessMetrics({ plansFound: 5 })

      // === Step 3: Analyze Compatibility ===
      await orchestratorTracer.startStep(3, { plans: Array(5) })
      metricsCollector.startStep(3, "analyzeCompatibility")

      // Simulate multiple LLM calls (one per plan)
      for (let i = 0; i < 5; i++) {
        metricsCollector.recordLLMCall(
          `llm-3-${i}`,
          `analyze-plan-${i}`,
          "gpt-4o",
          { promptTokens: 800, completionTokens: 300, totalTokens: 1100 },
          150,
          true
        )
      }

      await orchestratorTracer.endStep(
        3,
        true,
        { rankedPlans: Array(5) },
        {
          plansAnalyzed: 5,
          topPlanScore: 92
        }
      )
      metricsCollector.endStep(true)
      metricsCollector.updateBusinessMetrics({
        plansAnalyzed: 5,
        topPlanScore: 92
      })

      // === Step 4: Fetch ERP Prices ===
      await orchestratorTracer.startStep(4, { planIds: ["plan1"] })
      metricsCollector.startStep(4, "fetchERPPrices")

      // No LLM calls in this step (ERP API call)

      await orchestratorTracer.endStep(4, true, { prices: [] })
      metricsCollector.endStep(true)

      // === Step 5: Generate Recommendation ===
      await orchestratorTracer.startStep(5, {})
      metricsCollector.startStep(5, "generateRecommendation")

      // Simulate LLM call for recommendation
      metricsCollector.recordLLMCall(
        "llm-5",
        "generate-recommendation",
        "gpt-4o",
        { promptTokens: 1500, completionTokens: 800, totalTokens: 2300 },
        500,
        true
      )

      await orchestratorTracer.endStep(5, true, {
        recommendation: "Test recommendation"
      })
      metricsCollector.endStep(true)

      // === Session End ===
      const tracerSummary = await orchestratorTracer.endSession(true, {
        success: true
      })
      const metrics = metricsCollector.finalize(true)

      performanceDashboard.logSessionEnd(metrics)
      performanceDashboard.logPerformanceSummary()

      // === Verify Results ===

      // Tracer summary
      expect(tracerSummary.success).toBe(true)
      expect(tracerSummary.stepsCompleted).toBe(5)
      expect(tracerSummary.correlationId).toBe(correlationId)

      // Metrics
      expect(metrics.success).toBe(true)
      expect(metrics.steps.length).toBe(5)
      expect(metrics.totalTokens.totalTokens).toBeGreaterThan(0)
      expect(metrics.totalCost.totalCost).toBeGreaterThan(0)
      expect(metrics.business.plansFound).toBe(5)
      expect(metrics.business.plansAnalyzed).toBe(5)
      expect(metrics.business.clientCompleteness).toBe(85)

      // Dashboard logs
      const logs = performanceDashboard.getLogs()
      expect(logs.length).toBeGreaterThan(0)
      expect(logs.some(l => l.eventType === "session_start")).toBe(true)
      expect(logs.some(l => l.eventType === "session_end")).toBe(true)

      // Performance report
      const report = generatePerformanceReport(metrics, performanceDashboard)
      expect(report).toContain("PERFORMANCE REPORT")
      expect(report).toContain("SUCCESS")

      // JSON report
      const jsonReport = generateJSONReport(
        metrics,
        performanceDashboard
      ) as any
      expect(jsonReport.session.success).toBe(true)
      expect(jsonReport.steps.length).toBe(5)
    })

    it("should handle workflow failure correctly", async () => {
      // Start session
      await orchestratorTracer.startSession()
      performanceDashboard.logSessionStart()

      // Step 1 succeeds
      await orchestratorTracer.startStep(1, {})
      metricsCollector.startStep(1, "extractClientInfo")
      metricsCollector.recordLLMCall(
        "llm-1",
        "extract",
        "gpt-4o",
        { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
        250,
        true
      )
      await orchestratorTracer.endStep(1, true)
      metricsCollector.endStep(true)

      // Step 2 fails
      await orchestratorTracer.startStep(2, {})
      metricsCollector.startStep(2, "searchHealthPlans")
      await orchestratorTracer.endStep(
        2,
        false,
        undefined,
        undefined,
        "Vector search failed"
      )
      metricsCollector.endStep(false, "Vector search failed")

      // End session with failure
      const tracerSummary = await orchestratorTracer.endSession(
        false,
        undefined,
        "Workflow failed at step 2"
      )
      const metrics = metricsCollector.finalize(false, "Vector search failed")

      performanceDashboard.logSessionEnd(metrics)

      // Verify failure state
      expect(tracerSummary.success).toBe(false)
      expect(tracerSummary.stepsCompleted).toBe(1) // Only step 1 succeeded
      expect(metrics.success).toBe(false)
      expect(metrics.error).toBe("Vector search failed")

      // Dashboard should log error
      const errorLogs = performanceDashboard.getLogsByLevel("error")
      expect(errorLogs.length).toBeGreaterThan(0)
    })
  })

  describe("Alert Integration", () => {
    it("should trigger alerts for high latency", () => {
      // Add a rule with 0 cooldown for testing
      alertManager.addRule({
        id: "test-high-latency",
        name: "Test High Latency",
        description: "Test",
        enabled: true,
        severity: "critical",
        category: "latency",
        metric: "step_latency_ms",
        operator: "gt",
        threshold: 10000,
        cooldownMs: 0
      })

      // Simulate a slow step
      metricsCollector.startStep(1, "extractClientInfo")
      // Record the step end with simulated duration by checking alert
      const results = alertManager.checkMetric("step_latency_ms", 15000, {
        stepName: "extractClientInfo"
      })

      const triggeredAlerts = results.filter(r => r.alert)
      expect(triggeredAlerts.length).toBeGreaterThan(0)

      const alert = triggeredAlerts[0].alert!
      expect(alert.severity).toBe("critical")
      expect(alert.correlationId).toBe(correlationId)
    })

    it("should trigger alerts for high cost", () => {
      alertManager.addRule({
        id: "test-high-cost",
        name: "Test High Cost",
        description: "Test",
        enabled: true,
        severity: "warning",
        category: "cost",
        metric: "session_cost_usd",
        operator: "gt",
        threshold: 0.1,
        cooldownMs: 0
      })

      const results = alertManager.checkMetric("session_cost_usd", 0.25)

      expect(results.some(r => r.alert)).toBe(true)
    })
  })

  describe("Cost Calculations", () => {
    it("should accurately calculate costs for GPT-4o workflow", () => {
      metricsCollector.startStep(1, "step1")

      // Simulate typical workflow token usage
      const step1Tokens = {
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700
      }
      const step3Tokens = {
        promptTokens: 4000,
        completionTokens: 1500,
        totalTokens: 5500
      }
      const step5Tokens = {
        promptTokens: 1500,
        completionTokens: 800,
        totalTokens: 2300
      }

      metricsCollector.recordLLMCall(
        "c1",
        "extract",
        "gpt-4o",
        step1Tokens,
        100,
        true
      )
      metricsCollector.endStep(true)

      metricsCollector.startStep(3, "step3")
      metricsCollector.recordLLMCall(
        "c3",
        "analyze",
        "gpt-4o",
        step3Tokens,
        500,
        true
      )
      metricsCollector.endStep(true)

      metricsCollector.startStep(5, "step5")
      metricsCollector.recordLLMCall(
        "c5",
        "recommend",
        "gpt-4o",
        step5Tokens,
        400,
        true
      )
      metricsCollector.endStep(true)

      const totalCost = metricsCollector.getTotalCost()

      // GPT-4o pricing: $2.50/1M input, $10.00/1M output
      // Total input: 500 + 4000 + 1500 = 6000 tokens = $0.015
      // Total output: 200 + 1500 + 800 = 2500 tokens = $0.025
      // Expected total: $0.04

      expect(totalCost.totalCost).toBeCloseTo(0.04, 2)
      expect(totalCost.currency).toBe("USD")

      // Verify formatted cost
      const formatted = formatCost(totalCost.totalCost)
      expect(formatted).toMatch(/^\$0\.\d+/)
    })
  })

  describe("Run ID Generation", () => {
    it("should generate valid hierarchical run IDs as UUIDs", () => {
      const UUID_PATTERN =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

      const sessionRunId = orchestratorTracer.getSessionRunId()
      // LangSmith requires valid UUIDs for run IDs
      expect(sessionRunId).toMatch(UUID_PATTERN)

      const llmRunId = orchestratorTracer.createLLMRunId("test-llm")
      // Run IDs are UUIDs - name is set via run name field, not in ID
      expect(llmRunId).toMatch(UUID_PATTERN)

      // Start a step and check run ID changes
      orchestratorTracer.startStep(1, {})
      const stepLlmRunId = orchestratorTracer.createLLMRunId("step-llm")
      expect(stepLlmRunId).toMatch(UUID_PATTERN)
      expect(stepLlmRunId).not.toBe(llmRunId)
    })
  })

  describe("LangSmith Metadata", () => {
    it("should generate correct metadata and tags", () => {
      const context = createTracingContext(
        workspaceId,
        sessionId,
        userId,
        correlationId
      )
      context.currentStep = 3

      const metadata = getLangSmithMetadata(context)
      expect(metadata.correlationId).toBe(correlationId)
      expect(metadata.sessionId).toBe(sessionId)
      expect(metadata.workspaceId).toBe(workspaceId)
      expect(metadata.userId).toBe(userId)

      const tags = getLangSmithTags(context)
      expect(tags).toContain("health-plan")
      expect(tags).toContain(`workspace:${workspaceId}`)
      expect(tags).toContain("step:3")
    })
  })

  describe("Report Generation", () => {
    it("should generate comprehensive reports", () => {
      // Create some data
      metricsCollector.startStep(1, "extractClientInfo")
      metricsCollector.recordLLMCall(
        "c1",
        "extract",
        "gpt-4o",
        { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
        250,
        true
      )
      metricsCollector.endStep(true)

      metricsCollector.updateBusinessMetrics({
        plansFound: 5,
        plansAnalyzed: 3,
        clientCompleteness: 85,
        topPlanScore: 92
      })

      const metrics = metricsCollector.finalize(true)
      performanceDashboard.logStepEnd({
        stepNumber: 1,
        stepName: "extractClientInfo",
        latency: { durationMs: 250, startTime: "", endTime: "" },
        llmCalls: [],
        totalTokens: metrics.totalTokens,
        totalCost: metrics.totalCost,
        success: true
      })

      // Text report
      const textReport = generatePerformanceReport(
        metrics,
        performanceDashboard
      )
      expect(textReport).toContain("PERFORMANCE REPORT")
      expect(textReport).toContain("Session ID:")
      expect(textReport).toContain("Duration:")
      expect(textReport).toContain("Cost:")
      expect(textReport).toContain("SUCCESS")
      expect(textReport).toContain("BUSINESS METRICS")

      // JSON report
      const jsonReport = generateJSONReport(
        metrics,
        performanceDashboard
      ) as any
      expect(jsonReport.reportGeneratedAt).toBeDefined()
      expect(jsonReport.session.id).toBe(sessionId)
      expect(jsonReport.business.plansFound).toBe(5)
      expect(jsonReport.statistics).toBeDefined()
    })
  })

  describe("Module Exports", () => {
    it("should export all required functions and types", () => {
      // LangSmith
      expect(generateRunId).toBeDefined()
      expect(generateChildRunId).toBeDefined()
      expect(isLangSmithEnabled).toBeDefined()
      expect(LANGSMITH_CONFIG).toBeDefined()

      // Orchestrator
      expect(OrchestratorTracer).toBeDefined()
      expect(createOrchestratorTracer).toBeDefined()
      expect(STEP_NAMES).toBeDefined()

      // Correlation
      expect(generateCorrelationId).toBeDefined()
      expect(createTracingContext).toBeDefined()
      expect(createChildContext).toBeDefined()
      expect(getCorrelationHeaders).toBeDefined()

      // Metrics
      expect(MetricsCollector).toBeDefined()
      expect(createMetricsCollector).toBeDefined()
      expect(calculateCost).toBeDefined()
      expect(formatCost).toBeDefined()
      expect(formatLatency).toBeDefined()
      expect(formatMetricsSummary).toBeDefined()

      // Dashboard
      expect(PerformanceDashboard).toBeDefined()
      expect(createPerformanceDashboard).toBeDefined()
      expect(generatePerformanceReport).toBeDefined()
      expect(generateJSONReport).toBeDefined()

      // Alerts
      expect(AlertManager).toBeDefined()
      expect(createAlertManager).toBeDefined()
      expect(checkLatencyAlert).toBeDefined()
      expect(checkCostAlert).toBeDefined()
      expect(formatAlertSummary).toBeDefined()
    })
  })
})
