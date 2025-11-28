/**
 * Health Plan Session Manager
 *
 * Gerencia o estado de sessões do workflow de recomendação de planos de saúde.
 * Persiste estado entre steps usando Supabase com TTL de 1 hora.
 *
 * Referência: PRD RF-008, Task #10.2
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"
import type { PartialClientInfo } from "./schemas/client-info-schema"
import type { SearchHealthPlansResponse, ERPPriceResult } from "./types"
import type { RankedAnalysis } from "./analyze-compatibility"
import type { GenerateRecommendationResult } from "./schemas/recommendation-schemas"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Step numbers in the workflow
 */
export type WorkflowStep = 1 | 2 | 3 | 4 | 5

/**
 * Step names for logging and display
 */
export const STEP_NAMES: Record<WorkflowStep, string> = {
  1: "extractClientInfo",
  2: "searchHealthPlans",
  3: "analyzeCompatibility",
  4: "fetchERPPrices",
  5: "generateRecommendation"
}

/**
 * Error logged during workflow execution
 */
export interface SessionError {
  step: number
  stepName: string
  error: string
  timestamp: string
  retryable: boolean
}

/**
 * Complete session state
 */
export interface SessionState {
  sessionId: string
  workspaceId: string
  userId: string
  currentStep: WorkflowStep
  clientInfo?: PartialClientInfo
  searchResults?: SearchHealthPlansResponse
  compatibilityAnalysis?: RankedAnalysis
  erpPrices?: ERPPriceResult
  recommendation?: GenerateRecommendationResult
  errors: SessionError[]
  startedAt: string
  lastUpdatedAt: string
  completedAt?: string
  expiresAt: string
}

/**
 * Partial update to session state
 */
export type SessionUpdate = Partial<
  Omit<SessionState, "sessionId" | "workspaceId" | "userId" | "startedAt">
>

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates a Supabase admin client for server-side operations
 */
function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * Maps database row to SessionState
 */
function mapRowToSession(row: any): SessionState {
  return {
    sessionId: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    currentStep: row.current_step as WorkflowStep,
    clientInfo: row.client_info || undefined,
    searchResults: row.search_results || undefined,
    compatibilityAnalysis: row.compatibility_analysis || undefined,
    erpPrices: row.erp_prices || undefined,
    recommendation: row.recommendation || undefined,
    errors: row.errors || [],
    startedAt: row.started_at,
    lastUpdatedAt: row.last_updated_at,
    completedAt: row.completed_at || undefined,
    expiresAt: row.expires_at
  }
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Creates a new session for health plan workflow
 *
 * @param workspaceId - The workspace ID
 * @param userId - The user ID
 * @returns The created session state
 */
export async function createSession(
  workspaceId: string,
  userId: string
): Promise<SessionState> {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from("health_plan_sessions")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      current_step: 1,
      errors: []
    })
    .select("*")
    .single()

  if (error) {
    console.error("[session-manager] Failed to create session:", error)
    throw new Error(`Failed to create session: ${error.message}`)
  }

  console.log(
    `[session-manager] Created session ${data.id} for workspace ${workspaceId}`
  )

  return mapRowToSession(data)
}

/**
 * Gets a session by ID
 *
 * @param sessionId - The session ID
 * @returns The session state or null if not found/expired
 */
export async function getSession(
  sessionId: string
): Promise<SessionState | null> {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from("health_plan_sessions")
    .select("*")
    .eq("id", sessionId)
    .gt("expires_at", new Date().toISOString()) // Only non-expired sessions
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      console.log(`[session-manager] Session ${sessionId} not found or expired`)
      return null
    }
    console.error("[session-manager] Failed to get session:", error)
    throw new Error(`Failed to get session: ${error.message}`)
  }

  return mapRowToSession(data)
}

/**
 * Gets a session by ID with ownership validation
 *
 * @param sessionId - The session ID
 * @param workspaceId - The workspace ID for ownership validation
 * @param userId - The user ID for ownership validation
 * @returns The session state or null if not found/expired/unauthorized
 */
export async function getSessionById(
  sessionId: string,
  workspaceId: string,
  userId: string
): Promise<SessionState | null> {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from("health_plan_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId) // Ownership validation
    .eq("user_id", userId) // Ownership validation
    .gt("expires_at", new Date().toISOString())
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      console.log(
        `[session-manager] Session ${sessionId} not found, expired, or unauthorized`
      )
      return null
    }
    console.error("[session-manager] Failed to get session by ID:", error)
    throw new Error(`Failed to get session: ${error.message}`)
  }

  console.log(
    `[session-manager] Found session ${sessionId} with ownership validated`
  )
  return mapRowToSession(data)
}

/**
 * Gets active session for user/workspace (not completed, not expired)
 *
 * @param workspaceId - The workspace ID
 * @param userId - The user ID
 * @returns The active session or null
 */
export async function getActiveSession(
  workspaceId: string,
  userId: string
): Promise<SessionState | null> {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from("health_plan_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .is("completed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    console.error("[session-manager] Failed to get active session:", error)
    throw new Error(`Failed to get active session: ${error.message}`)
  }

  return mapRowToSession(data)
}

/**
 * Updates a session with partial data
 *
 * @param sessionId - The session ID
 * @param updates - Partial updates to apply
 * @returns The updated session state
 */
