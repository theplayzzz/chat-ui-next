/**
 * Metrics Collector
 *
 * Collects granular metrics for the health plan workflow:
 * - Latency per step and LLM call
 * - Token usage (prompt, completion, total)
 * - Cost estimation based on model pricing
 * - Business metrics (plans found, completeness, etc.)
 *
 * Referência: PRD RF-013, Task #14.4
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Model pricing per 1M tokens (in USD)
 */
export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
}

/**
 * Token usage from a single call
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * Latency metrics for a single operation
 */
export interface LatencyMetrics {
  durationMs: number
  startTime: string
  endTime: string
}

/**
 * Cost breakdown for a session
 */
export interface CostMetrics {
  inputCost: number
  outputCost: number
  totalCost: number
  currency: "USD"
}

/**
 * Metrics for a single LLM call
 */
export interface LLMCallMetrics {
  callId: string
  callName: string
  model: string
  latency: LatencyMetrics
  tokens: TokenUsage
  cost: CostMetrics
  success: boolean
  error?: string
}

/**
 * Metrics for a workflow step
 */
export interface StepMetrics {
  stepNumber: number
  stepName: string
  latency: LatencyMetrics
  llmCalls: LLMCallMetrics[]
  totalTokens: TokenUsage
  totalCost: CostMetrics
  success: boolean
  error?: string
}

/**
 * Business metrics from the workflow
 */
export interface BusinessMetrics {
  plansFound: number
  plansAnalyzed: number
  clientCompleteness: number
  topPlanScore?: number
  recommendedPlanId?: string
  missingFields?: string[]
}

/**
 * Complete session metrics
 */
export interface SessionMetrics {
  sessionId: string
  correlationId: string
  workspaceId: string
  userId?: string
  startTime: string
  endTime?: string
  totalLatencyMs: number
  steps: StepMetrics[]
  totalTokens: TokenUsage
  totalCost: CostMetrics
  business: BusinessMetrics
  success: boolean
  error?: string
}

// =============================================================================
// MODEL PRICING
// =============================================================================

/**
 * Pricing for OpenAI models (as of Nov 2024)
 * Source: https://openai.com/pricing
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-4o
  "gpt-4o": {
    inputPer1M: 2.5,
    outputPer1M: 10.0
  },
  "gpt-4o-2024-11-20": {
    inputPer1M: 2.5,
    outputPer1M: 10.0
  },
  "gpt-4o-2024-08-06": {
    inputPer1M: 2.5,
    outputPer1M: 10.0
  },
  // GPT-4o-mini
  "gpt-4o-mini": {
    inputPer1M: 0.15,
    outputPer1M: 0.6
  },
  "gpt-4o-mini-2024-07-18": {
    inputPer1M: 0.15,
    outputPer1M: 0.6
  },
  // GPT-4 Turbo
  "gpt-4-turbo": {
    inputPer1M: 10.0,
    outputPer1M: 30.0
  },
  "gpt-4-turbo-2024-04-09": {
    inputPer1M: 10.0,
    outputPer1M: 30.0
  },
  // GPT-3.5
  "gpt-3.5-turbo": {
    inputPer1M: 0.5,
    outputPer1M: 1.5
  },
  "gpt-3.5-turbo-0125": {
    inputPer1M: 0.5,
    outputPer1M: 1.5
  },
  // Text Embedding
  "text-embedding-3-small": {
    inputPer1M: 0.02,
    outputPer1M: 0.0
  },
  "text-embedding-3-large": {
    inputPer1M: 0.13,
    outputPer1M: 0.0
  },
  "text-embedding-ada-002": {
    inputPer1M: 0.1,
    outputPer1M: 0.0
  }
}

/**
 * Default pricing for unknown models
 */
const DEFAULT_PRICING: ModelPricing = {
  inputPer1M: 5.0,
  outputPer1M: 15.0
}

// =============================================================================
// COST CALCULATION
// =============================================================================

/**
 * Gets pricing for a model
 *
 * @param model - Model name
 * @returns Model pricing
 */
export function getModelPricing(model: string): ModelPricing {
  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model]
  }

  // Try base model match (e.g., "gpt-4o-2024-11-20" → "gpt-4o")
  const baseModel = model.split("-").slice(0, 2).join("-")
  if (MODEL_PRICING[baseModel]) {
    return MODEL_PRICING[baseModel]
  }

  // Return default pricing with warning
  console.warn(
    `[metrics-collector] Unknown model pricing for: ${model}, using default`
  )
  return DEFAULT_PRICING
}

/**
 * Calculates cost for token usage
 *
 * @param tokens - Token usage
 * @param model - Model name
 * @returns Cost metrics
 */
export function calculateCost(tokens: TokenUsage, model: string): CostMetrics {
  const pricing = getModelPricing(model)

  const inputCost = (tokens.promptTokens / 1_000_000) * pricing.inputPer1M
  const outputCost = (tokens.completionTokens / 1_000_000) * pricing.outputPer1M
  const totalCost = inputCost + outputCost

  return {
    inputCost: roundToSixDecimals(inputCost),
    outputCost: roundToSixDecimals(outputCost),
    totalCost: roundToSixDecimals(totalCost),
    currency: "USD"
  }
}

