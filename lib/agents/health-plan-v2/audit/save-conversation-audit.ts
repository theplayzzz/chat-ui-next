/**
 * Audit Logger v2 para Health Plan Agent (LangGraph)
 *
 * Salva audit de conversas em `client_recommendations` com compliance LGPD.
 * Fire-and-forget: erros são logados mas não bloqueiam a resposta.
 *
 * Reutiliza padrão de lib/tools/health-plan/audit-logger.ts (v1)
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-011 (Finalização), Fase 9
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"
import type { HealthPlanState } from "../state/state-annotation"

// =============================================================================
// TYPES
// =============================================================================

export interface SaveConversationAuditParams {
  state: HealthPlanState
  farewellMessage: string
}

export interface SaveConversationAuditResult {
  success: boolean
  auditId?: string
  error?: string
}

// =============================================================================
// CONFIG
// =============================================================================

const DEFAULT_RETENTION_YEARS = 1
const DEFAULT_ANONYMIZE_AFTER_DAYS = 90

// =============================================================================
// HELPERS
// =============================================================================

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

async function getHealthPlanSystemId(): Promise<string | null> {
  try {
    const supabase = createSupabaseAdmin()

    const { data, error } = await supabase
      .from("recommendation_systems")
      .select("id")
      .eq("system_name", "health_plan_agent")
      .single()

    if (error || !data) return null
    return data.id
  } catch {
    return null
  }
}

function calculateRetentionUntil(retentionYears: number): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() + retentionYears)
  return date.toISOString()
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Salva audit de conversa no encerramento.
 *
 * Non-blocking: try/catch completo, loga erro mas não falha.
 * Insere em `client_recommendations` com campos LGPD.
 */
export async function saveConversationAuditV2(
  params: SaveConversationAuditParams
): Promise<SaveConversationAuditResult> {
  const startTime = Date.now()

  try {
    const { state, farewellMessage } = params
    const clientInfo = state.clientInfo || {}

    // Get system ID
    const systemId = await getHealthPlanSystemId()

    if (!systemId) {
      console.warn(
        "[audit-v2] health_plan_agent system not found in recommendation_systems"
      )
      return { success: false, error: "System not configured" }
    }

    // Prepare analyzed data summary
    const analyzedData = {
      search_results_count: state.searchResults?.length || 0,
      plans_analyzed_count: state.compatibilityAnalysis?.analyses?.length || 0,
      top_plans: (state.compatibilityAnalysis?.analyses || [])
        .slice(0, 5)
        .map(p => ({
          planId: p.planId,
          score: p.score,
          compatibility: p.compatibility
        })),
      rag_context_available: Boolean(state.ragAnalysisContext),
      conversation_messages_count: Array.isArray(state.messages)
        ? state.messages.length
        : 0,
      erp_prices_requested: state.pricesRequested
    }

    // Prepare recommended item
    const recommendedItem = state.recommendation
      ? {
          markdown_preview: state.recommendation.markdown?.substring(0, 500),
          topPlanId: state.recommendation.topPlanId,
          alternativeIds: state.recommendation.alternativeIds,
          highlights: state.recommendation.highlights?.slice(0, 3),
          warnings: state.recommendation.warnings?.slice(0, 3)
        }
      : null

    // Confidence score from top analysis
    const topAnalysis = state.compatibilityAnalysis?.analyses?.[0]
    const confidenceScore = topAnalysis ? topAnalysis.score / 100 : null

    // Reasoning
    const reasoning =
      state.compatibilityAnalysis?.reasoning ||
      state.compatibilityAnalysis?.topRecommendation ||
      "Conversa finalizada pelo usuário"

    // Retention
    const retentionUntil = calculateRetentionUntil(DEFAULT_RETENTION_YEARS)

    // Insert
    const supabase = createSupabaseAdmin()

    const { data, error } = await supabase
      .from("client_recommendations")
      .insert({
        workspace_id: state.workspaceId,
        user_id: state.userId,
        recommendation_system_id: systemId,
        client_info: clientInfo as any,
        analyzed_data: analyzedData as any,
        recommended_item: recommendedItem as any,
        reasoning,
        confidence_score: confidenceScore,
        status: "active",
        // LGPD fields
        retention_until: retentionUntil,
        anonymization_level: "partial",
        consent_given: true,
        consent_timestamp: new Date().toISOString(),
        data_subject_rights_metadata: {}
      })
      .select("id")
      .single()

    if (error) {
      console.error("[audit-v2] Failed to save audit record:", error)
      return { success: false, error: error.message }
    }

    const duration = Date.now() - startTime
    console.log(`[audit-v2] Saved audit record ${data.id} in ${duration}ms`)

    return { success: true, auditId: data.id }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[audit-v2] Error saving audit:", errorMessage)
    return { success: false, error: errorMessage }
  }
}
