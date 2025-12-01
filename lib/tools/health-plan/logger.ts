/**
 * Health Plan Logger
 *
 * Provides structured logging for the health plan recommendation workflow.
 *
 * Features:
 * - Structured JSON logs for debugging
 * - Sensitive data masking
 * - Performance metrics
 *
 * Note: LangSmith tracing is now handled automatically by traceable wrappers.
 * See lib/monitoring/langsmith-setup.ts for the new pattern.
 *
 * Referência: PRD RF-008, Task #10.5
 */

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
// SIMPLE LOGGER CLASS (Console output only)
// =============================================================================

/**
 * Simple Logger
 *
 * Provides structured console logging with sensitive data masking.
 * LangSmith tracing is now handled automatically by traceable wrappers.
 */
export class SimpleLogger {
  private workspaceId: string
  private userId: string
  private sessionId?: string

  constructor(workspaceId: string, userId: string, sessionId?: string) {
    this.workspaceId = workspaceId
    this.userId = userId
    this.sessionId = sessionId
  }

  /**
   * Sets the session ID (called after session is created)
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId
  }

  /**
   * Logs workflow start
   */
  logWorkflowStart(): void {
    this.log("INFO", "workflow_start", {
      message: "Health plan recommendation workflow started"
    })
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
// LEGACY LOGGER (kept for backwards compatibility)
// =============================================================================

/**
 * @deprecated Use SimpleLogger instead. LangSmith tracing is now handled by traceable wrappers.
 */
export class HealthPlanLogger extends SimpleLogger {
  constructor(
    workspaceId: string,
    userId: string,
    sessionId?: string,
    _traceId?: string,
    _chatId?: string
  ) {
    super(workspaceId, userId, sessionId)
    console.warn(
      "[logger] HealthPlanLogger is deprecated. Use SimpleLogger instead."
    )
  }

  /** @deprecated No longer needed - LangSmith tracing is automatic */
  getLangSmithTraceId(): string | undefined {
    return undefined
  }

  /** @deprecated No longer needed - LangSmith tracing is automatic */
  getLangSmithRunId(): string | undefined {
    return undefined
  }

  /** @deprecated No longer needed - LangSmith tracing is automatic */
  isNewTrace(): boolean {
    return true
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a new simple logger instance
 *
 * @param workspaceId - Workspace ID
 * @param userId - User ID
 * @param sessionId - Session ID (optional)
 */
export function createSimpleLogger(
  workspaceId: string,
  userId: string,
  sessionId?: string
): SimpleLogger {
  return new SimpleLogger(workspaceId, userId, sessionId)
}

/**
 * @deprecated Use createSimpleLogger instead
 */
export function createLogger(
  workspaceId: string,
  userId: string,
  sessionId?: string,
  _traceId?: string,
  _chatId?: string
): HealthPlanLogger {
  return new HealthPlanLogger(workspaceId, userId, sessionId)
}

/**
 * Creates a no-op logger for testing
 */
export function createNoopLogger(): SimpleLogger {
  return new SimpleLogger("test-workspace", "test-user")
}
