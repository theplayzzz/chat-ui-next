/**
 * OpenAI Call Tracer
 *
 * Provides instrumentation for all OpenAI/GPT-4o calls with LangSmith tracing.
 * Captures prompts, responses, latency, tokens, and errors.
 *
 * Referência: PRD RF-013, Task #14.2
 */

import {
  getLangSmithClient,
  generateChildRunId,
  LANGSMITH_CONFIG
} from "./langsmith-config"
import { maskSensitiveData } from "../tools/health-plan/logger"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Run types for LangSmith
 */
export type RunType = "llm" | "tool" | "chain" | "retriever" | "embedding"

/**
 * Tool names for categorization
 */
export type ToolName =
  | "extractClientInfo"
  | "searchHealthPlans"
  | "analyzeCompatibility"
  | "fetchERPPrices"
  | "generateRecommendation"
  | "embedding"
  | "other"

/**
 * Metadata for traced calls
 */
export interface TraceMetadata {
  /** Workflow step number (1-5) */
  step?: number
  /** Tool name for categorization */
  toolName?: ToolName
  /** Correlation ID for session tracking */
  correlationId?: string
  /** Parent run ID for hierarchy */
  parentRunId?: string
  /** Model being used */
  model?: string
  /** Temperature setting */
  temperature?: number
  /** Max tokens setting */
  maxTokens?: number
  /** Custom tags */
  tags?: string[]
  /** Additional metadata */
  [key: string]: any
}

/**
 * Result from traced call
 */
export interface TraceResult<T> {
  /** The result from the function */
  result: T
  /** Duration in milliseconds */
  durationMs: number
  /** LangSmith run ID */
  runId: string
  /** Token usage if available */
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// =============================================================================
// TRACER CLASS
// =============================================================================

/**
 * OpenAI Tracer for LangSmith integration
 */
export class OpenAITracer {
  private parentRunId: string
  private correlationId: string
  private workspaceId: string
  private userId: string

  constructor(
    parentRunId: string,
    correlationId: string,
    workspaceId: string,
    userId: string
  ) {
    this.parentRunId = parentRunId
    this.correlationId = correlationId
    this.workspaceId = workspaceId
    this.userId = userId
  }

