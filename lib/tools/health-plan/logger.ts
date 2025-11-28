/**
 * Health Plan Logger
 *
 * Provides structured logging and LangSmith tracing for the
 * health plan recommendation workflow.
 *
 * Features:
 * - Structured JSON logs for debugging
 * - Sensitive data masking
 * - LangSmith integration for tracing
 * - Performance metrics
 *
 * Referência: PRD RF-008, Task #10.5
 */

import { Client as LangSmithClient } from "langsmith"
import type { WorkflowStep } from "./session-manager"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Log levels
 */
export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG"

/**
 * Log action types
 */
export type LogAction =
  | "workflow_start"
  | "workflow_end"
  | "step_start"
  | "step_end"
  | "step_error"
  | "step_retry"
  | "session_created"
  | "session_updated"
  | "session_completed"

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  workspaceId: string
  userId: string
  sessionId?: string
  step?: number
  stepName?: string
  action: LogAction
  durationMs?: number
  metadata?: Record<string, any>
  error?: {
    message: string
    type?: string
    stack?: string
  }
}

/**
 * Step names for logging
 */
const STEP_NAMES: Record<WorkflowStep, string> = {
  1: "extractClientInfo",
  2: "searchHealthPlans",
  3: "analyzeCompatibility",
  4: "fetchERPPrices",
  5: "generateRecommendation"
}

// =============================================================================
// SENSITIVE DATA MASKING
// =============================================================================

/**
 * Fields that should be masked in logs
 */
const SENSITIVE_FIELDS = [
  "cpf",
  "rg",
  "telefone",
  "phone",
  "email",
  "endereco",
  "address",
  "api_key",
  "apiKey",
  "password",
  "token",
  "secret",
  "credit_card",
  "cartao"
]

/**
 * Masks sensitive data in an object
 *
 * @param data - The data to mask
 * @param depth - Current recursion depth (max 10)
 * @returns Masked copy of the data
 */
export function maskSensitiveData(data: any, depth: number = 0): any {
  if (depth > 10) return data // Prevent infinite recursion

  if (data === null || data === undefined) {
    return data
  }

  if (typeof data === "string") {
    // Mask CPF patterns (xxx.xxx.xxx-xx)
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(data)) {
      return "***CPF***"
    }
    // Mask email patterns
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) {
      return "***EMAIL***"
    }
    // Mask phone patterns
    if (/^(\+\d{1,3})?\s?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}$/.test(data)) {
      return "***PHONE***"
    }
    return data
  }

  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item, depth + 1))
  }

  if (typeof data === "object") {
    const masked: Record<string, any> = {}

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase()

      // Check if this is a sensitive field (case-insensitive)
      if (
        SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))
      ) {
        masked[key] = "***MASKED***"
      } else {
        masked[key] = maskSensitiveData(value, depth + 1)
      }
    }

    return masked
  }

  return data
}

// =============================================================================
// LOGGER CLASS
// =============================================================================

/**
 * Health Plan Logger
 *
 * Provides structured logging with sensitive data masking
 */
export class HealthPlanLogger {
  private workspaceId: string
  private userId: string
  private sessionId?: string
  private langSmithTracer?: LangSmithTracer

  constructor(workspaceId: string, userId: string, sessionId?: string) {
    this.workspaceId = workspaceId
    this.userId = userId
    this.sessionId = sessionId

    // Initialize LangSmith tracer if API key is available
    if (process.env.LANGSMITH_API_KEY) {
      try {
        this.langSmithTracer = new LangSmithTracer(workspaceId, userId)
      } catch (error) {
        console.warn("[logger] Failed to initialize LangSmith tracer:", error)
      }
    }
  }

  /**
   * Sets the session ID (called after session is created)
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId
    this.langSmithTracer?.setSessionId(sessionId)
  }

  /**
   * Gets the LangSmith run ID (if available)
   */
  getLangSmithRunId(): string | undefined {
    return this.langSmithTracer?.getRunId()
  }

