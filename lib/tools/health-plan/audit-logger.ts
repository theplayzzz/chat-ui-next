/**
 * Audit Logger para compliance LGPD
 * Task 13.3 - Sistema automático de registro de recomendações
 *
 * Registra automaticamente cada recomendação gerada com:
 * - Anonimização automática baseada em configuração do workspace
 * - Campos LGPD (retention_until, consent, anonymization_level)
 * - LangSmith run ID para rastreabilidade
 *
 * Referência: PRD RF-012, Task #13
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"
import type { PartialClientInfo } from "./schemas/client-info-schema"
import type { PlanCompatibilityAnalysis } from "./analyze-compatibility"
import type { ERPPriceResult } from "./types"
import { anonymizeClientInfo } from "./anonymization"
import type { AnonymizationLevel } from "./schemas/anonymization-schemas"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input parameters for saveRecommendationAudit
 */
export interface SaveAuditParams {
  workspaceId: string
  userId: string
  clientInfo: PartialClientInfo
  analyzedPlans: PlanCompatibilityAnalysis[]
  recommendedPlan: PlanCompatibilityAnalysis | null
  reasoning: string
  langsmithRunId?: string
  consentGiven: boolean
  erpPrices?: ERPPriceResult | null
  searchResultsCount?: number
}

/**
 * Result of audit save operation
 */
export interface SaveAuditResult {
  success: boolean
  auditId?: string
  error?: string
  auditStatus: "success" | "failed"
}

/**
 * Workspace audit configuration from database
 */
