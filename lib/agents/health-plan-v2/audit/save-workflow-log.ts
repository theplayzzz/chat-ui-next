/**
 * Workflow Logger - Salva logs de execução do agente v2
 *
 * Fire-and-forget: erros são logados mas não bloqueiam a resposta.
 * Salva na tabela `agent_workflow_logs` para debugging e análise.
 */

import { createClient } from "@supabase/supabase-js"
import type { HealthPlanState } from "../state/state-annotation"

// =============================================================================
// TYPES
// =============================================================================

export interface WorkflowLogParams {
  workspaceId: string
  userId: string
  chatId: string
  assistantId: string
  result: HealthPlanState
  executionTimeMs: number
  checkpointerEnabled: boolean
  langsmithRunId?: string
  routeDecision?: {
    capability: string
    reason: string
    redirected: boolean
  }
  nodeTrace?: NodeTraceEntry[]
}

export interface NodeTraceEntry {
  node: string
  durationMs?: number
  inputSummary?: string
  outputSummary?: string
}

export interface DebugPayload {
  intent: string | null
  confidence: number
  clientInfo: Record<string, unknown>
  clientInfoVersion: number
  routedCapability?: string
  routeReason?: string
  wasRedirected?: boolean
  executionTimeMs: number
  searchResultsCount: number
  hasAnalysis: boolean
  hasRecommendation: boolean
  loopIterations: number
  errors: unknown[]
  checkpointerEnabled: boolean
  langsmithRunId?: string
  langsmithTraceUrl?: string
  nodeTrace?: NodeTraceEntry[]
  timestamp: string
}

// =============================================================================
// HELPERS
// =============================================================================

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables for workflow log")
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// =============================================================================
// BUILD DEBUG PAYLOAD
// =============================================================================

/**
 * Builds the debug payload to embed in the stream and store in DB
 */
export function buildDebugPayload(params: WorkflowLogParams): DebugPayload {
  const { result, executionTimeMs, checkpointerEnabled, routeDecision } = params

  const langsmithRunId = params.langsmithRunId || undefined
  const langsmithTraceUrl = langsmithRunId
    ? `https://smith.langchain.com/runs/${langsmithRunId}`
    : undefined

  return {
    intent: result.lastIntent || null,
    confidence: result.lastIntentConfidence || 0,
    clientInfo: (result.clientInfo || {}) as Record<string, unknown>,
    clientInfoVersion: result.clientInfoVersion || 0,
    routedCapability: routeDecision?.capability,
    routeReason: routeDecision?.reason,
    wasRedirected: routeDecision?.redirected,
    executionTimeMs,
    searchResultsCount: result.searchResults?.length || 0,
    hasAnalysis:
      result.compatibilityAnalysis !== null &&
      result.compatibilityAnalysis !== undefined,
    hasRecommendation:
      result.recommendation !== null && result.recommendation !== undefined,
    loopIterations: result.loopIterations || 0,
    errors: result.errors || [],
    checkpointerEnabled,
    langsmithRunId,
    langsmithTraceUrl,
    nodeTrace: params.nodeTrace || [],
    timestamp: new Date().toISOString()
  }
}

// =============================================================================
// SAVE LOG (FIRE-AND-FORGET)
// =============================================================================

/**
 * Saves workflow execution log to the database.
 * Non-blocking: errors are logged but don't affect the response.
 */
export async function saveWorkflowLog(
  params: WorkflowLogParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSupabaseAdmin()
    const { result, routeDecision } = params

    const debugPayload = buildDebugPayload(params)

    const { error } = await supabase.from("agent_workflow_logs").insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      chat_id: params.chatId,
      assistant_id: params.assistantId,
      langsmith_run_id: debugPayload.langsmithRunId || null,
      langsmith_trace_url: debugPayload.langsmithTraceUrl || null,
      intent: result.lastIntent || null,
      intent_confidence: result.lastIntentConfidence || 0,
      routed_capability: routeDecision?.capability || null,
      was_redirected: routeDecision?.redirected || false,
      redirect_reason: routeDecision?.reason || null,
      client_info: result.clientInfo || {},
      client_info_version: result.clientInfoVersion || 0,
      search_results_count: result.searchResults?.length || 0,
      has_compatibility_analysis:
        result.compatibilityAnalysis !== null &&
        result.compatibilityAnalysis !== undefined,
      has_recommendation:
        result.recommendation !== null && result.recommendation !== undefined,
      loop_iterations: result.loopIterations || 0,
      execution_time_ms: params.executionTimeMs,
      checkpointer_enabled: params.checkpointerEnabled,
      errors: result.errors || [],
      node_trace: params.nodeTrace || [],
      response_preview: (result.currentResponse || "").slice(0, 500)
    })

    if (error) {
      console.error("[workflow-log] Failed to save:", error.message)
      return { success: false, error: error.message }
    }

    console.log("[workflow-log] Saved successfully")
    return { success: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[workflow-log] Error:", msg)
    return { success: false, error: msg }
  }
}