  /**
   * Logs workflow start
   */
  logWorkflowStart(): void {
    this.log("INFO", "workflow_start", {
      message: "Health plan recommendation workflow started"
    })

    this.langSmithTracer?.startRun()
  }

  /**
   * Logs workflow end
   */
  logWorkflowEnd(success: boolean, durationMs: number, error?: unknown): void {
    if (success) {
      this.log("INFO", "workflow_end", {
        success: true,
        durationMs,
        message: "Workflow completed successfully"
      })
    } else {
      this.log("ERROR", "workflow_end", {
        success: false,
        durationMs,
        error: this.formatError(error)
      })
    }

    this.langSmithTracer?.endRun(success, durationMs, error)
  }

  /**
   * Logs step start
   */
  logStepStart(step: WorkflowStep, inputs?: any): void {
    const maskedInputs = inputs ? maskSensitiveData(inputs) : undefined

    this.log("INFO", "step_start", {
      step,
      stepName: STEP_NAMES[step],
      inputs: maskedInputs
    })

    this.langSmithTracer?.logStep(step, STEP_NAMES[step], "start", maskedInputs)
  }

  /**
   * Logs step end
   */
  logStepEnd(step: WorkflowStep, outputs?: any, durationMs?: number): void {
    const maskedOutputs = outputs ? maskSensitiveData(outputs) : undefined

    this.log("INFO", "step_end", {
      step,
      stepName: STEP_NAMES[step],
      durationMs,
      outputSummary: this.summarizeOutput(maskedOutputs)
    })

    this.langSmithTracer?.logStep(
      step,
      STEP_NAMES[step],
      "end",
      maskedOutputs,
      durationMs
    )
  }

  /**
   * Logs step error
   */
  logStepError(step: WorkflowStep, error: Error, durationMs?: number): void {
    this.log("ERROR", "step_error", {
      step,
      stepName: STEP_NAMES[step],
      durationMs,
      error: this.formatError(error)
    })

    this.langSmithTracer?.logStep(
      step,
      STEP_NAMES[step],
      "error",
      { error: error.message },
      durationMs
    )
  }

  /**
   * Logs step retry
   */
  logStepRetry(step: WorkflowStep, attempt: number, reason: string): void {
    this.log("WARN", "step_retry", {
      step,
      stepName: STEP_NAMES[step],
      attempt,
      reason
    })
  }

  /**
   * Core logging function
   */
  private log(level: LogLevel, action: LogAction, metadata?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      workspaceId: this.workspaceId,
      userId: this.userId,
      sessionId: this.sessionId,
      action,
      ...metadata
    }

    // Format and output
    const prefix = `[health-plan-agent]`
    const json = JSON.stringify(entry)

    switch (level) {
      case "ERROR":
        console.error(prefix, json)
        break
      case "WARN":
        console.warn(prefix, json)
        break
      case "DEBUG":
        if (process.env.NODE_ENV === "development") {
          console.log(prefix, json)
        }
        break
      default:
        console.log(prefix, json)
    }
  }

  /**
   * Formats an error for logging
   */
  private formatError(error: unknown): {
    message: string
    type?: string
    stack?: string
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        type: error.name,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined
      }
    }
    return { message: String(error) }
  }

  /**
   * Summarizes output for logging (avoid huge payloads)
   */
  private summarizeOutput(output: any): any {
    if (!output) return undefined

    // For arrays, just show count
    if (Array.isArray(output)) {
      return { count: output.length, type: "array" }
    }

    // For objects with results array
    if (output.results && Array.isArray(output.results)) {
      return {
        resultsCount: output.results.length,
        ...Object.fromEntries(
          Object.entries(output)
            .filter(([k]) => k !== "results")
            .slice(0, 5)
        )
      }
    }

    // For objects with rankedPlans
    if (output.rankedPlans && Array.isArray(output.rankedPlans)) {
      return {
        plansCount: output.rankedPlans.length,
        topScore: output.rankedPlans[0]?.score?.overall
      }
    }

    // For recommendation result
    if (output.success !== undefined && output.markdown !== undefined) {
      return {
        success: output.success,
        markdownLength: output.markdown?.length || 0
      }
    }

    // Default: return first few keys
    if (typeof output === "object") {
      const keys = Object.keys(output).slice(0, 5)
      return { keys, keyCount: Object.keys(output).length }
    }

    return output
  }
}

