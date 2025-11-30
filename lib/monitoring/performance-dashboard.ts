/**
 * Performance Dashboard
 *
 * Provides structured logging and reporting for performance metrics.
 * Outputs metrics in a format suitable for log aggregation tools.
 *
 * Since we're using logs-only approach (per plan decisions), this module:
 * - Outputs structured JSON logs for metric events
 * - Provides summary statistics
 * - Tracks performance trends within a session
 * - Supports log aggregation tools like CloudWatch, Datadog, etc.
 *
 * Referência: PRD RF-013, Task #14.6
 */

import {
  type SessionMetrics,
  type StepMetrics,
  type BusinessMetrics,
  formatCost,
  formatLatency,
  formatTokens
} from "./metrics-collector"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Log levels for performance events
 */
export type PerformanceLogLevel = "debug" | "info" | "warn" | "error"

/**
 * Performance event types
 */
export type PerformanceEventType =
  | "session_start"
  | "session_end"
  | "step_start"
  | "step_end"
  | "llm_call"
  | "metric_threshold_exceeded"
  | "performance_summary"

/**
 * Structured performance log entry
 */
export interface PerformanceLogEntry {
  timestamp: string
  level: PerformanceLogLevel
  eventType: PerformanceEventType
  correlationId: string
  sessionId: string
  workspaceId: string
  data: Record<string, any>
  tags: string[]
}

/**
 * Threshold configuration for performance alerts
 */
export interface PerformanceThresholds {
  /** Max latency per step in ms */
  maxStepLatencyMs: number
  /** Max latency per LLM call in ms */
  maxLLMCallLatencyMs: number
  /** Max total session latency in ms */
  maxSessionLatencyMs: number
  /** Max cost per session in USD */
  maxSessionCostUSD: number
  /** Max tokens per session */
  maxSessionTokens: number
}

/**
 * Default thresholds (can be configured per workspace)
 */
export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  maxStepLatencyMs: 30000, // 30 seconds
  maxLLMCallLatencyMs: 15000, // 15 seconds
  maxSessionLatencyMs: 120000, // 2 minutes
  maxSessionCostUSD: 0.5, // 50 cents
  maxSessionTokens: 50000 // 50K tokens
}

/**
 * Performance statistics for a metric
 */
export interface MetricStats {
  count: number
  min: number
  max: number
  sum: number
  avg: number
  p50?: number
  p95?: number
  p99?: number
}

// =============================================================================
// PERFORMANCE LOGGER
// =============================================================================

/**
 * Performance Dashboard Logger
 *
 * Logs performance metrics in structured format
 */
export class PerformanceDashboard {
  private correlationId: string
  private sessionId: string
  private workspaceId: string
  private thresholds: PerformanceThresholds
  private stepLatencies: number[] = []
  private llmCallLatencies: number[] = []
  private logs: PerformanceLogEntry[] = []
  private logToConsole: boolean

  constructor(
    correlationId: string,
    sessionId: string,
    workspaceId: string,
    thresholds: Partial<PerformanceThresholds> = {},
    logToConsole: boolean = true
  ) {
    this.correlationId = correlationId
    this.sessionId = sessionId
    this.workspaceId = workspaceId
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
    this.logToConsole = logToConsole
  }

  /**
   * Logs a performance event
   */
  private log(
    level: PerformanceLogLevel,
    eventType: PerformanceEventType,
    data: Record<string, any>,
    tags: string[] = []
  ): void {
    const entry: PerformanceLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      eventType,
      correlationId: this.correlationId,
      sessionId: this.sessionId,
      workspaceId: this.workspaceId,
      data,
      tags: ["health-plan", "performance", ...tags]
    }

    this.logs.push(entry)