export interface WorkspaceAuditConfig {
  workspace_id: string
  retention_years: number
  auto_anonymize_after_days: number
  hard_delete_enabled: boolean
  default_anonymization_level?: AnonymizationLevel
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Default audit configuration (used when workspace config doesn't exist)
 */
const DEFAULT_AUDIT_CONFIG: Omit<WorkspaceAuditConfig, "workspace_id"> = {
  retention_years: 1, // 1 ano conforme decisão do usuário
  auto_anonymize_after_days: 90, // 90 dias conforme decisão do usuário
  hard_delete_enabled: false, // Soft delete como padrão
  default_anonymization_level: "partial"
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a Supabase admin client
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
 * Gets workspace audit configuration
 * Falls back to defaults if not configured
 */
export async function getWorkspaceAuditConfig(
  workspaceId: string
): Promise<WorkspaceAuditConfig> {
  try {
    const supabase = createSupabaseAdmin()

    const { data, error } = await supabase
      .from("workspace_audit_config")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single()

    if (error || !data) {
      // Return defaults
      return {
        workspace_id: workspaceId,
        ...DEFAULT_AUDIT_CONFIG
      }
    }

    return {
      workspace_id: data.workspace_id,
      retention_years:
        data.retention_years ?? DEFAULT_AUDIT_CONFIG.retention_years,
      auto_anonymize_after_days:
        data.auto_anonymize_after_days ??
        DEFAULT_AUDIT_CONFIG.auto_anonymize_after_days,
      hard_delete_enabled:
        data.hard_delete_enabled ?? DEFAULT_AUDIT_CONFIG.hard_delete_enabled,
      default_anonymization_level:
        (data as any).default_anonymization_level ??
        DEFAULT_AUDIT_CONFIG.default_anonymization_level
    }
  } catch (error) {
    console.warn(
      "[audit-logger] Failed to get workspace config, using defaults:",
      error
    )
    return {
      workspace_id: workspaceId,
      ...DEFAULT_AUDIT_CONFIG
    }
  }
}

/**
 * Gets the health_plan_agent system ID
 */
async function getHealthPlanSystemId(): Promise<string | null> {
  try {
    const supabase = createSupabaseAdmin()

    const { data, error } = await supabase
      .from("recommendation_systems")
      .select("id")
      .eq("system_name", "health_plan_agent")
      .single()

    if (error || !data) {
      return null
    }

    return data.id
  } catch {
    return null
  }
}

/**
 * Calculates retention_until date based on config
 */
function calculateRetentionUntil(retentionYears: number): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() + retentionYears)
  return date.toISOString()
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Saves a recommendation to the audit table with LGPD compliance
 *
 * Features:
 * - Automatic anonymization based on workspace config
 * - Calculates retention_until from config
 * - Records consent timestamp
 * - Non-blocking (errors logged but don't fail workflow)
 *
 * @param params - Audit parameters
 * @returns Result with audit ID or error
 */
export async function saveRecommendationAudit(
  params: SaveAuditParams
): Promise<SaveAuditResult> {
  const startTime = Date.now()

  try {
    const {
      workspaceId,
      userId,
      clientInfo,
      analyzedPlans,
      recommendedPlan,
      reasoning,
      langsmithRunId,
      consentGiven,
      erpPrices,
      searchResultsCount
    } = params

    // 1. Get workspace audit configuration
    const config = await getWorkspaceAuditConfig(workspaceId)

    // 2. Determine anonymization level
    const anonymizationLevel = config.default_anonymization_level || "partial"

    // 3. Apply anonymization to client info
    const anonymizedClientInfo = anonymizeClientInfo(
      clientInfo,
      anonymizationLevel
    )

    // 4. Calculate retention_until
    const retentionUntil = calculateRetentionUntil(config.retention_years)

    // 5. Get system ID
    const systemId = await getHealthPlanSystemId()

    if (!systemId) {
      console.warn(
        "[audit-logger] health_plan_agent system not found in recommendation_systems"
      )
      return {
        success: false,
        error: "System not configured",
        auditStatus: "failed"
      }
    }

    // 6. Prepare analyzed_data (summarized for storage)
    const analyzedData = {
      search_results_count: searchResultsCount || 0,
      plans_analyzed_count: analyzedPlans.length,
      top_plans: analyzedPlans.slice(0, 5).map(p => ({
        planId: p.planId,
        planName: p.planName,
        score: p.score.overall,
        operadora: p.operadora
      })),
      erp_prices_available: erpPrices?.success || false,
      erp_source: erpPrices?.source || "none"
    }

    // 7. Prepare recommended_item (top plan summary)
    const recommendedItem = recommendedPlan
      ? {
          planId: recommendedPlan.planId,
          planName: recommendedPlan.planName,
          operadora: recommendedPlan.operadora,
          score: recommendedPlan.score,
          pros: recommendedPlan.pros?.slice(0, 3),
          cons: recommendedPlan.cons?.slice(0, 3)
        }
      : null

    // 8. Insert audit record
    const supabase = createSupabaseAdmin()

    const { data, error } = await supabase
      .from("client_recommendations")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        recommendation_system_id: systemId,
        client_info: anonymizedClientInfo as any,
        analyzed_data: analyzedData as any,
        recommended_item: recommendedItem as any,
        reasoning: reasoning,
        confidence_score: recommendedPlan?.score?.overall
          ? recommendedPlan.score.overall / 100
          : null,
        langsmith_run_id: langsmithRunId || null,
        status: "active",
        // LGPD fields
        retention_until: retentionUntil,
        anonymization_level: anonymizationLevel,
        consent_given: consentGiven,
        consent_timestamp: consentGiven ? new Date().toISOString() : null,
        data_subject_rights_metadata: {}
      })
      .select("id")
      .single()

    if (error) {
      console.error("[audit-logger] Failed to save audit record:", error)
      return {
        success: false,
        error: error.message,
        auditStatus: "failed"
      }
    }

    const duration = Date.now() - startTime
    console.log(
      `[audit-logger] Saved audit record ${data.id} in ${duration}ms (anonymization: ${anonymizationLevel})`
    )

    return {
      success: true,
      auditId: data.id,
      auditStatus: "success"
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[audit-logger] Error saving audit record:", errorMessage)

    return {
      success: false,
      error: errorMessage,
      auditStatus: "failed"
    }
  }
}

/**
 * Updates audit record with additional data (e.g., user feedback)
 */
export async function updateAuditRecord(
  auditId: string,
  updates: {
    status?: string
    data_subject_rights_metadata?: Record<string, any>
  }
): Promise<boolean> {
  try {
    const supabase = createSupabaseAdmin()

    const { error } = await supabase
      .from("client_recommendations")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", auditId)

    if (error) {
      console.error("[audit-logger] Failed to update audit record:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("[audit-logger] Error updating audit record:", error)
    return false
  }
}

/**
 * Records exercise of LGPD data subject rights
 */
export async function recordDataSubjectRight(
  auditId: string,
  rightType: "portability" | "deletion" | "correction" | "access",
  requestedAt: string,
  fulfilledAt?: string
): Promise<boolean> {
  try {
    const supabase = createSupabaseAdmin()

    // Get current metadata
    const { data, error: fetchError } = await supabase
      .from("client_recommendations")
      .select("data_subject_rights_metadata")
      .eq("id", auditId)
      .single()

    if (fetchError || !data) {
      return false
    }

    // Update metadata
    const currentMetadata =
      (data.data_subject_rights_metadata as Record<string, any>) || {}
    const newMetadata = {
      ...currentMetadata,
      [rightType]: {
        requested_at: requestedAt,
        fulfilled_at: fulfilledAt || null,
        status: fulfilledAt ? "fulfilled" : "pending"
      }
    }

    const { error: updateError } = await supabase
      .from("client_recommendations")
      .update({
        data_subject_rights_metadata: newMetadata,
        updated_at: new Date().toISOString()
      })
      .eq("id", auditId)

    if (updateError) {
      console.error(
        "[audit-logger] Failed to record data subject right:",
        updateError
      )
      return false
    }

    console.log(
      `[audit-logger] Recorded ${rightType} right for audit ${auditId}`
    )
    return true
  } catch (error) {
    console.error("[audit-logger] Error recording data subject right:", error)
    return false
  }
}