// =============================================================================
// LANGSMITH TRACER
// =============================================================================

/**
 * LangSmith Tracer for observability
 */
export class LangSmithTracer {
  private client: LangSmithClient | null = null
  private runId: string
  private workspaceId: string
  private userId: string
  private sessionId?: string
  private startTime?: number

  constructor(workspaceId: string, userId: string) {
    this.workspaceId = workspaceId
    this.userId = userId
    this.runId = crypto.randomUUID()

    const apiKey = process.env.LANGSMITH_API_KEY
    if (apiKey) {
      try {
        this.client = new LangSmithClient({ apiKey })
      } catch (error) {
        console.warn("[langsmith-tracer] Failed to initialize client:", error)
        this.client = null
      }
    }
  }

  /**
   * Sets session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId
  }

  /**
   * Gets the run ID
   */
  getRunId(): string {
    return this.runId
  }

  /**
   * Starts a new run
   */
  async startRun(): Promise<void> {
    if (!this.client) return

    this.startTime = Date.now()

    try {
      await this.client.createRun({
        id: this.runId,
        name: "health-plan-recommendation",
        run_type: "chain",
        inputs: {
          workspaceId: this.workspaceId,
          sessionId: this.sessionId
        },
        extra: {
          metadata: {
            userId: this.userId,
            version: "1.0.0"
          }
        }
      })
    } catch (error) {
      console.warn("[langsmith-tracer] Failed to create run:", error)
    }
  }

  /**
   * Logs a step
   */
  async logStep(
    step: number,
    stepName: string,
    status: "start" | "end" | "error",
    data?: any,
    durationMs?: number
  ): Promise<void> {
    if (!this.client) return

    try {
      // Create a child run for this step
      const stepRunId = `${this.runId}-step-${step}`

      if (status === "start") {
        await this.client.createRun({
          id: stepRunId,
          parent_run_id: this.runId,
          name: stepName,
          run_type: "tool",
          inputs: maskSensitiveData(data)
        })
      } else {
        await this.client.updateRun(stepRunId, {
          outputs:
            status === "error" ? { error: data } : maskSensitiveData(data),
          end_time: new Date().toISOString(),
          error: status === "error" ? data?.error : undefined,
          extra: durationMs ? { runtime_ms: durationMs } : undefined
        })
      }
    } catch (error) {
      // Silently fail - don't break workflow for tracing errors
      console.warn("[langsmith-tracer] Failed to log step:", error)
    }
  }

  /**
   * Ends the run
   */
  async endRun(
    success: boolean,
    durationMs: number,
    error?: unknown
  ): Promise<void> {
    if (!this.client) return

    try {
      await this.client.updateRun(this.runId, {
        outputs: success ? { success: true, durationMs } : { success: false },
        end_time: new Date().toISOString(),
        error: error ? String(error) : undefined,
        extra: {
          runtime_ms: durationMs,
          sessionId: this.sessionId
        }
      })
    } catch (err) {
      console.warn("[langsmith-tracer] Failed to end run:", err)
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a new logger instance
 */
export function createLogger(
  workspaceId: string,
  userId: string,
  sessionId?: string
): HealthPlanLogger {
  return new HealthPlanLogger(workspaceId, userId, sessionId)
}

/**
 * Creates a no-op logger for testing
 */
export function createNoopLogger(): HealthPlanLogger {
  return new HealthPlanLogger("test-workspace", "test-user")
}
