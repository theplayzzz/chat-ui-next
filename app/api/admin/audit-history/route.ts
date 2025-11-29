/**
 * API Route: /api/admin/audit-history
 * Task 13.4 - Interface de consulta de historico de auditoria
 *
 * Lista recomendacoes auditadas com filtros e paginacao
 *
 * Requer: workspace owner ou admin global
 * RLS garante isolamento por workspace
 *
 * Referencia: PRD RF-012, Task #13
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateUserAuthentication } from "@/lib/server/workspace-authorization"
import { isUserAdmin } from "@/lib/server/admin-helpers"
import type { Database } from "@/supabase/types"

// =============================================================================
// TYPES
// =============================================================================

interface AuditHistoryParams {
  workspaceId?: string
  startDate?: string
  endDate?: string
  status?: string
  anonymizationLevel?: string
  page?: number
  limit?: number
}

interface AuditRecordResponse {
  id: string
  created_at: string
  workspace_id: string
  workspace_name?: string
  user_email_partial?: string
  client_age_range?: string
  client_state?: string
  analyzed_plans_count: number
  recommended_plan_name?: string
  confidence_score?: number
  reasoning_preview?: string
  langsmith_run_id?: string
  status?: string
  anonymization_level?: string
  consent_given: boolean
  retention_until?: string
}

// =============================================================================
// HELPER FUNCTIONS
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

/**
 * Extracts age range from client_info JSONB
 */
function extractAgeRange(clientInfo: any): string | undefined {
  if (!clientInfo) return undefined

  // Check for ageRange (anonymized full)
  if (clientInfo.ageRange) return clientInfo.ageRange

  // Check for age (non-anonymized or partial)
  if (clientInfo.age) {
    const age = clientInfo.age
    if (age < 18) return "0-17"
    if (age < 30) return "18-29"
    if (age < 40) return "30-39"
    if (age < 50) return "40-49"
    if (age < 60) return "50-59"
    if (age < 70) return "60-69"
    if (age < 80) return "70-79"
    return "80+"
  }

  return undefined
}

/**
 * Extracts partial email for display (LGPD compliant)
 */
function extractPartialEmail(userId: string): string {
  // Only show first 3 chars + masked domain
  if (!userId) return "***"
  return `${userId.substring(0, 8)}...`
}

/**
 * Extracts recommended plan name from recommended_item JSONB
 */
function extractRecommendedPlanName(recommendedItem: any): string | undefined {
  if (!recommendedItem) return undefined
  return recommendedItem.planName || recommendedItem.plan_name || undefined
}

/**
 * Extracts analyzed plans count from analyzed_data JSONB
 */
function extractAnalyzedPlansCount(analyzedData: any): number {
  if (!analyzedData) return 0
  return (
    analyzedData.plans_analyzed_count || analyzedData.plansAnalyzedCount || 0
  )
}

// =============================================================================
// API HANDLERS
// =============================================================================

/**
 * GET /api/admin/audit-history
 *
 * List audit records with filters and pagination
 *
 * Query params:
 * - workspaceId: Filter by workspace (required for non-global admins)
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - status: Filter by status (active, deleted, archived)
 * - anonymizationLevel: Filter by anonymization level
 * - page: Page number (1-indexed)
 * - limit: Records per page (max 100)
 */
export async function GET(request: NextRequest) {
  try {
    // Validate user authentication
    const userId = await validateUserAuthentication()

    // Parse query params
    const { searchParams } = new URL(request.url)
    const params: AuditHistoryParams = {
      workspaceId: searchParams.get("workspaceId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      status: searchParams.get("status") || undefined,
      anonymizationLevel: searchParams.get("anonymizationLevel") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: Math.min(parseInt(searchParams.get("limit") || "20"), 100)
    }

    // Require workspaceId
    if (!params.workspaceId) {
      return NextResponse.json(
        { error: "workspaceId query parameter is required" },
        { status: 400 }
      )
    }

    // Check if user is admin of the workspace
    const isAdmin = await isUserAdmin(userId, params.workspaceId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required" },
        { status: 403 }
      )
    }

    const supabase = createSupabaseAdmin()

    // Build query
    let query = supabase
      .from("client_recommendations")
      .select(
        `
        id,
        created_at,
        workspace_id,
        user_id,
        client_info,
        analyzed_data,
        recommended_item,
        confidence_score,
        reasoning,
        langsmith_run_id,
        status,
        anonymization_level,
        consent_given,
        retention_until
      `,
        { count: "exact" }
      )
      .eq("workspace_id", params.workspaceId)
      .order("created_at", { ascending: false })

    // Apply filters
    if (params.startDate) {
      query = query.gte("created_at", params.startDate)
    }

    if (params.endDate) {
      query = query.lte("created_at", params.endDate)
    }

    if (params.status) {
      query = query.eq("status", params.status)
    }

    if (params.anonymizationLevel) {
      query = query.eq("anonymization_level", params.anonymizationLevel)
    }

    // Apply pagination
    const offset = (params.page! - 1) * params.limit!
    query = query.range(offset, offset + params.limit! - 1)

    const { data, error, count } = await query

    if (error) {
      console.error("[API Audit History] Query error:", error)
      return NextResponse.json(
        { error: "Failed to fetch audit records" },
        { status: 500 }
      )
    }

    // Transform records for response (anonymize sensitive data)
    const records: AuditRecordResponse[] = (data || []).map(record => ({
      id: record.id,
      created_at: record.created_at || "",
      workspace_id: record.workspace_id,
      user_email_partial: extractPartialEmail(record.user_id),
      client_age_range: extractAgeRange(record.client_info),
      client_state: (record.client_info as any)?.state,
      analyzed_plans_count: extractAnalyzedPlansCount(record.analyzed_data),
      recommended_plan_name: extractRecommendedPlanName(
        record.recommended_item
      ),
      confidence_score: record.confidence_score || undefined,
      reasoning_preview: record.reasoning
        ? record.reasoning.substring(0, 200) +
          (record.reasoning.length > 200 ? "..." : "")
        : undefined,
      langsmith_run_id: record.langsmith_run_id || undefined,
      status: record.status || undefined,
      anonymization_level: record.anonymization_level || undefined,
      consent_given: record.consent_given,
      retention_until: record.retention_until || undefined
    }))

    return NextResponse.json(
      {
        records,
        pagination: {
          page: params.page,
          limit: params.limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / params.limit!)
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API Audit History] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/audit-history/[id]
 *
 * Get single audit record details (full data)
 */
export async function POST(request: NextRequest) {
  try {
    // Validate user authentication
    const userId = await validateUserAuthentication()

    // Parse request body
    const body = await request.json()
    const { recordId, workspaceId } = body

    if (!recordId || !workspaceId) {
      return NextResponse.json(
        { error: "recordId and workspaceId are required" },
        { status: 400 }
      )
    }

    // Check if user is admin
    const isAdmin = await isUserAdmin(userId, workspaceId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required" },
        { status: 403 }
      )
    }

    const supabase = createSupabaseAdmin()

    const { data, error } = await supabase
      .from("client_recommendations")
      .select("*")
      .eq("id", recordId)
      .eq("workspace_id", workspaceId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 })
    }

    return NextResponse.json({ record: data }, { status: 200 })
  } catch (error: any) {
    console.error("[API Audit History] Error fetching record:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
