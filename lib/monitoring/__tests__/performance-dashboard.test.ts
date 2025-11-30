/**
 * Performance Dashboard Tests
 *
 * Tests for structured logging and reporting of performance metrics.
 *
 * Referência: Task #14.6
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  PerformanceDashboard,
  createPerformanceDashboard,
  calculateStats,
  generatePerformanceReport,
  generateJSONReport,
  DEFAULT_THRESHOLDS,
  type PerformanceLogEntry,
  type SessionMetrics,
  type StepMetrics
} from "../performance-dashboard"

describe("PerformanceDashboard", () => {
  let dashboard: PerformanceDashboard

  beforeEach(() => {
    dashboard = createPerformanceDashboard(
      "corr-123",
      "session-456",
      "workspace-789",
      {},
      false // Don't log to console during tests
    )
  })

  describe("initialization", () => {
    it("should create dashboard with default thresholds", () => {
      expect(dashboard).toBeDefined()
      expect(dashboard.getLogs()).toHaveLength(0)
    })

    it("should allow custom thresholds", () => {
      const customDashboard = createPerformanceDashboard(
        "corr",
        "sess",
        "ws",
        { maxStepLatencyMs: 5000 },
        false
      )
      expect(customDashboard).toBeDefined()
    })
  })

  describe("logging", () => {
    it("should log session start", () => {
      dashboard.logSessionStart({ userId: "user-1" })

      const logs = dashboard.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].eventType).toBe("session_start")
      expect(logs[0].level).toBe("info")
      expect(logs[0].correlationId).toBe("corr-123")
      expect(logs[0].sessionId).toBe("session-456")
      expect(logs[0].workspaceId).toBe("workspace-789")
      expect(logs[0].data.userId).toBe("user-1")
    })

    it("should log step start", () => {
      dashboard.logStepStart(1, "extractClientInfo")

      const logs = dashboard.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].eventType).toBe("step_start")
      expect(logs[0].data.stepNumber).toBe(1)
      expect(logs[0].data.stepName).toBe("extractClientInfo")
      expect(logs[0].tags).toContain("step-1")
    })

    it("should log step end", () => {
      const stepMetrics: StepMetrics = {
        stepNumber: 1,
        stepName: "extractClientInfo",
        latency: {
          durationMs: 500,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        },
        llmCalls: [],
        totalTokens: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150
        },
        totalCost: {
          inputCost: 0.001,
          outputCost: 0.002,
          totalCost: 0.003,
          currency: "USD"
        },
        success: true
      }

      dashboard.logStepEnd(stepMetrics)

      const logs = dashboard.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].eventType).toBe("step_end")
      expect(logs[0].level).toBe("info")
      expect(logs[0].data.success).toBe(true)
      expect(logs[0].data.latencyMs).toBe(500)
    })

    it("should log step failure with error", () => {
      const stepMetrics: StepMetrics = {
        stepNumber: 2,
        stepName: "searchHealthPlans",
        latency: { durationMs: 1000, startTime: "", endTime: "" },
        llmCalls: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: "USD"
        },
        success: false,
        error: "Vector search failed"
      }

      dashboard.logStepEnd(stepMetrics)

      const logs = dashboard.getLogs()
      expect(logs[0].level).toBe("error")
      expect(logs[0].data.success).toBe(false)
      expect(logs[0].data.error).toBe("Vector search failed")
    })

    it("should log LLM call", () => {
      dashboard.logLLMCall("extract-info", "gpt-4o", 250, 500, 200, true)

      const logs = dashboard.getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].eventType).toBe("llm_call")
      expect(logs[0].data.callName).toBe("extract-info")
      expect(logs[0].data.model).toBe("gpt-4o")
      expect(logs[0].data.latencyMs).toBe(250)
      expect(logs[0].data.promptTokens).toBe(500)
      expect(logs[0].data.completionTokens).toBe(200)
      expect(logs[0].tags).toContain("llm")
      expect(logs[0].tags).toContain("gpt-4o")
    })

    it("should log LLM call failure", () => {
      dashboard.logLLMCall(
        "analyze-plan",
        "gpt-4o",
        5000,
        1000,
        0,
        false,
        "Rate limit exceeded"
      )

      const logs = dashboard.getLogs()
      expect(logs[0].level).toBe("error")
      expect(logs[0].data.success).toBe(false)
      expect(logs[0].data.error).toBe("Rate limit exceeded")
    })
  })

  describe("threshold monitoring", () => {
    it("should log warning when step latency exceeds threshold", () => {
      const dashboardWithLowThreshold = createPerformanceDashboard(
        "corr",
        "sess",
        "ws",
        { maxStepLatencyMs: 100 },
        false
      )

      const stepMetrics: StepMetrics = {
        stepNumber: 1,
        stepName: "extractClientInfo",
        latency: { durationMs: 500, startTime: "", endTime: "" },
        llmCalls: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: "USD"
        },
        success: true
      }

      dashboardWithLowThreshold.logStepEnd(stepMetrics)

      const logs = dashboardWithLowThreshold.getLogs()
      const warningLog = logs.find(
        l => l.eventType === "metric_threshold_exceeded"
      )
      expect(warningLog).toBeDefined()
      expect(warningLog?.level).toBe("warn")
      expect(warningLog?.data.metric).toBe("step_latency_ms")
      expect(warningLog?.data.value).toBe(500)
      expect(warningLog?.data.threshold).toBe(100)
    })

    it("should log warning when LLM call latency exceeds threshold", () => {
      const dashboardWithLowThreshold = createPerformanceDashboard(
        "corr",
        "sess",
        "ws",
        { maxLLMCallLatencyMs: 100 },
        false
      )

      dashboardWithLowThreshold.logLLMCall(
        "test-call",
        "gpt-4o",
        500,
        100,
        50,
        true
      )

      const logs = dashboardWithLowThreshold.getLogs()
      const warningLog = logs.find(
        l => l.eventType === "metric_threshold_exceeded"
      )
      expect(warningLog).toBeDefined()
      expect(warningLog?.data.metric).toBe("llm_call_latency_ms")
    })

    it("should log warning when session cost exceeds threshold", () => {
      const dashboardWithLowThreshold = createPerformanceDashboard(
        "corr",
        "sess",
        "ws",
        { maxSessionCostUSD: 0.01 },
        false
      )

      const metrics: SessionMetrics = {
        sessionId: "sess",
        correlationId: "corr",
        workspaceId: "ws",
        startTime: new Date().toISOString(),
        totalLatencyMs: 1000,
        steps: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0.02,
          outputCost: 0.03,
          totalCost: 0.05,
          currency: "USD"
        },
        business: { plansFound: 0, plansAnalyzed: 0, clientCompleteness: 0 },
        success: true
      }

      dashboardWithLowThreshold.logSessionEnd(metrics)

      const logs = dashboardWithLowThreshold.getLogs()
      const warningLog = logs.find(
        l =>
          l.eventType === "metric_threshold_exceeded" &&
          l.data.metric === "session_cost_usd"
      )
      expect(warningLog).toBeDefined()
    })
  })

  describe("filtering", () => {
    beforeEach(() => {
      dashboard.logSessionStart()
      dashboard.logStepStart(1, "step1")

      // Log a step with an error
      const failedStep: StepMetrics = {
        stepNumber: 1,
        stepName: "step1",
        latency: { durationMs: 100, startTime: "", endTime: "" },
        llmCalls: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: "USD"
        },
        success: false,
        error: "Test error"
      }
      dashboard.logStepEnd(failedStep)
    })

    it("should filter logs by level", () => {
      const errorLogs = dashboard.getLogsByLevel("error")
      expect(errorLogs).toHaveLength(1)
      expect(errorLogs[0].data.error).toBe("Test error")

      const infoLogs = dashboard.getLogsByLevel("info")
      expect(infoLogs).toHaveLength(1)
      expect(infoLogs[0].eventType).toBe("session_start")
    })

    it("should filter logs by event type", () => {
      const stepEndLogs = dashboard.getLogsByEventType("step_end")
      expect(stepEndLogs).toHaveLength(1)
      expect(stepEndLogs[0].data.stepNumber).toBe(1)
    })
  })

  describe("summary generation", () => {
    it("should generate summary with empty data", () => {
      const summary = dashboard.generateSummary()

      expect(summary.stepLatencyStats.count).toBe(0)
      expect(summary.llmCallLatencyStats.count).toBe(0)
      expect(summary.totalLogCount).toBe(0)
      expect(summary.warningCount).toBe(0)
      expect(summary.errorCount).toBe(0)
    })

    it("should generate summary with data", () => {
      // Add some step data
      const step1: StepMetrics = {
        stepNumber: 1,
        stepName: "step1",
        latency: { durationMs: 100, startTime: "", endTime: "" },
        llmCalls: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: "USD"
        },
        success: true
      }

      const step2: StepMetrics = {
        stepNumber: 2,
        stepName: "step2",
        latency: { durationMs: 200, startTime: "", endTime: "" },
        llmCalls: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: "USD"
        },
        success: true
      }

      dashboard.logStepEnd(step1)
      dashboard.logStepEnd(step2)
      dashboard.logLLMCall("call1", "gpt-4o", 50, 100, 50, true)
      dashboard.logLLMCall("call2", "gpt-4o", 75, 200, 100, true)

      const summary = dashboard.generateSummary()

      expect(summary.stepLatencyStats.count).toBe(2)
      expect(summary.stepLatencyStats.avg).toBe(150)
      expect(summary.stepLatencyStats.min).toBe(100)
      expect(summary.stepLatencyStats.max).toBe(200)

      expect(summary.llmCallLatencyStats.count).toBe(2)
      expect(summary.llmCallLatencyStats.avg).toBe(62.5)
    })
  })

  describe("clearLogs", () => {
    it("should clear all logs", () => {
      dashboard.logSessionStart()
      dashboard.logStepStart(1, "step1")

      expect(dashboard.getLogs().length).toBeGreaterThan(0)

      dashboard.clearLogs()

      expect(dashboard.getLogs()).toHaveLength(0)
    })
  })
})

describe("calculateStats", () => {
  it("should handle empty array", () => {
    const stats = calculateStats([])

    expect(stats.count).toBe(0)
    expect(stats.min).toBe(0)
    expect(stats.max).toBe(0)
    expect(stats.sum).toBe(0)
    expect(stats.avg).toBe(0)
  })

  it("should calculate stats for single value", () => {
    const stats = calculateStats([100])

    expect(stats.count).toBe(1)
    expect(stats.min).toBe(100)
    expect(stats.max).toBe(100)
    expect(stats.sum).toBe(100)
    expect(stats.avg).toBe(100)
    expect(stats.p50).toBe(100)
    expect(stats.p95).toBe(100)
    expect(stats.p99).toBe(100)
  })

  it("should calculate stats for multiple values", () => {
    const stats = calculateStats([10, 20, 30, 40, 50])

    expect(stats.count).toBe(5)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(50)
    expect(stats.sum).toBe(150)
    expect(stats.avg).toBe(30)
    expect(stats.p50).toBe(30)
  })

  it("should calculate percentiles correctly", () => {
    // Create array 1-100
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    const stats = calculateStats(values)

    expect(stats.p50).toBeCloseTo(50.5, 1)
    expect(stats.p95).toBeCloseTo(95.05, 1)
    expect(stats.p99).toBeCloseTo(99.01, 1)
  })

  it("should handle unsorted input", () => {
    const stats = calculateStats([50, 10, 30, 40, 20])

    expect(stats.min).toBe(10)
    expect(stats.max).toBe(50)
    expect(stats.avg).toBe(30)
  })
})

describe("DEFAULT_THRESHOLDS", () => {
  it("should have reasonable default values", () => {
    expect(DEFAULT_THRESHOLDS.maxStepLatencyMs).toBe(30000)
    expect(DEFAULT_THRESHOLDS.maxLLMCallLatencyMs).toBe(15000)
    expect(DEFAULT_THRESHOLDS.maxSessionLatencyMs).toBe(120000)
    expect(DEFAULT_THRESHOLDS.maxSessionCostUSD).toBe(0.5)
    expect(DEFAULT_THRESHOLDS.maxSessionTokens).toBe(50000)
  })
})

describe("Report Generation", () => {
  const sampleMetrics: SessionMetrics = {
    sessionId: "test-session",
    correlationId: "test-corr",
    workspaceId: "test-ws",
    userId: "test-user",
    startTime: "2024-01-01T00:00:00.000Z",
    endTime: "2024-01-01T00:00:10.000Z",
    totalLatencyMs: 10000,
    steps: [
      {
        stepNumber: 1,
        stepName: "extractClientInfo",
        latency: { durationMs: 2000, startTime: "", endTime: "" },
        llmCalls: [
          {
            callId: "c1",
            callName: "extract",
            model: "gpt-4o",
            latency: { durationMs: 500, startTime: "", endTime: "" },
            tokens: {
              promptTokens: 500,
              completionTokens: 200,
              totalTokens: 700
            },
            cost: {
              inputCost: 0.001,
              outputCost: 0.002,
              totalCost: 0.003,
              currency: "USD"
            },
            success: true
          }
        ],
        totalTokens: {
          promptTokens: 500,
          completionTokens: 200,
          totalTokens: 700
        },
        totalCost: {
          inputCost: 0.001,
          outputCost: 0.002,
          totalCost: 0.003,
          currency: "USD"
        },
        success: true
      },
      {
        stepNumber: 2,
        stepName: "searchHealthPlans",
        latency: { durationMs: 3000, startTime: "", endTime: "" },
        llmCalls: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: "USD"
        },
        success: true
      }
    ],
    totalTokens: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    totalCost: {
      inputCost: 0.001,
      outputCost: 0.002,
      totalCost: 0.003,
      currency: "USD"
    },
    business: {
      plansFound: 5,
      plansAnalyzed: 3,
      clientCompleteness: 85,
      topPlanScore: 92
    },
    success: true
  }

  describe("generatePerformanceReport", () => {
    it("should generate human-readable report", () => {
      const dashboard = createPerformanceDashboard(
        "test-corr",
        "test-session",
        "test-ws",
        {},
        false
      )

      // Simulate logging some steps
      for (const step of sampleMetrics.steps) {
        dashboard.logStepEnd(step)
      }

      const report = generatePerformanceReport(sampleMetrics, dashboard)

      expect(report).toContain("PERFORMANCE REPORT")
      expect(report).toContain("test-session")
      expect(report).toContain("test-corr")
      expect(report).toContain("SUCCESS")
      expect(report).toContain("extractClientInfo")
      expect(report).toContain("searchHealthPlans")
      expect(report).toContain("Plans Found")
      expect(report).toContain("85%")
    })

    it("should include error in failed report", () => {
      const failedMetrics: SessionMetrics = {
        ...sampleMetrics,
        success: false,
        error: "Timeout occurred"
      }

      const dashboard = createPerformanceDashboard(
        "test-corr",
        "test-session",
        "test-ws",
        {},
        false
      )

      const report = generatePerformanceReport(failedMetrics, dashboard)

      expect(report).toContain("FAILED")
      expect(report).toContain("Timeout occurred")
    })
  })

  describe("generateJSONReport", () => {
    it("should generate JSON report structure", () => {
      const dashboard = createPerformanceDashboard(
        "test-corr",
        "test-session",
        "test-ws",
        {},
        false
      )

      const report = generateJSONReport(sampleMetrics, dashboard) as any

      expect(report.reportGeneratedAt).toBeDefined()
      expect(report.session.id).toBe("test-session")
      expect(report.session.correlationId).toBe("test-corr")
      expect(report.session.success).toBe(true)
      expect(report.timing.totalLatencyMs).toBe(10000)
      expect(report.tokens.totalTokens).toBe(700)
      expect(report.cost.totalCost).toBe(0.003)
      expect(report.business.plansFound).toBe(5)
      expect(report.steps).toHaveLength(2)
      expect(report.statistics).toBeDefined()
      expect(report.alerts).toBeDefined()
    })

    it("should include step details", () => {
      const dashboard = createPerformanceDashboard(
        "test-corr",
        "test-session",
        "test-ws",
        {},
        false
      )

      const report = generateJSONReport(sampleMetrics, dashboard) as any

      expect(report.steps[0].number).toBe(1)
      expect(report.steps[0].name).toBe("extractClientInfo")
      expect(report.steps[0].latencyMs).toBe(2000)
      expect(report.steps[0].llmCalls).toBe(1)
    })
  })
})