export async function updateSession(
  sessionId: string,
  updates: SessionUpdate
): Promise<SessionState> {
  const supabase = createSupabaseAdmin()

  // Map updates to database columns
  const dbUpdates: Record<string, any> = {}

  if (updates.currentStep !== undefined) {
    dbUpdates.current_step = updates.currentStep
  }
  if (updates.clientInfo !== undefined) {
    dbUpdates.client_info = updates.clientInfo
  }
  if (updates.searchResults !== undefined) {
    dbUpdates.search_results = updates.searchResults
  }
  if (updates.compatibilityAnalysis !== undefined) {
    dbUpdates.compatibility_analysis = updates.compatibilityAnalysis
  }
  if (updates.erpPrices !== undefined) {
    dbUpdates.erp_prices = updates.erpPrices
  }
  if (updates.recommendation !== undefined) {
    dbUpdates.recommendation = updates.recommendation
  }
  if (updates.errors !== undefined) {
    dbUpdates.errors = updates.errors
  }
  if (updates.completedAt !== undefined) {
    dbUpdates.completed_at = updates.completedAt
  }

  const { data, error } = await supabase
    .from("health_plan_sessions")
    .update(dbUpdates)
    .eq("id", sessionId)
    .select("*")
    .single()

  if (error) {
    console.error("[session-manager] Failed to update session:", error)
    throw new Error(`Failed to update session: ${error.message}`)
  }

  console.log(
    `[session-manager] Updated session ${sessionId}, step: ${data.current_step}`
  )

  return mapRowToSession(data)
}

/**
 * Adds an error to the session
 *
 * @param sessionId - The session ID
 * @param step - The step where error occurred
 * @param errorMessage - The error message
 * @param retryable - Whether the error is retryable
 */
export async function addSessionError(
  sessionId: string,
  step: WorkflowStep,
  errorMessage: string,
  retryable: boolean = false
): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) {
    console.warn(
      `[session-manager] Cannot add error - session ${sessionId} not found`
    )
    return
  }

  const newError: SessionError = {
    step,
    stepName: STEP_NAMES[step],
    error: errorMessage,
    timestamp: new Date().toISOString(),
    retryable
  }

  const errors = [...session.errors, newError]

  await updateSession(sessionId, { errors })

  console.log(
    `[session-manager] Added error to session ${sessionId}: ${errorMessage}`
  )
}

/**
 * Marks a session as completed
 *
 * @param sessionId - The session ID
 * @param recommendation - The final recommendation
 */
export async function completeSession(
  sessionId: string,
  recommendation: GenerateRecommendationResult
): Promise<void> {
  await updateSession(sessionId, {
    currentStep: 5,
    recommendation,
    completedAt: new Date().toISOString()
  })

  console.log(`[session-manager] Completed session ${sessionId}`)
}

/**
 * Cleans up expired sessions
 *
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from("health_plan_sessions")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id")

  if (error) {
    console.error("[session-manager] Failed to cleanup sessions:", error)
    throw new Error(`Failed to cleanup sessions: ${error.message}`)
  }

  const count = data?.length || 0
  if (count > 0) {
    console.log(`[session-manager] Cleaned up ${count} expired sessions`)
  }

  return count
}

/**
 * Extends session expiration by 1 hour
 *
 * @param sessionId - The session ID
 */
export async function extendSession(sessionId: string): Promise<void> {
  const supabase = createSupabaseAdmin()

  const newExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from("health_plan_sessions")
    .update({ expires_at: newExpiry })
    .eq("id", sessionId)

  if (error) {
    console.error("[session-manager] Failed to extend session:", error)
    throw new Error(`Failed to extend session: ${error.message}`)
  }

  console.log(`[session-manager] Extended session ${sessionId} to ${newExpiry}`)
}

/**
 * Gets or creates a session for user/workspace
 * If sessionId is provided, attempts to resume that specific session with ownership validation.
 * Otherwise, returns existing active session if available, or creates new one.
 *
 * @param workspaceId - The workspace ID
 * @param userId - The user ID
 * @param sessionId - Optional specific session ID to resume (with ownership validation)
 * @returns Session state
 */
export async function getOrCreateSession(
  workspaceId: string,
  userId: string,
  sessionId?: string
): Promise<SessionState> {
  // If sessionId provided, try to resume that specific session with ownership validation
  if (sessionId) {
    const existing = await getSessionById(sessionId, workspaceId, userId)
    if (existing) {
      console.log(
        `[session-manager] Resuming specific session ${existing.sessionId}`
      )
      await extendSession(existing.sessionId)
      return existing
    }
    // If sessionId was provided but not found/unauthorized, log and create new
    console.log(
      `[session-manager] Requested session ${sessionId} not found or unauthorized, creating new`
    )
  }

  // Try to find any active session for this user/workspace
  const active = await getActiveSession(workspaceId, userId)
  if (active) {
    console.log(`[session-manager] Resuming active session ${active.sessionId}`)
    await extendSession(active.sessionId)
    return active
  }

  // No existing session found, create new one
  return createSession(workspaceId, userId)
}

/**
 * Checks if client info is complete enough to proceed
 *
 * @param clientInfo - The partial client info
 * @returns Whether required fields are present
 */
export function isClientInfoComplete(clientInfo?: PartialClientInfo): boolean {
  if (!clientInfo) return false

  // Required fields as per PRD
  return !!(
    clientInfo.age &&
    clientInfo.city &&
    clientInfo.state &&
    clientInfo.budget
  )
}

/**
 * Gets a summary of session progress
 *
 * @param session - The session state
 * @returns Human-readable progress summary
 */
export function getSessionProgress(session: SessionState): string {
  const stepLabels: Record<WorkflowStep, string> = {
    1: "Coletando informações",
    2: "Buscando planos",
    3: "Analisando compatibilidade",
    4: "Consultando preços",
    5: "Gerando recomendação"
  }

  if (session.completedAt) {
    return "Recomendação concluída"
  }

  return stepLabels[session.currentStep]
}
