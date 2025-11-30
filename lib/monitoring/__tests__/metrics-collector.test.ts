/**
 * Metrics Collector Tests
 *
 * Tests for granular metrics collection (latency, tokens, costs).
 *
 * Referência: Task #14.4
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  MetricsCollector,
  createMetricsCollector,
  calculateCost,
  getModelPricing,
  formatCost,
  formatLatency,
  formatTokens,
  formatMetricsSummary,
  MODEL_PRICING,
  type TokenUsage,
  type SessionMetrics
} from "../metrics-collector"

describe("Model Pricing", () => {
  describe("MODEL_PRICING", () => {
    it("should have pricing for common models", () => {
      expect(MODEL_PRICING["gpt-4o"]).toBeDefined()
      expect(MODEL_PRICING["gpt-4o-mini"]).toBeDefined()
      expect(MODEL_PRICING["gpt-3.5-turbo"]).toBeDefined()
      expect(MODEL_PRICING["text-embedding-3-small"]).toBeDefined()
    })

    it("should have valid pricing structure", () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.inputPer1M).toBeGreaterThanOrEqual(0)
        expect(pricing.outputPer1M).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe("getModelPricing", () => {
    it("should return exact model pricing", () => {
      const pricing = getModelPricing("gpt-4o")
      expect(pricing.inputPer1M).toBe(2.5)
      expect(pricing.outputPer1M).toBe(10.0)
    })

    it("should match versioned models", () => {
      const pricing = getModelPricing("gpt-4o-2024-11-20")
      expect(pricing.inputPer1M).toBe(2.5)
    })

    it("should return default for unknown models", () => {
      const pricing = getModelPricing("unknown-model-xyz")
      expect(pricing.inputPer1M).toBe(5.0)
      expect(pricing.outputPer1M).toBe(15.0)
    })
  })
})

describe("Cost Calculation", () => {
  describe("calculateCost", () => {
    it("should calculate cost for GPT-4o", () => {
      const tokens: TokenUsage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500
      }

      const cost = calculateCost(tokens, "gpt-4o")

      // Input: 1000 / 1M * $2.50 = $0.0025
      // Output: 500 / 1M * $10.00 = $0.005
      // Total: $0.0075
      expect(cost.inputCost).toBeCloseTo(0.0025, 6)
      expect(cost.outputCost).toBeCloseTo(0.005, 6)
      expect(cost.totalCost).toBeCloseTo(0.0075, 6)
      expect(cost.currency).toBe("USD")
    })

    it("should calculate cost for GPT-4o-mini", () => {
      const tokens: TokenUsage = {
        promptTokens: 10000,
        completionTokens: 5000,
        totalTokens: 15000
      }

      const cost = calculateCost(tokens, "gpt-4o-mini")

      // Input: 10000 / 1M * $0.15 = $0.0015
      // Output: 5000 / 1M * $0.60 = $0.003
      // Total: $0.0045
      expect(cost.inputCost).toBeCloseTo(0.0015, 6)
      expect(cost.outputCost).toBeCloseTo(0.003, 6)
      expect(cost.totalCost).toBeCloseTo(0.0045, 6)
    })

    it("should handle zero tokens", () => {
      const tokens: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }

      const cost = calculateCost(tokens, "gpt-4o")

      expect(cost.inputCost).toBe(0)
      expect(cost.outputCost).toBe(0)
      expect(cost.totalCost).toBe(0)
    })

    it("should handle embeddings (output only)", () => {
      const tokens: TokenUsage = {
        promptTokens: 5000,
        completionTokens: 0,
        totalTokens: 5000
      }

      const cost = calculateCost(tokens, "text-embedding-3-small")

      // Input: 5000 / 1M * $0.02 = $0.0001
      expect(cost.inputCost).toBeCloseTo(0.0001, 6)
      expect(cost.outputCost).toBe(0)
    })
  })
})

describe("MetricsCollector", () => {
  let collector: MetricsCollector

  beforeEach(() => {
    collector = createMetricsCollector(
      "session-123",
      "corr-456",
      "workspace-789",
      "user-abc"
    )
  })

  describe("initialization", () => {
    it("should initialize with correct IDs", () => {
      const summary = collector.getSummary()
      expect(summary.stepsCompleted).toBe(0)
      expect(summary.totalLLMCalls).toBe(0)
      expect(summary.totalTokens).toBe(0)
    })
  })

  describe("step tracking", () => {
    it("should track a single step", () => {
      collector.startStep(1, "extractClientInfo")
      collector.endStep(true)

      const step = collector.getStepMetrics(1)
      expect(step).toBeDefined()
      expect(step?.stepNumber).toBe(1)
      expect(step?.stepName).toBe("extractClientInfo")
      expect(step?.success).toBe(true)
      expect(step?.latency.durationMs).toBeGreaterThanOrEqual(0)
    })

    it("should track multiple steps", () => {
      collector.startStep(1, "extractClientInfo")
      collector.endStep(true)

      collector.startStep(2, "searchHealthPlans")
      collector.endStep(true)

      collector.startStep(3, "analyzeCompatibility")
      collector.endStep(false, "Test error")

      const summary = collector.getSummary()
      expect(summary.stepsCompleted).toBe(3)

      const step3 = collector.getStepMetrics(3)
      expect(step3?.success).toBe(false)
      expect(step3?.error).toBe("Test error")
    })
  })

  describe("LLM call tracking", () => {
    it("should record LLM calls within steps", () => {
      collector.startStep(1, "extractClientInfo")

      collector.recordLLMCall(
        "call-1",
        "extract-info",
        "gpt-4o",
        { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
        150,
        true
      )

      collector.endStep(true)

      const step = collector.getStepMetrics(1)
      expect(step?.llmCalls).toHaveLength(1)
      expect(step?.llmCalls[0].callName).toBe("extract-info")
      expect(step?.llmCalls[0].model).toBe("gpt-4o")
      expect(step?.llmCalls[0].tokens.totalTokens).toBe(700)
    })

    it("should aggregate tokens per step", () => {
      collector.startStep(3, "analyzeCompatibility")

      // Simulate multiple plan analyses
      collector.recordLLMCall(
        "call-1",
        "analyze-plan-1",
        "gpt-4o",
        { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
        100,
        true
      )

      collector.recordLLMCall(
        "call-2",
        "analyze-plan-2",
        "gpt-4o",
        { promptTokens: 1000, completionTokens: 350, totalTokens: 1350 },
        120,
        true
      )

      collector.recordLLMCall(
        "call-3",
        "analyze-plan-3",
        "gpt-4o",
        { promptTokens: 1000, completionTokens: 280, totalTokens: 1280 },
        90,
        true
      )

      collector.endStep(true)

      const step = collector.getStepMetrics(3)
      expect(step?.llmCalls).toHaveLength(3)
      expect(step?.totalTokens.promptTokens).toBe(3000)
      expect(step?.totalTokens.completionTokens).toBe(930)
      expect(step?.totalTokens.totalTokens).toBe(3930)
    })

    it("should aggregate costs per step", () => {
      collector.startStep(1, "extractClientInfo")

      collector.recordLLMCall(
        "call-1",
        "extraction",
        "gpt-4o",
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        200,
        true
      )

      collector.endStep(true)

      const step = collector.getStepMetrics(1)
      // Cost should be calculated automatically
      expect(step?.totalCost.totalCost).toBeGreaterThan(0)
    })
  })

  describe("business metrics", () => {
    it("should track business metrics", () => {
      collector.updateBusinessMetrics({ plansFound: 10 })
      collector.updateBusinessMetrics({ plansAnalyzed: 5 })
      collector.updateBusinessMetrics({
        clientCompleteness: 85,
        topPlanScore: 92
      })

      const business = collector.getBusinessMetrics()
      expect(business.plansFound).toBe(10)
      expect(business.plansAnalyzed).toBe(5)
      expect(business.clientCompleteness).toBe(85)
      expect(business.topPlanScore).toBe(92)
    })
  })

  describe("total calculations", () => {
    it("should calculate total tokens across steps", () => {
      collector.startStep(1, "step1")
      collector.recordLLMCall(
        "c1",
        "call1",
        "gpt-4o",
        { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
        100,
        true
      )
      collector.endStep(true)

      collector.startStep(2, "step2")
      collector.recordLLMCall(
        "c2",
        "call2",
        "gpt-4o",
        { promptTokens: 800, completionTokens: 300, totalTokens: 1100 },
        150,
        true
      )
      collector.endStep(true)

      const totalTokens = collector.getTotalTokens()
      expect(totalTokens.promptTokens).toBe(1300)
      expect(totalTokens.completionTokens).toBe(500)
      expect(totalTokens.totalTokens).toBe(1800)
    })

    it("should calculate total cost across steps", () => {
      collector.startStep(1, "step1")
      collector.recordLLMCall(
        "c1",
        "call1",
        "gpt-4o",
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        100,
        true
      )
      collector.endStep(true)

      collector.startStep(2, "step2")
      collector.recordLLMCall(
        "c2",
        "call2",
        "gpt-4o-mini",
        { promptTokens: 5000, completionTokens: 2000, totalTokens: 7000 },
        80,
        true
      )
      collector.endStep(true)

      const totalCost = collector.getTotalCost()
      expect(totalCost.totalCost).toBeGreaterThan(0)
      expect(totalCost.currency).toBe("USD")
    })
  })

  describe("finalize", () => {
    it("should return complete session metrics", () => {
      collector.startStep(1, "extractClientInfo")
      collector.recordLLMCall(
        "c1",
        "extraction",
        "gpt-4o",
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        200,
        true
      )
      collector.endStep(true)

      collector.updateBusinessMetrics({ clientCompleteness: 90 })

      const metrics = collector.finalize(true)

      expect(metrics.sessionId).toBe("session-123")
      expect(metrics.correlationId).toBe("corr-456")
      expect(metrics.workspaceId).toBe("workspace-789")
      expect(metrics.userId).toBe("user-abc")
      expect(metrics.startTime).toBeTruthy()
      expect(metrics.endTime).toBeTruthy()
      expect(metrics.totalLatencyMs).toBeGreaterThanOrEqual(0)
      expect(metrics.steps).toHaveLength(1)
      expect(metrics.totalTokens.totalTokens).toBe(1500)
      expect(metrics.totalCost.totalCost).toBeGreaterThan(0)
      expect(metrics.business.clientCompleteness).toBe(90)
      expect(metrics.success).toBe(true)
    })

    it("should include error on failure", () => {
      collector.startStep(1, "step1")
      collector.endStep(false, "Step failed")

      const metrics = collector.finalize(false, "Session failed")

      expect(metrics.success).toBe(false)
      expect(metrics.error).toBe("Session failed")
    })

    it("should sort steps by number", () => {
      // Add steps out of order
      collector.startStep(3, "step3")
      collector.endStep(true)

      collector.startStep(1, "step1")
      collector.endStep(true)

      collector.startStep(2, "step2")
      collector.endStep(true)

      const metrics = collector.finalize(true)

      expect(metrics.steps[0].stepNumber).toBe(1)
      expect(metrics.steps[1].stepNumber).toBe(2)
      expect(metrics.steps[2].stepNumber).toBe(3)
    })
  })

  describe("getSummary", () => {
    it("should return current summary", () => {
      collector.startStep(1, "step1")
      collector.recordLLMCall(
        "c1",
        "call1",
        "gpt-4o",
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        100,
        true
      )
      collector.endStep(true)

      const summary = collector.getSummary()

      expect(summary.stepsCompleted).toBe(1)
      expect(summary.totalLLMCalls).toBe(1)
      expect(summary.totalTokens).toBe(1500)
      expect(summary.totalCostUSD).toBeGreaterThan(0)
      expect(summary.totalLatencyMs).toBeGreaterThanOrEqual(0)
    })
  })
})

describe("Formatting Functions", () => {
  describe("formatCost", () => {
    it("should format very small costs", () => {
      expect(formatCost(0.000001)).toBe("$0.000001")
      expect(formatCost(0.00001)).toBe("$0.000010")
    })

    it("should format small costs", () => {
      expect(formatCost(0.0025)).toBe("$0.0025")
      expect(formatCost(0.005)).toBe("$0.0050")
    })

    it("should format normal costs", () => {
      expect(formatCost(0.05)).toBe("$0.05")
      expect(formatCost(1.25)).toBe("$1.25")
    })
  })

  describe("formatLatency", () => {
    it("should format milliseconds", () => {
      expect(formatLatency(50)).toBe("50ms")
      expect(formatLatency(500)).toBe("500ms")
      expect(formatLatency(999)).toBe("999ms")
    })

    it("should format seconds", () => {
      expect(formatLatency(1000)).toBe("1.0s")
      expect(formatLatency(1500)).toBe("1.5s")
      expect(formatLatency(30000)).toBe("30.0s")
    })

    it("should format minutes", () => {
      expect(formatLatency(60000)).toBe("1m 0s")
      expect(formatLatency(90000)).toBe("1m 30s")
      expect(formatLatency(150000)).toBe("2m 30s")
    })
  })

  describe("formatTokens", () => {
    it("should format small numbers", () => {
      expect(formatTokens(100)).toBe("100")
      expect(formatTokens(999)).toBe("999")
    })

    it("should format thousands", () => {
      expect(formatTokens(1000)).toBe("1.0K")
      expect(formatTokens(1500)).toBe("1.5K")
      expect(formatTokens(50000)).toBe("50.0K")
    })

    it("should format millions", () => {
      expect(formatTokens(1000000)).toBe("1.0M")
      expect(formatTokens(2500000)).toBe("2.5M")
    })
  })

  describe("formatMetricsSummary", () => {
    it("should create readable summary", () => {
      const metrics: SessionMetrics = {
        sessionId: "test-session",
        correlationId: "test-corr",
        workspaceId: "test-ws",
        startTime: "2024-01-01T00:00:00.000Z",
        endTime: "2024-01-01T00:00:10.000Z",
        totalLatencyMs: 10000,
        steps: [
          {
            stepNumber: 1,
            stepName: "extractClientInfo",
            latency: { durationMs: 5000, startTime: "", endTime: "" },
            llmCalls: [],
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
        business: {
          plansFound: 5,
          plansAnalyzed: 3,
          clientCompleteness: 85
        },
        success: true
      }

      const summary = formatMetricsSummary(metrics)

      expect(summary).toContain("Session: test-session")
      expect(summary).toContain("Correlation: test-corr")
      expect(summary).toContain("Duration: 10.0s")
      expect(summary).toContain("Steps: 1/5")
      expect(summary).toContain("Status: SUCCESS")
      expect(summary).toContain("Plans: 5 found, 3 analyzed")
      expect(summary).toContain("Client completeness: 85%")
    })

    it("should include error in failure summary", () => {
      const metrics: SessionMetrics = {
        sessionId: "test",
        correlationId: "test",
        workspaceId: "test",
        startTime: "2024-01-01T00:00:00.000Z",
        totalLatencyMs: 5000,
        steps: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: "USD"
        },
        business: { plansFound: 0, plansAnalyzed: 0, clientCompleteness: 0 },
        success: false,
        error: "Timeout occurred"
      }

      const summary = formatMetricsSummary(metrics)

      expect(summary).toContain("Status: FAILED - Timeout occurred")
    })
  })
})
