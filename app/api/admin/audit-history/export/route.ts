/**
 * API Route: /api/admin/audit-history/export
 * Task 13.5 - Exportacao CSV com compliance LGPD
 *
 * Exporta historico de auditoria em formato CSV
 *
 * Features:
 * - Rate limiting: 1 export/minuto/usuario
 * - Limite: 10.000 registros por export
 * - Campos anonimizados conforme LGPD
 * - UTF-8 BOM para compatibilidade Excel
 *
 * Referencia: PRD RF-012, Task #13
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateUserAuthentication } from "@/lib/server/workspace-authorization"
import { isUserAdmin } from "@/lib/server/admin-helpers"
import type { Database } from "@/supabase/types"

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_EXPORT_RECORDS = 10000
const RATE_LIMIT_SECONDS = 60

// Simple in-memory rate limiting (in production, use Redis)
const exportRateLimits: Map<string, number> = new Map()

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
 * Check rate limit for user
 */
function checkRateLimit(userId: string): boolean {
  const lastExport = exportRateLimits.get(userId)
  const now = Date.now()

  if (lastExport && now - lastExport < RATE_LIMIT_SECONDS * 1000) {
    return false
  }

  exportRateLimits.set(userId, now)

  // Clean up old entries (older than 5 minutes)
  for (const [key, timestamp] of exportRateLimits.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      exportRateLimits.delete(key)
    }
  }

  return true
}

/**
 * Escape CSV field value
 */
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return ""

  const stringValue = String(value)

  // If contains comma, newline, or quote, wrap in quotes and escape quotes
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

/**
 * Extract age range from client_info
 */
function extractAgeRange(clientInfo: any): string {
  if (!clientInfo) return ""

  if (clientInfo.ageRange) return clientInfo.ageRange

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

  return ""
}

/**
 * Extract partial user ID (LGPD compliant)
 */
function extractPartialUserId(userId: string): string {
  if (!userId) return ""
  return `${userId.substring(0, 8)}...`
}

/**
 * Extract plan name from recommended_item
 */
function extractPlanName(recommendedItem: any): string {
  if (!recommendedItem) return ""
  return recommendedItem.planName || recommendedItem.plan_name || ""
}

/**
 * Extract analyzed plans count
 */
function extractAnalyzedCount(analyzedData: any): number {
  if (!analyzedData) return 0
  return (
    analyzedData.plans_analyzed_count || analyzedData.plansAnalyzedCount || 0
  )
}

/**
 * Format date for CSV
 */
function formatDateCSV(dateString: string | null): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  return date.toISOString()
}

/**
 * Truncate reasoning for CSV
 */
function truncateReasoning(
  reasoning: string | null,
  maxLength: number = 200
): string {
  if (!reasoning) return ""
  if (reasoning.length <= maxLength) return reasoning
  return reasoning.substring(0, maxLength) + "..."
}

// =============================================================================
// API HANDLER
// =============================================================================

/**
 * GET /api/admin/audit-history/export
 *
 * Export audit records as CSV
 *
 * Query params:
 * - workspaceId: Required
 * - startDate: Optional ISO date
 * - endDate: Optional ISO date
 * - status: Optional filter
 * - anonymizationLevel: Optional filter
 */
export async function GET(request: NextRequest) {
  try {
    // Validate user authentication
    const userId = await validateUserAuthentication()

    // Parse query params
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const status = searchParams.get("status")
    const anonymizationLevel = searchParams.get("anonymizationLevel")

    // Validate workspace ID
    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId query parameter is required" },
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

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Please wait ${RATE_LIMIT_SECONDS} seconds between exports.`
        },
        { status: 429 }
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
      `
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_RECORDS)

    // Apply filters
    if (startDate) {
      query = query.gte("created_at", startDate)
    }

    if (endDate) {
      query = query.lte("created_at", endDate)
    }

    if (status) {
      query = query.eq("status", status)
    }

    if (anonymizationLevel) {
      query = query.eq("anonymization_level", anonymizationLevel)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API Export] Query error:", error)
      return NextResponse.json(
        { error: "Failed to fetch records for export" },
        { status: 500 }
      )
    }

    // Generate CSV content
    const headers = [
      "ID",
      "Data",
      "Usuario (Parcial)",
      "Faixa Etaria",
      "Estado",
      "Planos Analisados",
      "Plano Recomendado",
      "Confianca (%)",
      "Justificativa (Resumo)",
      "LangSmith ID",
      "Status",
      "Nivel Anonimizacao",
      "Consentimento",
      "Retencao Ate"
    ]

    const rows = (data || []).map(record => [
      escapeCSV(record.id),
      escapeCSV(formatDateCSV(record.created_at)),
      escapeCSV(extractPartialUserId(record.user_id)),
      escapeCSV(extractAgeRange(record.client_info)),
      escapeCSV((record.client_info as any)?.state || ""),
      escapeCSV(extractAnalyzedCount(record.analyzed_data)),
      escapeCSV(extractPlanName(record.recommended_item)),
      escapeCSV(
        record.confidence_score ? Math.round(record.confidence_score * 100) : ""
      ),
      escapeCSV(truncateReasoning(record.reasoning)),
      escapeCSV(record.langsmith_run_id || ""),
      escapeCSV(record.status || ""),
      escapeCSV(record.anonymization_level || ""),
      escapeCSV(record.consent_given ? "Sim" : "Nao"),
      escapeCSV(formatDateCSV(record.retention_until))
    ])

    // Build CSV with UTF-8 BOM for Excel compatibility
    const BOM = "\uFEFF"
    const csvContent =
      BOM + [headers.join(","), ...rows.map(row => row.join(","))].join("\n")

    // Generate filename
    const date = new Date().toISOString().split("T")[0]
    const filename = `audit-export-${date}.csv`

    // Return CSV response
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Records-Exported": String(data?.length || 0),
        "X-Max-Records": String(MAX_EXPORT_RECORDS)
      }
    })
  } catch (error: any) {
    console.error("[API Export] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
