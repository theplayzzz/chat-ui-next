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

  constructor(
    workspaceId: string,
    userId: string,
    sessionId?: string,
    traceId?: string,
    chatId?: string
  ) {
    this.workspaceId = workspaceId
    this.userId = userId
    this.sessionId = sessionId

    // Initialize LangSmith tracer if API key is available
    if (process.env.LANGSMITH_API_KEY) {
      try {
        this.langSmithTracer = new LangSmithTracer(
          workspaceId,
          userId,
          traceId,
          chatId
        )
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
   * Gets the LangSmith trace ID (chat-level, if available)
   */
  getLangSmithTraceId(): string | undefined {
    return this.langSmithTracer?.getTraceId()
  }

  /**
   * Gets the LangSmith run ID (interaction-level, if available)
   */
  getLangSmithRunId(): string | undefined {
    return this.langSmithTracer?.getRunId()
  }

  /**
   * Returns whether this is a new trace (new chat)
   */
  isNewTrace(): boolean {
    return this.langSmithTracer?.isNewTraceCreated() ?? true
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
 *
 * Hierarchy:
 * - Trace (per chat) - stored in chats.langsmith_trace_id
 *   - Run (per interaction window) - created each time user sends a message
 *     - Step 1, Step 2, ... (workflow steps)
 */
export class LangSmithTracer {
  private client: LangSmithClient | null = null
  private traceId: string // Chat-level trace (parent of all runs)
  private runId: string // Current interaction run (child of trace)
  private workspaceId: string
  private userId: string
  private sessionId?: string
  private chatId?: string
  private startTime?: number
  private stepRunIds: Map<number, string> = new Map()
  private isNewTrace: boolean = true

  constructor(
    workspaceId: string,
    userId: string,
    traceId?: string,
    chatId?: string
  ) {
    this.workspaceId = workspaceId
    this.userId = userId
    this.chatId = chatId

    // Use existing trace ID if provided (same chat), otherwise create new
    if (traceId) {
      this.traceId = traceId
      this.isNewTrace = false
    } else {
      this.traceId = crypto.randomUUID()
      this.isNewTrace = true
    }

    // Always create a new run ID for each interaction window
    this.runId = crypto.randomUUID()

    const apiKey = process.env.LANGSMITH_API_KEY
    const project = process.env.LANGSMITH_PROJECT || "health-plan-agent"

    console.log("[langsmith-tracer] Initializing with:", {
      hasApiKey: !!apiKey,
      project,
      traceId: this.traceId,
      runId: this.runId,
      isNewTrace: this.isNewTrace,
      chatId: this.chatId
    })

    if (apiKey) {
      try {
        this.client = new LangSmithClient({ apiKey })
        console.log("[langsmith-tracer] Client initialized successfully")
      } catch (error) {
        console.error("[langsmith-tracer] Failed to initialize client:", error)
        this.client = null
      }
    } else {
      console.warn(
        "[langsmith-tracer] No LANGSMITH_API_KEY found in environment"
      )
    }
  }

  /**
   * Returns whether this is a new trace (new chat)
   */
  isNewTraceCreated(): boolean {
    return this.isNewTrace
  }

  /**
   * Sets session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId
  }

  /**
   * Gets the trace ID (chat-level, parent of runs)
   */
  getTraceId(): string {
    return this.traceId
  }

  /**
   * Gets the run ID (interaction-level, parent of steps)
   */
  getRunId(): string {
    return this.runId
  }

  /**
   * Starts a new run under the trace
   * Always creates a new run for each interaction window
   */
  async startRun(): Promise<void> {
    if (!this.client) {
      console.warn(
        "[langsmith-tracer] Cannot start run - client not initialized"
      )
      return
    }

    this.startTime = Date.now()
    const projectName = process.env.LANGSMITH_PROJECT || "health-plan-agent"

    // First, create the trace if it's new
    if (this.isNewTrace) {
      console.log("[langsmith-tracer] Creating NEW trace for chat:", {
        traceId: this.traceId,
        chatId: this.chatId,
        project: projectName
      })

      try {
        await this.client.createRun({
          id: this.traceId,
          name: "health-plan-chat",
          run_type: "chain",
          project_name: projectName,
          inputs: {
            chatId: this.chatId,
            workspaceId: this.workspaceId,
            startedAt: new Date().toISOString()
          },
          extra: {
            metadata: {
              userId: this.userId,
              chatId: this.chatId,
              type: "chat-trace",
              version: "1.0.0"
            }
          }
        })
        console.log(
          "[langsmith-tracer] Trace created successfully:",
          this.traceId
        )
      } catch (error) {
        console.error("[langsmith-tracer] Failed to create trace:", error)
      }
    }

    // Always create a new run as child of the trace
    console.log("[langsmith-tracer] Creating NEW run under trace:", {
      runId: this.runId,
      traceId: this.traceId,
      project: projectName,
      workspaceId: this.workspaceId
    })

    try {
      await this.client.createRun({
        id: this.runId,
        parent_run_id: this.traceId, // Run is child of trace
        name: "health-plan-interaction",
        run_type: "chain",
        project_name: projectName,
        inputs: {
          workspaceId: this.workspaceId,
          sessionId: this.sessionId,
          interactionStartedAt: new Date().toISOString()
        },
        extra: {
          metadata: {
            userId: this.userId,
            chatId: this.chatId,
            traceId: this.traceId,
            type: "interaction-run",
            version: "1.0.0"
          }
        }
      })
      console.log("[langsmith-tracer] Run created successfully:", this.runId)
    } catch (error) {
      console.error("[langsmith-tracer] Failed to create run:", error)
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

    const projectName = process.env.LANGSMITH_PROJECT || "health-plan-agent"

    try {
      if (status === "start") {
        // Generate a proper UUID for child run
        const stepRunId = crypto.randomUUID()
        this.stepRunIds.set(step, stepRunId)

        console.log(`[langsmith-tracer] Creating step ${step} run:`, stepRunId)

        // Ensure inputs is never undefined/null - LangSmith shows "No data" for undefined
        const maskedData = maskSensitiveData(data)
        const inputs =
          maskedData && Object.keys(maskedData).length > 0
            ? maskedData
            : { _empty: true, _reason: "No input data provided" }

        await this.client.createRun({
          id: stepRunId,
          parent_run_id: this.runId,
          name: stepName,
          run_type: "tool",
          project_name: projectName,
          inputs
        })
      } else {
        const stepRunId = this.stepRunIds.get(step)
        if (!stepRunId) {
          console.warn(`[langsmith-tracer] No run ID found for step ${step}`)
          return
        }

        console.log(`[langsmith-tracer] Ending step ${step} run:`, stepRunId)

        await this.client.updateRun(stepRunId, {
          outputs:
            status === "error" ? { error: data } : maskSensitiveData(data),
          end_time: new Date().toISOString(),
          error: status === "error" ? data?.error : undefined,
          extra: durationMs ? { runtime_ms: durationMs } : undefined
        })
      }
    } catch (error) {
      console.error("[langsmith-tracer] Failed to log step:", error)
    }
  }

  /**
   * Ends the current run (interaction)
   * Each interaction creates a new run, so we always end it
   * The trace (chat-level) is NOT ended - it stays open for future interactions
   */
  async endRun(
    success: boolean,
    durationMs: number,
    error?: unknown
  ): Promise<void> {
    if (!this.client) return

    try {
      // End the run (interaction level)
      await this.client.updateRun(this.runId, {
        outputs: success
          ? { success: true, durationMs, completedSteps: this.stepRunIds.size }
          : { success: false, error: error ? String(error) : undefined },
        end_time: new Date().toISOString(),
        error: error ? String(error) : undefined,
        extra: {
          runtime_ms: durationMs,
          sessionId: this.sessionId,
          chatId: this.chatId
        }
      })
      console.log("[langsmith-tracer] Run ended successfully:", this.runId)

      // Note: We do NOT end the trace here - it stays open for future interactions
      // The trace represents the entire chat conversation
    } catch (err: any) {
      // Handle 409 conflict gracefully - run was already ended
      if (err?.status === 409) {
        console.log(
          "[langsmith-tracer] Run already ended (409 conflict), ignoring"
        )
      } else {
        console.warn("[langsmith-tracer] Failed to end run:", err)
      }
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a new logger instance
 *
 * @param workspaceId - Workspace ID
 * @param userId - User ID
 * @param sessionId - Session ID (optional)
 * @param traceId - LangSmith trace ID for the chat (optional, creates new if not provided)
 * @param chatId - Chat ID for grouping traces (optional)
 */
export function createLogger(
  workspaceId: string,
  userId: string,
  sessionId?: string,
  traceId?: string,
  chatId?: string
): HealthPlanLogger {
  return new HealthPlanLogger(workspaceId, userId, sessionId, traceId, chatId)
}

/**
 * Creates a no-op logger for testing
 */
export function createNoopLogger(): HealthPlanLogger {
  return new HealthPlanLogger("test-workspace", "test-user")
}
