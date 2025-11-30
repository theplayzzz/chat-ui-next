/**
 * Traced OpenAI Client
 *
 * Wrapper around OpenAI client that automatically traces all calls to LangSmith.
 * This allows instrumenting existing code without modifying every call site.
 *
 * Referência: PRD RF-013, Task #14.2
 */

import OpenAI from "openai"
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions"
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
 * Tracing context passed to the wrapper
 */
export interface TracingContext {
  /** Correlation ID for session tracking */
  correlationId?: string
  /** Parent run ID for hierarchy */
  parentRunId?: string
  /** Workspace ID */
  workspaceId?: string
  /** User ID */
  userId?: string
  /** Tool name for categorization */
  toolName?: string
  /** Step number in workflow */
  step?: number
  /** Custom tags */
  tags?: string[]
}

/**
 * Token usage from OpenAI response
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * Metrics collected from a traced call
 */
export interface CallMetrics {
  runId: string
  durationMs: number
  tokenUsage?: TokenUsage
  model: string
  temperature?: number
  maxTokens?: number
  success: boolean
  error?: string
}

// =============================================================================
// TRACED OPENAI CLIENT
// =============================================================================

/**
 * Creates a traced OpenAI client that automatically logs to LangSmith
 *
 * @param apiKey - OpenAI API key
 * @param context - Tracing context for the session
 * @returns Object with chat completions method that traces to LangSmith
 */
export function createTracedOpenAI(
  apiKey: string,
  context: TracingContext = {}
) {
  const openai = new OpenAI({ apiKey })
  const langsmithClient = getLangSmithClient()

  /**
   * Creates a chat completion with automatic tracing
   */
  async function createChatCompletion(
    params: ChatCompletionCreateParamsNonStreaming,
    callName?: string
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const startTime = Date.now()
    const runId = context.parentRunId
      ? generateChildRunId(context.parentRunId, callName || "chat-completion")
      : `standalone-${Date.now()}-${callName || "chat"}`

    const maskedMessages = maskSensitiveData(params.messages)

    // Create LangSmith run
    if (langsmithClient) {
      try {
        await langsmithClient.createRun({
          id: runId,
          parent_run_id: context.parentRunId,
          name: callName || `chat-${params.model}`,
          run_type: "llm",
          inputs: {
            messages: maskedMessages,
            model: params.model,
            temperature: params.temperature,
            max_tokens: params.max_tokens,
            response_format: params.response_format
          },
          project_name: LANGSMITH_CONFIG.projectName,
          start_time: new Date().toISOString(),
          extra: {
            metadata: {
              correlationId: context.correlationId,
              workspaceId: context.workspaceId,
              userId: context.userId,
              toolName: context.toolName,
              step: context.step,
              version: LANGSMITH_CONFIG.traceVersion
            },
            tags: context.tags || [context.toolName || "other"]
          }
        })
      } catch (error) {
        console.warn("[traced-openai] Failed to create LangSmith run:", error)
      }
    }

    // Execute the actual OpenAI call
    let response: OpenAI.Chat.Completions.ChatCompletion | undefined
    let error: Error | undefined

    try {
      response = await openai.chat.completions.create(params)
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e))
      throw error
    } finally {
      const durationMs = Date.now() - startTime

      // Update LangSmith run
      if (langsmithClient) {
        try {
          const tokenUsage = response?.usage
            ? {
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens
              }
            : undefined

          await langsmithClient.updateRun(runId, {
            outputs: error
              ? { error: error.message }
              : {
                  choices: response?.choices?.map(c => ({
                    finish_reason: c.finish_reason,
                    content_length: c.message?.content?.length || 0
                  })),
                  usage: tokenUsage
                },
            end_time: new Date().toISOString(),
            error: error?.message,
            extra: {
              runtime_ms: durationMs,
              token_usage: tokenUsage
            }
          })
        } catch (updateError) {
          console.warn(
            "[traced-openai] Failed to update LangSmith run:",
            updateError
          )
        }
      }
    }

    return response!
  }

  return {
    chat: {
      completions: {
        create: createChatCompletion
      }
    },
    /**
     * Get the underlying OpenAI client for non-chat operations
     */
    getClient: () => openai,
    /**
     * Update the tracing context
     */
    setContext: (newContext: Partial<TracingContext>) => {
      Object.assign(context, newContext)
    }
  }
}

// =============================================================================
// WRAPPER FUNCTION FOR EXISTING OPENAI INSTANCES
// =============================================================================

/**
 * Wraps an existing OpenAI call with tracing
 *
 * Use this when you can't replace the OpenAI client but want to add tracing
 *
 * @param callName - Name for this call (e.g., "extract-client-info")
 * @param openaiCall - The OpenAI call to execute
 * @param context - Tracing context
 * @returns The result from the OpenAI call
 */
export async function traceOpenAICall<T>(
  callName: string,
  openaiCall: () => Promise<T>,
  context: TracingContext = {}
): Promise<T> {
  const langsmithClient = getLangSmithClient()
  const startTime = Date.now()
  const runId = context.parentRunId
    ? generateChildRunId(context.parentRunId, callName)
    : `standalone-${Date.now()}-${callName}`

  // Create LangSmith run
  if (langsmithClient) {
    try {
      await langsmithClient.createRun({
        id: runId,
        parent_run_id: context.parentRunId,
        name: callName,
        run_type: "llm",
        inputs: { traced: true },
        project_name: LANGSMITH_CONFIG.projectName,
        start_time: new Date().toISOString(),
        extra: {
          metadata: {
            correlationId: context.correlationId,
            workspaceId: context.workspaceId,
            userId: context.userId,
            toolName: context.toolName,
            step: context.step,
            version: LANGSMITH_CONFIG.traceVersion
          },
          tags: context.tags || [context.toolName || "other"]
        }
      })
    } catch (error) {
      console.warn("[traceOpenAICall] Failed to create run:", error)
    }
  }

  // Execute
  let result: T | undefined
  let error: Error | undefined

  try {
    result = await openaiCall()
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e))
    throw error
  } finally {
    const durationMs = Date.now() - startTime

    // Update run
    if (langsmithClient) {
      try {
        // Try to extract token usage if result looks like OpenAI response
        let tokenUsage: any
        if (result && typeof result === "object" && "usage" in result) {
          const usage = (result as any).usage
          if (usage) {
            tokenUsage = {
              prompt_tokens: usage.prompt_tokens || usage.promptTokens,
              completion_tokens:
                usage.completion_tokens || usage.completionTokens,
              total_tokens: usage.total_tokens || usage.totalTokens
            }
          }
        }

        await langsmithClient.updateRun(runId, {
          outputs: error
            ? { error: error.message }
            : { success: true, durationMs },
          end_time: new Date().toISOString(),
          error: error?.message,
          extra: {
            runtime_ms: durationMs,
            token_usage: tokenUsage
          }
        })
      } catch (updateError) {
        console.warn("[traceOpenAICall] Failed to update run:", updateError)
      }
    }
  }

  return result!
}

// =============================================================================
// METRICS EXTRACTION
// =============================================================================

/**
 * Extracts token usage from OpenAI response
 */
export function extractTokenUsage(response: any): TokenUsage | undefined {
  if (!response?.usage) return undefined

  return {
    promptTokens: response.usage.prompt_tokens || 0,
    completionTokens: response.usage.completion_tokens || 0,
    totalTokens: response.usage.total_tokens || 0
  }
}
