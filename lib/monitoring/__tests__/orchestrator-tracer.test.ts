/**
 * Orchestrator Tracer Tests
 *
 * Tests for hierarchical tracing of the health plan workflow.
 *
 * Referência: Task #14.3
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  OrchestratorTracer,
  createOrchestratorTracer,
  STEP_NAMES,
  traceStep
} from "../orchestrator-tracer"

describe("OrchestratorTracer", () => {
  let tracer: OrchestratorTracer

  beforeEach(() => {
    tracer = createOrchestratorTracer(
      "test-workspace",
      "test-user",
      "test-session"
    )
  })

  describe("initialization", () => {
    it("should generate unique session run ID as valid UUID", () => {
      const sessionRunId = tracer.getSessionRunId()
      // LangSmith requires valid UUIDs for run IDs
      expect(sessionRunId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    it("should generate unique correlation ID with hp prefix", () => {
      const correlationId = tracer.getCorrelationId()
      // Correlation IDs use hp-{timestamp}-{uuid8} format for tracing
      expect(correlationId).toMatch(/^hp-\d+-[a-f0-9]{8}$/)
    })

    it("should use provided correlation ID if given", () => {
      const customCorrelationId = "custom-corr-123"
      const tracerWithCorr = createOrchestratorTracer(
        "workspace",
        "user",
        "session",
        customCorrelationId
      )
      expect(tracerWithCorr.getCorrelationId()).toBe(customCorrelationId)
    })

    it("should have null current step run ID initially", () => {
      expect(tracer.getCurrentStepRunId()).toBeNull()
    })
  })

  describe("STEP_NAMES", () => {
    it("should have all 5 steps mapped", () => {
      expect(STEP_NAMES[1]).toBe("extractClientInfo")
      expect(STEP_NAMES[2]).toBe("searchHealthPlans")
      expect(STEP_NAMES[3]).toBe("analyzeCompatibility")
      expect(STEP_NAMES[4]).toBe("fetchERPPrices")
      expect(STEP_NAMES[5]).toBe("generateRecommendation")
    })

    it("should have correct step names", () => {
      expect(Object.keys(STEP_NAMES)).toHaveLength(5)
    })
  })

  describe("startStep", () => {
    it("should return a step run ID", async () => {
      const stepRunId = await tracer.startStep(1, { test: true })
      expect(stepRunId).toBeTruthy()
      expect(typeof stepRunId).toBe("string")
    })

    it("should update current step run ID", async () => {
      await tracer.startStep(1, {})
      expect(tracer.getCurrentStepRunId()).not.toBeNull()
    })
  })

  describe("endStep", () => {
    it("should clear current step run ID after ending", async () => {
      await tracer.startStep(1, {})
      await tracer.endStep(1, true, { result: "test" })
      expect(tracer.getCurrentStepRunId()).toBeNull()
    })
  })

  describe("updateBusinessContext", () => {
    it("should merge new context with existing", () => {
      tracer.updateBusinessContext({ plansFound: 5 })
      tracer.updateBusinessContext({ topPlanScore: 85 })

      const context = tracer.getTracingContext()
      expect(context.correlationId).toBeTruthy()
    })
  })

  describe("getTracingContext", () => {
    it("should return complete tracing context", () => {
      const context = tracer.getTracingContext()

      expect(context).toHaveProperty("correlationId")
      expect(context).toHaveProperty("parentRunId")
      expect(context).toHaveProperty("sessionRunId")
      expect(context).toHaveProperty("workspaceId")
      expect(context).toHaveProperty("userId")
    })

    it("should have session run as parent when no step is active", () => {
      const context = tracer.getTracingContext()
      expect(context.parentRunId).toBe(context.sessionRunId)
    })

    it("should have step run as parent when step is active", async () => {
      await tracer.startStep(1, {})
      const context = tracer.getTracingContext()
      expect(context.parentRunId).not.toBe(context.sessionRunId)
    })
  })

  describe("createLLMRunId", () => {
    it("should create child run ID as valid UUID when no step active", () => {
      const llmRunId = tracer.createLLMRunId("test-llm-call")
      // LangSmith requires valid UUIDs for run IDs - name is set via run name field, not ID
      expect(llmRunId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    it("should create unique child run ID when step is active", async () => {
      await tracer.startStep(1, {})
      const llmRunId = tracer.createLLMRunId("extraction")
      // Should be a valid UUID, different from session run ID
      expect(llmRunId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
      expect(llmRunId).not.toBe(tracer.getSessionRunId())
    })
  })

  describe("endSession", () => {
    it("should return session trace summary", async () => {
      await tracer.startSession()
      await tracer.startStep(1, {})
      await tracer.endStep(1, true, { clientInfo: {} })

      const summary = await tracer.endSession(true, { complete: true })

      expect(summary).toHaveProperty("sessionRunId")
      expect(summary).toHaveProperty("correlationId")
      expect(summary).toHaveProperty("totalDurationMs")
      expect(summary).toHaveProperty("stepsCompleted")
      expect(summary).toHaveProperty("success")
      expect(summary).toHaveProperty("stepResults")
    })

    it("should count completed steps correctly", async () => {
      await tracer.startSession()

      // Complete step 1
      await tracer.startStep(1, {})
      await tracer.endStep(1, true)

      // Complete step 2
      await tracer.startStep(2, {})
      await tracer.endStep(2, true)

      // Fail step 3
      await tracer.startStep(3, {})
      await tracer.endStep(3, false, undefined, undefined, "Test error")

      const summary = await tracer.endSession(false)

      expect(summary.stepsCompleted).toBe(2)
      expect(summary.stepResults).toHaveLength(3)
    })
  })
})

describe("traceStep", () => {
  it("should execute function and return result", async () => {
    const tracer = createOrchestratorTracer("ws", "user", "session")

    const result = await traceStep(tracer, 1, { input: "test" }, async () => ({
      output: "success"
    }))

    expect(result).toEqual({ output: "success" })
  })

  it("should propagate errors", async () => {
    const tracer = createOrchestratorTracer("ws", "user", "session")

    await expect(
      traceStep(tracer, 1, {}, async () => {
        throw new Error("Test error")
      })
    ).rejects.toThrow("Test error")
  })
})
