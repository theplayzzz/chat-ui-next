/**
 * Orchestrator Tracer
 *
 * Manages hierarchical span tracing for the health plan orchestrator workflow.
 * Creates parent-child relationships between session runs, step runs, and LLM calls.
 *
 * Hierarchy:
 * [Session Run - health-plan-recommendation]
 * ├── [Step 1 - extractClientInfo]
 * │   └── [LLM Call - extraction]
 * ├── [Step 2 - searchHealthPlans]
 * │   └── [Embedding Call]
 * ├── [Step 3 - analyzeCompatibility]
 * │   ├── [LLM Call - eligibility-plan-1]
 * │   └── ...
 * ├── [Step 4 - fetchERPPrices]
 * │   └── [HTTP Call - ERP API]
 * └── [Step 5 - generateRecommendation]
 *     ├── [LLM Call - intro]
 *     └── ...
 *
 * Referência: PRD RF-013, Task #14.3
 */

import {
  getLangSmithClient,
  generateRunId,
  generateChildRunId,
  LANGSMITH_CONFIG
} from "./langsmith-config"
import { generateCorrelationId } from "./correlation"
import { maskSensitiveData } from "../tools/health-plan/logger"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Workflow step names
 */
export type WorkflowStepName =
  | "extractClientInfo"
  | "searchHealthPlans"
  | "analyzeCompatibility"
  | "fetchERPPrices"
  | "generateRecommendation"

/**
 * Step number to name mapping
 */
export const STEP_NAMES: Record<number, WorkflowStepName> = {
  1: "extractClientInfo",
  2: "searchHealthPlans",
  3: "analyzeCompatibility",
  4: "fetchERPPrices",
  5: "generateRecommendation"
}

/**
 * Business context captured during workflow
 */
export interface WorkflowBusinessContext {
  /** Number of plans found in search */
  plansFound?: number
  /** Number of plans analyzed */
  plansAnalyzed?: number
  /** Client info completeness percentage */
  clientCompleteness?: number
  /** Missing required fields */
  missingFields?: string[]
  /** Top plan score */
  topPlanScore?: number
  /** Total cost estimated */
  totalCostEstimate?: number
  /** User preferences summary */
  preferences?: Record<string, any>
}

/**
 * Step execution result for tracing
 */
export interface StepTraceResult {
  stepNumber: number
  stepName: WorkflowStepName
  success: boolean
  durationMs: number
  runId: string
  outputs?: Record<string, any>
  error?: string
  businessContext?: Partial<WorkflowBusinessContext>
}

/**
 * Session trace summary
 */
export interface SessionTraceSummary {
  sessionRunId: string
  correlationId: string
  totalDurationMs: number
  stepsCompleted: number
  success: boolean
  businessContext: WorkflowBusinessContext
  stepResults: StepTraceResult[]
}

// =============================================================================
// ORCHESTRATOR TRACER CLASS
// =============================================================================

/**
 * Orchestrator Tracer
 *
 * Manages hierarchical tracing for the health plan workflow
 */
export class OrchestratorTracer {
  private sessionRunId: string
  private correlationId: string
  private workspaceId: string
  private userId: string
  private sessionId: string
  private startTime: number
  private stepResults: StepTraceResult[] = []
  private businessContext: WorkflowBusinessContext = {}
  private currentStepRunId: string | null = null

  constructor(
    workspaceId: string,
    userId: string,
    sessionId: string,
    correlationId?: string
  ) {
    this.workspaceId = workspaceId
    this.userId = userId
    this.sessionId = sessionId
    this.correlationId = correlationId || generateCorrelationId()
    this.sessionRunId = generateRunId() // Returns valid UUID for LangSmith
    this.startTime = Date.now()
  }

  /**
   * Gets the session run ID (parent for all steps)
   */
  getSessionRunId(): string {
    return this.sessionRunId
  }

  /**
   * Gets the correlation ID for this session
   */
  getCorrelationId(): string {
    return this.correlationId
  }

  /**
   * Gets the current step run ID (for child runs)
   */
  getCurrentStepRunId(): string | null {
    return this.currentStepRunId
  }

  /**
   * Starts the session trace
   *
   * @param metadata - Additional metadata for the session
   */
  async startSession(metadata?: Record<string, any>): Promise<void> {
    const client = getLangSmithClient()
    if (!client) return

    try {
      await client.createRun({
        id: this.sessionRunId,
        name: "health-plan-recommendation",
        run_type: "chain",
        inputs: {
          workspaceId: this.workspaceId,
          sessionId: this.sessionId,
          ...metadata
        },
        project_name: LANGSMITH_CONFIG.projectName,
        start_time: new Date().toISOString(),
        extra: {
          metadata: {
            correlationId: this.correlationId,
            userId: this.userId,
            version: LANGSMITH_CONFIG.traceVersion,
            workflowType: "health-plan-recommendation"
          },
          tags: ["health-plan", "orchestrator", "session"]
        }
      })
    } catch (error) {
      console.warn("[orchestrator-tracer] Failed to start session:", error)
    }
  }