/**
 * Rounds a number to 6 decimal places
 */
function roundToSixDecimals(num: number): number {
  return Math.round(num * 1_000_000) / 1_000_000
}

// =============================================================================
// METRICS COLLECTOR CLASS
// =============================================================================

/**
 * Metrics Collector
 *
 * Collects and aggregates metrics for a health plan recommendation session
 */
export class MetricsCollector {
  private sessionId: string
  private correlationId: string
  private workspaceId: string
  private userId?: string
  private startTime: number
  private steps: Map<number, StepMetrics> = new Map()
  private currentStep: number | null = null
  private currentStepStartTime: number | null = null
  private businessMetrics: BusinessMetrics = {
    plansFound: 0,
    plansAnalyzed: 0,
    clientCompleteness: 0
  }

  constructor(
    sessionId: string,
    correlationId: string,
    workspaceId: string,
    userId?: string
  ) {
    this.sessionId = sessionId
    this.correlationId = correlationId
    this.workspaceId = workspaceId
    this.userId = userId
    this.startTime = Date.now()
  }

  /**
   * Starts tracking a workflow step
   *
   * @param stepNumber - Step number (1-5)
   * @param stepName - Step name
   */
  startStep(stepNumber: number, stepName: string): void {
    this.currentStep = stepNumber
    this.currentStepStartTime = Date.now()

    // Initialize step metrics if not exists
    if (!this.steps.has(stepNumber)) {
      this.steps.set(stepNumber, {
        stepNumber,
        stepName,
        latency: {
          durationMs: 0,
          startTime: new Date().toISOString(),
          endTime: ""
        },
        llmCalls: [],
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: "USD"
        },
        success: false
      })
    }
  }

  /**
   * Records an LLM call within the current step
   *
   * @param callId - Unique call identifier
   * @param callName - Name of the call (e.g., "extract-client-info")
   * @param model - Model used
   * @param tokens - Token usage
   * @param durationMs - Call duration in milliseconds
   * @param success - Whether call succeeded
   * @param error - Error message if failed
   */
  recordLLMCall(
    callId: string,
    callName: string,
    model: string,
    tokens: TokenUsage,
    durationMs: number,
    success: boolean,
    error?: string
  ): void {
    const cost = calculateCost(tokens, model)
    const now = new Date()
    const startTime = new Date(now.getTime() - durationMs)

    const callMetrics: LLMCallMetrics = {
      callId,
      callName,
      model,
      latency: {
        durationMs,
        startTime: startTime.toISOString(),
        endTime: now.toISOString()
      },
      tokens,
      cost,
      success,
      error
    }

    // Add to current step if active
    if (this.currentStep !== null) {
      const step = this.steps.get(this.currentStep)
      if (step) {
        step.llmCalls.push(callMetrics)

        // Aggregate tokens
        step.totalTokens.promptTokens += tokens.promptTokens
        step.totalTokens.completionTokens += tokens.completionTokens
        step.totalTokens.totalTokens += tokens.totalTokens

        // Aggregate costs
        step.totalCost.inputCost = roundToSixDecimals(
          step.totalCost.inputCost + cost.inputCost
        )
        step.totalCost.outputCost = roundToSixDecimals(
          step.totalCost.outputCost + cost.outputCost
        )
        step.totalCost.totalCost = roundToSixDecimals(
          step.totalCost.totalCost + cost.totalCost
        )
      }
    }
  }

  /**
   * Ends tracking for the current step
   *
   * @param success - Whether step completed successfully
   * @param error - Error message if failed
   */
  endStep(success: boolean, error?: string): void {
    if (this.currentStep === null || this.currentStepStartTime === null) {
      console.warn("[metrics-collector] endStep called without active step")
      return
    }

    const step = this.steps.get(this.currentStep)
    if (step) {
      step.latency.durationMs = Date.now() - this.currentStepStartTime
      step.latency.endTime = new Date().toISOString()
      step.success = success
      step.error = error
    }

    this.currentStep = null
    this.currentStepStartTime = null
  }

  /**
   * Updates business metrics
   *
   * @param metrics - Partial business metrics to merge
   */
  updateBusinessMetrics(metrics: Partial<BusinessMetrics>): void {
    this.businessMetrics = { ...this.businessMetrics, ...metrics }
  }

  /**
   * Gets the current business metrics
   */
  getBusinessMetrics(): BusinessMetrics {
    return { ...this.businessMetrics }
  }

  /**
   * Gets metrics for a specific step
   *
   * @param stepNumber - Step number
   * @returns Step metrics or undefined
   */
  getStepMetrics(stepNumber: number): StepMetrics | undefined {
    return this.steps.get(stepNumber)
  }

  /**
   * Gets the total token usage across all steps
   */
  getTotalTokens(): TokenUsage {
    const total: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    }

    for (const step of this.steps.values()) {
      total.promptTokens += step.totalTokens.promptTokens
      total.completionTokens += step.totalTokens.completionTokens
      total.totalTokens += step.totalTokens.totalTokens
    }

    return total
  }

  /**
   * Gets the total cost across all steps
   */
  getTotalCost(): CostMetrics {
    const total: CostMetrics = {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: "USD"
    }

    for (const step of this.steps.values()) {
      total.inputCost += step.totalCost.inputCost
      total.outputCost += step.totalCost.outputCost
      total.totalCost += step.totalCost.totalCost
    }

    return {
      inputCost: roundToSixDecimals(total.inputCost),
      outputCost: roundToSixDecimals(total.outputCost),
      totalCost: roundToSixDecimals(total.totalCost),
      currency: "USD"
    }
  }

  /**
   * Gets the total latency for the session
   */
  getTotalLatencyMs(): number {
    return Date.now() - this.startTime
  }

  /**
   * Finalizes the session and returns complete metrics
   *
   * @param success - Whether session completed successfully
   * @param error - Error message if failed
   * @returns Complete session metrics
   */
  finalize(success: boolean, error?: string): SessionMetrics {
    const endTime = new Date().toISOString()
    const totalLatencyMs = Date.now() - this.startTime

    // Convert steps map to sorted array
    const stepsArray = Array.from(this.steps.values()).sort(
      (a, b) => a.stepNumber - b.stepNumber
    )

    return {
      sessionId: this.sessionId,
      correlationId: this.correlationId,
      workspaceId: this.workspaceId,
      userId: this.userId,
      startTime: new Date(this.startTime).toISOString(),
      endTime,
      totalLatencyMs,
      steps: stepsArray,
      totalTokens: this.getTotalTokens(),
      totalCost: this.getTotalCost(),
      business: this.businessMetrics,
      success,
      error
    }
  }

  /**
   * Gets a summary of the current metrics (for logging/debugging)
   */
  getSummary(): {
    totalLatencyMs: number
    stepsCompleted: number
    totalLLMCalls: number
    totalTokens: number
    totalCostUSD: number
  } {
    let totalLLMCalls = 0
    for (const step of this.steps.values()) {
      totalLLMCalls += step.llmCalls.length
    }

    return {
      totalLatencyMs: this.getTotalLatencyMs(),
      stepsCompleted: this.steps.size,
      totalLLMCalls,
      totalTokens: this.getTotalTokens().totalTokens,
      totalCostUSD: this.getTotalCost().totalCost
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a new metrics collector
 *
 * @param sessionId - Session identifier
 * @param correlationId - Correlation ID for tracking
 * @param workspaceId - Workspace identifier
 * @param userId - Optional user identifier
 * @returns MetricsCollector instance
 */
export function createMetricsCollector(
  sessionId: string,
  correlationId: string,
  workspaceId: string,
  userId?: string
): MetricsCollector {
  return new MetricsCollector(sessionId, correlationId, workspaceId, userId)
}

// =============================================================================
// METRICS FORMATTING
// =============================================================================

/**
 * Formats cost to human-readable string
 *
 * @param cost - Cost in USD
 * @returns Formatted string (e.g., "$0.0025")
 */
export function formatCost(cost: number): string {
  if (cost < 0.0001) {
    return `$${cost.toFixed(6)}`
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`
  }
  return `$${cost.toFixed(2)}`
}

/**
 * Formats latency to human-readable string
 *
 * @param ms - Latency in milliseconds
 * @returns Formatted string (e.g., "1.5s" or "250ms")
 */
export function formatLatency(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

/**
 * Formats token count to human-readable string
 *
 * @param tokens - Token count
 * @returns Formatted string (e.g., "1.2K" or "850")
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString()
  }
  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return `${(tokens / 1000000).toFixed(1)}M`
}

/**
 * Creates a human-readable metrics summary
 *
 * @param metrics - Session metrics
 * @returns Formatted summary string
 */
export function formatMetricsSummary(metrics: SessionMetrics): string {
  const lines: string[] = [
    `Session: ${metrics.sessionId}`,
    `Correlation: ${metrics.correlationId}`,
    `Duration: ${formatLatency(metrics.totalLatencyMs)}`,
    `Steps: ${metrics.steps.length}/5`,
    `Tokens: ${formatTokens(metrics.totalTokens.totalTokens)} (${formatTokens(metrics.totalTokens.promptTokens)} in / ${formatTokens(metrics.totalTokens.completionTokens)} out)`,
    `Cost: ${formatCost(metrics.totalCost.totalCost)}`,
    `Status: ${metrics.success ? "SUCCESS" : "FAILED"}${metrics.error ? ` - ${metrics.error}` : ""}`
  ]

  // Add business metrics
  if (metrics.business.plansFound > 0) {
    lines.push(
      `Plans: ${metrics.business.plansFound} found, ${metrics.business.plansAnalyzed} analyzed`
    )
  }
  if (metrics.business.clientCompleteness > 0) {
    lines.push(`Client completeness: ${metrics.business.clientCompleteness}%`)
  }
  if (metrics.business.topPlanScore) {
    lines.push(`Top plan score: ${metrics.business.topPlanScore}`)
  }

  return lines.join("\n")
}