    if (this.logToConsole) {
      const logMethod =
        level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : level === "debug"
              ? console.debug
              : console.info

      logMethod(JSON.stringify(entry))
    }
  }

  /**
   * Logs session start
   */
  logSessionStart(metadata?: Record<string, any>): void {
    this.log("info", "session_start", {
      message: "Health plan recommendation session started",
      ...metadata
    })
  }

  /**
   * Logs session end with full metrics
   */
  logSessionEnd(metrics: SessionMetrics): void {
    const level: PerformanceLogLevel = metrics.success ? "info" : "error"

    this.log(level, "session_end", {
      message: metrics.success
        ? "Session completed successfully"
        : `Session failed: ${metrics.error}`,
      success: metrics.success,
      totalLatencyMs: metrics.totalLatencyMs,
      totalLatencyFormatted: formatLatency(metrics.totalLatencyMs),
      stepsCompleted: metrics.steps.length,
      totalTokens: metrics.totalTokens.totalTokens,
      totalCostUSD: metrics.totalCost.totalCost,
      totalCostFormatted: formatCost(metrics.totalCost.totalCost),
      business: metrics.business,
      error: metrics.error
    })

    // Check thresholds and log warnings
    this.checkThresholds(metrics)
  }

  /**
   * Logs step start
   */
  logStepStart(stepNumber: number, stepName: string): void {
    this.log(
      "debug",
      "step_start",
      {
        message: `Step ${stepNumber} (${stepName}) started`,
        stepNumber,
        stepName
      },
      [`step-${stepNumber}`]
    )
  }

  /**
   * Logs step end with metrics
   */
  logStepEnd(stepMetrics: StepMetrics): void {
    this.stepLatencies.push(stepMetrics.latency.durationMs)

    const level: PerformanceLogLevel = stepMetrics.success ? "info" : "error"

    this.log(
      level,
      "step_end",
      {
        message: stepMetrics.success
          ? `Step ${stepMetrics.stepNumber} completed`
          : `Step ${stepMetrics.stepNumber} failed: ${stepMetrics.error}`,
        stepNumber: stepMetrics.stepNumber,
        stepName: stepMetrics.stepName,
        success: stepMetrics.success,
        latencyMs: stepMetrics.latency.durationMs,
        latencyFormatted: formatLatency(stepMetrics.latency.durationMs),
        llmCallCount: stepMetrics.llmCalls.length,
        totalTokens: stepMetrics.totalTokens.totalTokens,
        totalCostUSD: stepMetrics.totalCost.totalCost,
        error: stepMetrics.error
      },
      [`step-${stepMetrics.stepNumber}`]
    )

    // Check step latency threshold
    if (stepMetrics.latency.durationMs > this.thresholds.maxStepLatencyMs) {
      this.log(
        "warn",
        "metric_threshold_exceeded",
        {
          message: `Step latency exceeded threshold`,
          metric: "step_latency_ms",
          value: stepMetrics.latency.durationMs,
          threshold: this.thresholds.maxStepLatencyMs,
          stepNumber: stepMetrics.stepNumber,
          stepName: stepMetrics.stepName
        },
        ["threshold_exceeded", "latency"]
      )
    }
  }

  /**
   * Logs an LLM call
   */
  logLLMCall(
    callName: string,
    model: string,
    latencyMs: number,
    promptTokens: number,
    completionTokens: number,
    success: boolean,
    error?: string
  ): void {
    this.llmCallLatencies.push(latencyMs)

    const level: PerformanceLogLevel = success ? "debug" : "error"

    this.log(
      level,
      "llm_call",
      {
        message: success
          ? `LLM call ${callName} completed`
          : `LLM call ${callName} failed`,
        callName,
        model,
        latencyMs,
        latencyFormatted: formatLatency(latencyMs),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        success,
        error
      },
      ["llm", model]
    )

    // Check LLM call latency threshold
    if (latencyMs > this.thresholds.maxLLMCallLatencyMs) {
      this.log(
        "warn",
        "metric_threshold_exceeded",
        {
          message: `LLM call latency exceeded threshold`,
          metric: "llm_call_latency_ms",
          value: latencyMs,
          threshold: this.thresholds.maxLLMCallLatencyMs,
          callName,
          model
        },
        ["threshold_exceeded", "latency", "llm"]
      )
    }
  }

  /**
   * Checks all thresholds and logs warnings
   */
  private checkThresholds(metrics: SessionMetrics): void {
    // Session latency
    if (metrics.totalLatencyMs > this.thresholds.maxSessionLatencyMs) {
      this.log(
        "warn",
        "metric_threshold_exceeded",
        {
          message: "Session latency exceeded threshold",
          metric: "session_latency_ms",
          value: metrics.totalLatencyMs,
          threshold: this.thresholds.maxSessionLatencyMs
        },
        ["threshold_exceeded", "latency", "session"]
      )
    }

    // Session cost
    if (metrics.totalCost.totalCost > this.thresholds.maxSessionCostUSD) {
      this.log(
        "warn",
        "metric_threshold_exceeded",
        {
          message: "Session cost exceeded threshold",
          metric: "session_cost_usd",
          value: metrics.totalCost.totalCost,
          threshold: this.thresholds.maxSessionCostUSD
        },
        ["threshold_exceeded", "cost", "session"]
      )
    }

    // Session tokens
    if (metrics.totalTokens.totalTokens > this.thresholds.maxSessionTokens) {
      this.log(
        "warn",
        "metric_threshold_exceeded",
        {
          message: "Session token usage exceeded threshold",
          metric: "session_tokens",
          value: metrics.totalTokens.totalTokens,
          threshold: this.thresholds.maxSessionTokens
        },
        ["threshold_exceeded", "tokens", "session"]
      )
    }
  }

  /**
   * Generates a performance summary
   */
  generateSummary(): {
    stepLatencyStats: MetricStats
    llmCallLatencyStats: MetricStats
    totalLogCount: number
    warningCount: number
    errorCount: number
  } {
    return {
      stepLatencyStats: calculateStats(this.stepLatencies),
      llmCallLatencyStats: calculateStats(this.llmCallLatencies),
      totalLogCount: this.logs.length,
      warningCount: this.logs.filter(l => l.level === "warn").length,
      errorCount: this.logs.filter(l => l.level === "error").length
    }
  }

  /**
   * Logs the performance summary
   */
  logPerformanceSummary(): void {
    const summary = this.generateSummary()

    this.log(
      "info",
      "performance_summary",
      {
        message: "Performance summary",
        stepLatency: {
          count: summary.stepLatencyStats.count,
          avgMs: Math.round(summary.stepLatencyStats.avg),
          minMs: summary.stepLatencyStats.min,
          maxMs: summary.stepLatencyStats.max
        },
        llmCallLatency: {
          count: summary.llmCallLatencyStats.count,
          avgMs: Math.round(summary.llmCallLatencyStats.avg),
          minMs: summary.llmCallLatencyStats.min,
          maxMs: summary.llmCallLatencyStats.max
        },
        logCounts: {
          total: summary.totalLogCount,
          warnings: summary.warningCount,
          errors: summary.errorCount
        }
      },
      ["summary"]
    )
  }

  /**
   * Gets all logged entries
   */
  getLogs(): PerformanceLogEntry[] {
    return [...this.logs]
  }

  /**
   * Gets logs filtered by level
   */
  getLogsByLevel(level: PerformanceLogLevel): PerformanceLogEntry[] {
    return this.logs.filter(l => l.level === level)
  }

  /**
   * Gets logs filtered by event type
   */
  getLogsByEventType(eventType: PerformanceEventType): PerformanceLogEntry[] {
    return this.logs.filter(l => l.eventType === eventType)
  }

  /**
   * Clears all logs (for testing)
   */
  clearLogs(): void {
    this.logs = []
    this.stepLatencies = []
    this.llmCallLatencies = []
  }
}