  /**
   * Starts a step trace
   *
   * @param stepNumber - Step number (1-5)
   * @param inputs - Step inputs (will be masked)
   */
  async startStep(
    stepNumber: number,
    inputs?: Record<string, any>
  ): Promise<string> {
    const client = getLangSmithClient()
    const stepName = STEP_NAMES[stepNumber] || `step-${stepNumber}`
    const stepRunId = generateChildRunId(this.sessionRunId, stepName)

    this.currentStepRunId = stepRunId

    if (!client) return stepRunId

    // Ensure inputs is never empty - LangSmith shows "No data" for empty objects
    const maskedInputs = inputs ? maskSensitiveData(inputs) : {}
    const finalInputs =
      Object.keys(maskedInputs).length > 0
        ? maskedInputs
        : { _noInputs: true, stepNumber, stepName }

    try {
      await client.createRun({
        id: stepRunId,
        parent_run_id: this.sessionRunId,
        name: stepName,
        run_type: "tool",
        inputs: finalInputs,
        project_name: LANGSMITH_CONFIG.projectName,
        start_time: new Date().toISOString(),
        extra: {
          metadata: {
            correlationId: this.correlationId,
            stepNumber,
            stepName,
            version: LANGSMITH_CONFIG.traceVersion
          },
          tags: ["health-plan", `step-${stepNumber}`, stepName]
        }
      })
    } catch (error) {
      console.warn(
        `[orchestrator-tracer] Failed to start step ${stepNumber}:`,
        error
      )
    }

    return stepRunId
  }

  /**
   * Ends a step trace with results
   *
   * @param stepNumber - Step number (1-5)
   * @param success - Whether step succeeded
   * @param outputs - Step outputs (will be masked)
   * @param businessContext - Business context from this step
   * @param error - Error message if failed
   */
  async endStep(
    stepNumber: number,
    success: boolean,
    outputs?: Record<string, any>,
    businessContext?: Partial<WorkflowBusinessContext>,
    error?: string
  ): Promise<void> {
    const client = getLangSmithClient()
    const stepName = STEP_NAMES[stepNumber] || `step-${stepNumber}`
    const durationMs = Date.now() - this.startTime // Relative to session start

    // Store step result
    const stepResult: StepTraceResult = {
      stepNumber,
      stepName,
      success,
      durationMs,
      runId: this.currentStepRunId || "",
      outputs: outputs ? this.summarizeOutputs(outputs) : undefined,
      error,
      businessContext
    }
    this.stepResults.push(stepResult)

    // Update business context
    if (businessContext) {
      this.businessContext = { ...this.businessContext, ...businessContext }
    }

    // Store current step run ID before resetting
    const stepRunIdToUpdate = this.currentStepRunId

    // Always reset current step run ID
    this.currentStepRunId = null

    if (!client || !stepRunIdToUpdate) return

    const maskedOutputs = outputs
      ? maskSensitiveData(this.summarizeOutputs(outputs))
      : {}

    try {
      await client.updateRun(stepRunIdToUpdate, {
        outputs: error ? { error } : maskedOutputs,
        end_time: new Date().toISOString(),
        error: error,
        extra: {
          runtime_ms: durationMs,
          success,
          businessContext
        }
      })
    } catch (updateError) {
      console.warn(
        `[orchestrator-tracer] Failed to end step ${stepNumber}:`,
        updateError
      )
    }
  }

  /**
   * Ends the session trace with final results
   *
   * @param success - Whether session completed successfully
   * @param finalOutputs - Final outputs
   * @param error - Error message if failed
   */
  async endSession(
    success: boolean,
    finalOutputs?: Record<string, any>,
    error?: string
  ): Promise<SessionTraceSummary> {
    const client = getLangSmithClient()
    const totalDurationMs = Date.now() - this.startTime

    const summary: SessionTraceSummary = {
      sessionRunId: this.sessionRunId,
      correlationId: this.correlationId,
      totalDurationMs,
      stepsCompleted: this.stepResults.filter(r => r.success).length,
      success,
      businessContext: this.businessContext,
      stepResults: this.stepResults
    }

    if (!client) return summary

    const maskedOutputs = finalOutputs
      ? maskSensitiveData(this.summarizeOutputs(finalOutputs))
      : {}

    try {
      await client.updateRun(this.sessionRunId, {
        outputs: error
          ? { error, partialResults: maskedOutputs }
          : { success: true, ...maskedOutputs },
        end_time: new Date().toISOString(),
        error: error,
        extra: {
          runtime_ms: totalDurationMs,
          stepsCompleted: summary.stepsCompleted,
          businessContext: this.businessContext,
          correlationId: this.correlationId
        }
      })
    } catch (updateError) {
      console.warn("[orchestrator-tracer] Failed to end session:", updateError)
    }

    return summary
  }

  /**
   * Updates business context during workflow execution
   *
   * @param context - Partial business context to merge
   */
  updateBusinessContext(context: Partial<WorkflowBusinessContext>): void {
    this.businessContext = { ...this.businessContext, ...context }
  }