  /**
   * Traces an OpenAI/LLM call
   *
   * @param runName - Name for the run (e.g., "extract-client-info")
   * @param runType - Type of run (llm, tool, etc.)
   * @param inputs - Input data (will be masked)
   * @param fn - The async function to execute
   * @param metadata - Additional metadata
   * @returns Trace result with duration and run ID
   */
  async trace<T>(
    runName: string,
    runType: RunType,
    inputs: Record<string, any>,
    fn: () => Promise<T>,
    metadata?: TraceMetadata
  ): Promise<TraceResult<T>> {
    const client = getLangSmithClient()
    const runId = generateChildRunId(this.parentRunId, runName)
    const startTime = Date.now()
    const maskedInputs = maskSensitiveData(inputs)

    // Create run in LangSmith
    if (client) {
      try {
        await client.createRun({
          id: runId,
          parent_run_id: this.parentRunId,
          name: runName,
          run_type: runType,
          inputs: maskedInputs,
          project_name: LANGSMITH_CONFIG.projectName,
          start_time: new Date().toISOString(),
          extra: {
            metadata: {
              correlationId: this.correlationId,
              workspaceId: this.workspaceId,
              userId: this.userId,
              step: metadata?.step,
              toolName: metadata?.toolName,
              model: metadata?.model,
              temperature: metadata?.temperature,
              maxTokens: metadata?.maxTokens,
              version: LANGSMITH_CONFIG.traceVersion
            },
            tags: metadata?.tags || []
          }
        })
      } catch (error) {
        console.warn("[openai-tracer] Failed to create run:", error)
      }
    }

    // Execute the function
    let result: T
    let error: Error | undefined
    let tokenUsage: TraceResult<T>["tokenUsage"]

    try {
      result = await fn()

      // Extract token usage if available in result
      if (result && typeof result === "object" && "usage" in result) {
        const usage = (result as any).usage
        if (usage) {
          tokenUsage = {
            promptTokens: usage.prompt_tokens || usage.promptTokens || 0,
            completionTokens:
              usage.completion_tokens || usage.completionTokens || 0,
            totalTokens: usage.total_tokens || usage.totalTokens || 0
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e))
      throw error
    } finally {
      const durationMs = Date.now() - startTime

      // Update run in LangSmith
      if (client) {
        try {
          await client.updateRun(runId, {
            outputs: error
              ? { error: error.message }
              : maskSensitiveData(this.summarizeOutput(result!)),
            end_time: new Date().toISOString(),
            error: error?.message,
            extra: {
              runtime_ms: durationMs,
              token_usage: tokenUsage
            }
          })
        } catch (updateError) {
          console.warn("[openai-tracer] Failed to update run:", updateError)
        }
      }
    }

    return {
      result: result!,
      durationMs: Date.now() - startTime,
      runId,
      tokenUsage
    }
  }

  /**
   * Summarizes output to avoid huge payloads in traces
   */
  private summarizeOutput(output: any): any {
    if (!output) return { empty: true }

    // For arrays, just show count
    if (Array.isArray(output)) {
      return {
        type: "array",
        count: output.length,
        sample: output.length > 0 ? this.summarizeOutput(output[0]) : null
      }
    }

    // For OpenAI-like responses
    if (output.choices && Array.isArray(output.choices)) {
      return {
        type: "openai_response",
        choicesCount: output.choices.length,
        finishReason: output.choices[0]?.finish_reason,
        contentLength: output.choices[0]?.message?.content?.length || 0,
        usage: output.usage
      }
    }

    // For objects with common result patterns
    if (typeof output === "object") {
      const keys = Object.keys(output)

      // Health plan specific outputs
      if ("rankedPlans" in output) {
        return {
          type: "ranked_plans",
          plansCount: output.rankedPlans?.length || 0,
          topScore: output.rankedPlans?.[0]?.score?.overall
        }
      }

      if ("clientInfo" in output) {
        return {
          type: "client_info",
          hasData: !!output.clientInfo,
          completeness: output.completeness
        }
      }

      if ("recommendation" in output || "markdown" in output) {
        return {
          type: "recommendation",
          hasContent: !!(output.recommendation || output.markdown),
          contentLength: (output.recommendation || output.markdown)?.length || 0
        }
      }

      // Generic object summary
      return {
        type: "object",
        keys: keys.slice(0, 10),
        keyCount: keys.length
      }
    }

    // For primitives
    if (typeof output === "string") {
      return {
        type: "string",
        length: output.length,
        preview: output.slice(0, 100)
      }
    }

    return output
  }
}

// =============================================================================
// STANDALONE FUNCTION
// =============================================================================

/**
 * Traced OpenAI call - standalone function for simple use cases
 *
 * @param runName - Name for the run
 * @param runType - Type of run
 * @param inputs - Input data
 * @param fn - Async function to execute
 * @param metadata - Additional metadata
 * @returns The result from fn
 */
export async function tracedOpenAICall<T>(
  runName: string,
  runType: RunType,
  inputs: Record<string, any>,
  fn: () => Promise<T>,
  metadata?: TraceMetadata
): Promise<T> {
  const client = getLangSmithClient()

  if (!client) {
    // If LangSmith is not configured, just execute the function
    return fn()
  }

  const runId = metadata?.parentRunId
    ? generateChildRunId(metadata.parentRunId, runName)
    : `standalone-${Date.now()}-${runName}`

  const startTime = Date.now()
  const maskedInputs = maskSensitiveData(inputs)

  // Create run
  try {
    await client.createRun({
      id: runId,
      parent_run_id: metadata?.parentRunId,
      name: runName,
      run_type: runType,
      inputs: maskedInputs,
      project_name: LANGSMITH_CONFIG.projectName,
      start_time: new Date().toISOString(),
      extra: {
        metadata: {
          correlationId: metadata?.correlationId,
          step: metadata?.step,
          toolName: metadata?.toolName,
          model: metadata?.model,
          version: LANGSMITH_CONFIG.traceVersion
        },
        tags: metadata?.tags || [metadata?.toolName || "other"]
      }
    })
  } catch (error) {
    console.warn("[tracedOpenAICall] Failed to create run:", error)
  }

  // Execute
  let result: T
  let error: Error | undefined

  try {
    result = await fn()
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e))
    throw error
  } finally {
    const durationMs = Date.now() - startTime

    // Update run
    try {
      await client.updateRun(runId, {
        outputs: error
          ? { error: error.message }
          : { success: true, durationMs },
        end_time: new Date().toISOString(),
        error: error?.message,
        extra: { runtime_ms: durationMs }
      })
    } catch (updateError) {
      console.warn("[tracedOpenAICall] Failed to update run:", updateError)
    }
  }

  return result!
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a new OpenAI tracer instance
 *
 * @param parentRunId - Parent run ID from orchestrator
 * @param correlationId - Session correlation ID
 * @param workspaceId - Workspace ID
 * @param userId - User ID
 * @returns OpenAITracer instance
 */
export function createOpenAITracer(
  parentRunId: string,
  correlationId: string,
  workspaceId: string,
  userId: string
): OpenAITracer {
  return new OpenAITracer(parentRunId, correlationId, workspaceId, userId)
}