// =============================================================================
// STATISTICS CALCULATION
// =============================================================================

/**
 * Calculates statistics for a set of values
 */
export function calculateStats(values: number[]): MetricStats {
  if (values.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      sum: 0,
      avg: 0
    }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((a, b) => a + b, 0)

  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    sum,
    avg: sum / values.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99)
  }
}

/**
 * Calculates percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]

  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const fraction = index - lower

  return sorted[lower] + fraction * (sorted[upper] - sorted[lower])
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a new performance dashboard
 */
export function createPerformanceDashboard(
  correlationId: string,
  sessionId: string,
  workspaceId: string,
  thresholds?: Partial<PerformanceThresholds>,
  logToConsole: boolean = true
): PerformanceDashboard {
  return new PerformanceDashboard(
    correlationId,
    sessionId,
    workspaceId,
    thresholds,
    logToConsole
  )
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

/**
 * Generates a human-readable performance report
 */
export function generatePerformanceReport(
  metrics: SessionMetrics,
  dashboard: PerformanceDashboard
): string {
  const summary = dashboard.generateSummary()
  const lines: string[] = []

  lines.push("=".repeat(60))
  lines.push("PERFORMANCE REPORT - Health Plan Recommendation")
  lines.push("=".repeat(60))
  lines.push("")

  // Session Info
  lines.push("SESSION INFORMATION")
  lines.push("-".repeat(40))
  lines.push(`Session ID:      ${metrics.sessionId}`)
  lines.push(`Correlation ID:  ${metrics.correlationId}`)
  lines.push(`Workspace ID:    ${metrics.workspaceId}`)
  lines.push(`Status:          ${metrics.success ? "SUCCESS" : "FAILED"}`)
  if (metrics.error) {
    lines.push(`Error:           ${metrics.error}`)
  }
  lines.push("")

  // Performance Metrics
  lines.push("PERFORMANCE METRICS")
  lines.push("-".repeat(40))
  lines.push(`Total Duration:  ${formatLatency(metrics.totalLatencyMs)}`)
  lines.push(
    `Total Tokens:    ${formatTokens(metrics.totalTokens.totalTokens)}`
  )
  lines.push(
    `  - Prompt:      ${formatTokens(metrics.totalTokens.promptTokens)}`
  )
  lines.push(
    `  - Completion:  ${formatTokens(metrics.totalTokens.completionTokens)}`
  )
  lines.push(`Total Cost:      ${formatCost(metrics.totalCost.totalCost)}`)
  lines.push("")

  // Step Breakdown
  lines.push("STEP BREAKDOWN")
  lines.push("-".repeat(40))
  for (const step of metrics.steps) {
    const status = step.success ? "[OK]" : "[FAIL]"
    lines.push(`${status} Step ${step.stepNumber}: ${step.stepName}`)
    lines.push(
      `     Duration: ${formatLatency(step.latency.durationMs)} | LLM Calls: ${step.llmCalls.length} | Tokens: ${formatTokens(step.totalTokens.totalTokens)}`
    )
    if (step.error) {
      lines.push(`     Error: ${step.error}`)
    }
  }
  lines.push("")

  // Latency Statistics
  if (summary.stepLatencyStats.count > 0) {
    lines.push("LATENCY STATISTICS")
    lines.push("-".repeat(40))
    lines.push(`Step Latency:`)
    lines.push(`  - Avg: ${formatLatency(summary.stepLatencyStats.avg)}`)
    lines.push(`  - Min: ${formatLatency(summary.stepLatencyStats.min)}`)
    lines.push(`  - Max: ${formatLatency(summary.stepLatencyStats.max)}`)
    if (summary.llmCallLatencyStats.count > 0) {
      lines.push(`LLM Call Latency:`)
      lines.push(`  - Avg: ${formatLatency(summary.llmCallLatencyStats.avg)}`)
      lines.push(`  - Min: ${formatLatency(summary.llmCallLatencyStats.min)}`)
      lines.push(`  - Max: ${formatLatency(summary.llmCallLatencyStats.max)}`)
    }
    lines.push("")
  }

  // Business Metrics
  if (
    metrics.business.plansFound > 0 ||
    metrics.business.clientCompleteness > 0
  ) {
    lines.push("BUSINESS METRICS")
    lines.push("-".repeat(40))
    if (metrics.business.plansFound > 0) {
      lines.push(`Plans Found:     ${metrics.business.plansFound}`)
      lines.push(`Plans Analyzed:  ${metrics.business.plansAnalyzed}`)
    }
    if (metrics.business.clientCompleteness > 0) {
      lines.push(`Client Complete: ${metrics.business.clientCompleteness}%`)
    }
    if (metrics.business.topPlanScore) {
      lines.push(`Top Plan Score:  ${metrics.business.topPlanScore}`)
    }
    lines.push("")
  }

  // Alerts
  if (summary.warningCount > 0 || summary.errorCount > 0) {
    lines.push("ALERTS")
    lines.push("-".repeat(40))
    lines.push(`Warnings: ${summary.warningCount}`)
    lines.push(`Errors:   ${summary.errorCount}`)
    lines.push("")
  }

  lines.push("=".repeat(60))

  return lines.join("\n")
}

/**
 * Generates a JSON report for programmatic consumption
 */
export function generateJSONReport(
  metrics: SessionMetrics,
  dashboard: PerformanceDashboard
): object {
  const summary = dashboard.generateSummary()

  return {
    reportGeneratedAt: new Date().toISOString(),
    session: {
      id: metrics.sessionId,
      correlationId: metrics.correlationId,
      workspaceId: metrics.workspaceId,
      userId: metrics.userId,
      success: metrics.success,
      error: metrics.error
    },
    timing: {
      startTime: metrics.startTime,
      endTime: metrics.endTime,
      totalLatencyMs: metrics.totalLatencyMs
    },
    tokens: metrics.totalTokens,
    cost: metrics.totalCost,
    business: metrics.business,
    steps: metrics.steps.map(s => ({
      number: s.stepNumber,
      name: s.stepName,
      success: s.success,
      latencyMs: s.latency.durationMs,
      llmCalls: s.llmCalls.length,
      tokens: s.totalTokens.totalTokens,
      cost: s.totalCost.totalCost,
      error: s.error
    })),
    statistics: {
      stepLatency: summary.stepLatencyStats,
      llmCallLatency: summary.llmCallLatencyStats
    },
    alerts: {
      warnings: summary.warningCount,
      errors: summary.errorCount
    }
  }
}