  /**
   * Creates a child run ID for LLM calls within current step
   *
   * @param callName - Name for the LLM call
   * @returns Child run ID
   */
  createLLMRunId(callName: string): string {
    const parentId = this.currentStepRunId || this.sessionRunId
    return generateChildRunId(parentId, callName)
  }

  /**
   * Gets tracing context for passing to tool calls
   */
  getTracingContext(): {
    correlationId: string
    parentRunId: string
    sessionRunId: string
    workspaceId: string
    userId: string
  } {
    return {
      correlationId: this.correlationId,
      parentRunId: this.currentStepRunId || this.sessionRunId,
      sessionRunId: this.sessionRunId,
      workspaceId: this.workspaceId,
      userId: this.userId
    }
  }

  /**
   * Summarizes outputs to avoid huge payloads
   */
  private summarizeOutputs(outputs: any): any {
    if (!outputs) return { empty: true }

    // For arrays
    if (Array.isArray(outputs)) {
      return {
        type: "array",
        count: outputs.length
      }
    }

    // For objects with specific patterns
    if (typeof outputs === "object") {
      // Ranked plans
      if ("rankedPlans" in outputs) {
        return {
          type: "ranked_analysis",
          plansCount: outputs.rankedPlans?.length || 0,
          topScore: outputs.rankedPlans?.[0]?.score?.overall,
          hasRecommended: !!outputs.recommended
        }
      }

      // Client info
      if ("clientInfo" in outputs) {
        return {
          type: "client_info",
          completeness: outputs.completeness,
          isComplete: outputs.isComplete,
          missingFieldsCount: outputs.missingFields?.length || 0
        }
      }

      // Recommendation
      if ("markdown" in outputs || "recommendation" in outputs) {
        return {
          type: "recommendation",
          success: outputs.success,
          markdownLength:
            (outputs.markdown || outputs.recommendation)?.length || 0
        }
      }

      // Search results
      if ("results" in outputs && Array.isArray(outputs.results)) {
        return {
          type: "search_results",
          count: outputs.results.length
        }
      }

      // ERP prices
      if ("prices" in outputs) {
        return {
          type: "erp_prices",
          pricesCount: outputs.prices?.length || 0,
          success: outputs.success
        }
      }

      // Generic object - just list keys
      const keys = Object.keys(outputs)
      return {
        type: "object",
        keys: keys.slice(0, 10),
        keyCount: keys.length
      }
    }

    return outputs
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a new orchestrator tracer
 *
 * @param workspaceId - Workspace ID
 * @param userId - User ID
 * @param sessionId - Session ID
 * @param correlationId - Optional correlation ID (generated if not provided)
 * @returns OrchestratorTracer instance
 */
export function createOrchestratorTracer(
  workspaceId: string,
  userId: string,
  sessionId: string,
  correlationId?: string
): OrchestratorTracer {
  return new OrchestratorTracer(workspaceId, userId, sessionId, correlationId)
}

// =============================================================================
// INTEGRATION HELPERS
// =============================================================================

/**
 * Step execution wrapper with automatic tracing
 *
 * @param tracer - Orchestrator tracer instance
 * @param stepNumber - Step number (1-5)
 * @param inputs - Step inputs
 * @param fn - Step execution function
 * @returns Step result
 */
export async function traceStep<T>(
  tracer: OrchestratorTracer,
  stepNumber: number,
  inputs: Record<string, any>,
  fn: () => Promise<T>
): Promise<T> {
  await tracer.startStep(stepNumber, inputs)

  const stepStartTime = Date.now()

  try {
    const result = await fn()
    const durationMs = Date.now() - stepStartTime

    // Extract business context from result
    const businessContext = extractBusinessContext(stepNumber, result)

    await tracer.endStep(
      stepNumber,
      true,
      result as Record<string, any>,
      businessContext
    )

    return result
  } catch (error) {
    const durationMs = Date.now() - stepStartTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    await tracer.endStep(stepNumber, false, undefined, undefined, errorMessage)

    throw error
  }
}

/**
 * Extracts business context from step result
 */
function extractBusinessContext(
  stepNumber: number,
  result: any
): Partial<WorkflowBusinessContext> | undefined {
  if (!result) return undefined

  switch (stepNumber) {
    case 1: // extractClientInfo
      return {
        clientCompleteness: result.completeness,
        missingFields: result.missingFields
      }

    case 2: // searchHealthPlans
      return {
        plansFound: Array.isArray(result)
          ? result.length
          : result?.results?.length || 0
      }

    case 3: // analyzeCompatibility
      return {
        plansAnalyzed: result.rankedPlans?.length || 0,
        topPlanScore: result.rankedPlans?.[0]?.score?.overall
      }

    case 4: // fetchERPPrices
      return {
        totalCostEstimate: result.prices?.[0]?.total
      }

    case 5: // generateRecommendation
      return {} // Final step, no additional context needed

    default:
      return undefined
  }
}
