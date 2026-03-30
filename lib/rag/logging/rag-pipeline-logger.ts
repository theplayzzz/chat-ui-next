/**
 * RAG Pipeline Logger
 *
 * Fire-and-forget logging for RAG pipeline stages.
 * Saves to `rag_pipeline_logs` table for debugging and monitoring.
 * Errors are caught internally - never blocks the pipeline.
 *
 * Pattern: lib/agents/health-plan-v2/audit/save-workflow-log.ts
 */

import { createClient } from "@supabase/supabase-js"

// =============================================================================
// TYPES
// =============================================================================

export interface RagLogEntry {
  fileId?: string
  workspaceId?: string
  userId?: string
  correlationId: string
  stage: string // 'upload' | 'analysis' | 'chunking' | 'tag_inference' | 'context_generation' | 'embedding' | 'embedding_enriched' | 'file_embedding' | 'collection_embedding' | 'retrieval' | 'grading' | 'reranking' | 'hybrid_search' | 'crag_retry'
  status: "started" | "completed" | "failed" | "retried"
  inputMetadata?: Record<string, unknown>
  outputMetadata?: Record<string, unknown>
  errorDetails?: Record<string, unknown>
  durationMs?: number
  chunksProcessed?: number
  chunksCreated?: number
  modelUsed?: string
  tokensUsed?: number
}

// =============================================================================
// HELPERS
// =============================================================================

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing Supabase environment variables for RAG pipeline log"
    )
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// =============================================================================
// LOG RAG STAGE (FIRE-AND-FORGET)
// =============================================================================

/**
 * Fire-and-forget: logs a single RAG pipeline stage.
 * Errors are caught internally and logged to console.
 */
export async function logRagStage(entry: RagLogEntry): Promise<void> {
  try {
    const supabase = createSupabaseAdmin()

    const { error } = await supabase.from("rag_pipeline_logs").insert({
      file_id: entry.fileId || null,
      workspace_id: entry.workspaceId || null,
      user_id: entry.userId || null,
      correlation_id: entry.correlationId,
      stage: entry.stage,
      status: entry.status,
      input_metadata: entry.inputMetadata || null,
      output_metadata: entry.outputMetadata || null,
      error_details: entry.errorDetails || null,
      duration_ms: entry.durationMs || null,
      chunks_processed: entry.chunksProcessed || null,
      chunks_created: entry.chunksCreated || null,
      model_used: entry.modelUsed || null,
      tokens_used: entry.tokensUsed || null
    })

    if (error) {
      console.error("[rag-pipeline-log] Failed to save:", error.message)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[rag-pipeline-log] Error:", msg)
  }
}

// =============================================================================
// WITH RAG LOGGING (WRAPPER)
// =============================================================================

/**
 * Wraps an async function with timing and logging.
 * Logs 'started' before execution, 'completed'/'failed' after with duration.
 * Returns the function result (or throws on error after logging).
 */
export async function withRagLogging<T>(
  correlationId: string,
  stage: string,
  fn: () => Promise<T>,
  metadata?: Partial<RagLogEntry>
): Promise<T> {
  // Log 'started' (fire-and-forget - don't await)
  logRagStage({
    correlationId,
    stage,
    status: "started",
    ...metadata
  })

  const startTime = Date.now()

  try {
    const result = await fn()

    // Log 'completed' (fire-and-forget - don't await)
    logRagStage({
      correlationId,
      stage,
      status: "completed",
      durationMs: Date.now() - startTime,
      ...metadata
    })

    return result
  } catch (error) {
    const errorDetails: Record<string, unknown> = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }

    // Log 'failed' (fire-and-forget - don't await)
    logRagStage({
      correlationId,
      stage,
      status: "failed",
      durationMs: Date.now() - startTime,
      errorDetails,
      ...metadata
    })

    throw error
  }
}
