/**
 * API Route: /api/admin/audit-retention
 * Task 13.6 - Configuracao de retencao por workspace
 *
 * GET: Obter configuracao atual
 * PUT: Atualizar configuracao
 * POST: Criar configuracao (se nao existir)
 *
 * Requer: workspace owner ou admin global
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

interface AuditRetentionConfig {
  workspace_id: string
  retention_years: number
  auto_anonymize_after_days: number
  hard_delete_enabled: boolean
  default_anonymization_level: "full" | "partial" | "none"
  created_at?: string
  updated_at?: string
}

interface UpdateConfigRequest {
  workspaceId: string
  retentionYears?: number
  autoAnonymizeAfterDays?: number
  hardDeleteEnabled?: boolean
  defaultAnonymizationLevel?: "full" | "partial" | "none"
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
 * Validate retention config values
 */
function validateConfig(config: Partial<UpdateConfigRequest>): string | null {
  if (
    config.retentionYears !== undefined &&
    (config.retentionYears < 1 || config.retentionYears > 10)
  ) {
    return "retention_years must be between 1 and 10"
  }

  if (
    config.autoAnonymizeAfterDays !== undefined &&
    (config.autoAnonymizeAfterDays < 30 || config.autoAnonymizeAfterDays > 365)
  ) {
    return "auto_anonymize_after_days must be between 30 and 365"
  }

  if (
    config.defaultAnonymizationLevel !== undefined &&
    !["full", "partial", "none"].includes(config.defaultAnonymizationLevel)
  ) {
    return "default_anonymization_level must be 'full', 'partial', or 'none'"
  }

  return null
}

// =============================================================================
// API HANDLERS
// =============================================================================

/**
 * GET /api/admin/audit-retention
 *
 * Get retention configuration for a workspace
 *
 * Query params:
 * - workspaceId: Required
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await validateUserAuthentication()

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId query parameter is required" },
        { status: 400 }
      )
    }

    // Check admin access
    const isAdmin = await isUserAdmin(userId, workspaceId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required" },
        { status: 403 }
      )
    }

    const supabase = createSupabaseAdmin()

    // Get existing config or return defaults
    const { data, error } = await supabase
      .from("workspace_audit_config")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found
      console.error("[API Audit Retention] Query error:", error)
      return NextResponse.json(
        { error: "Failed to fetch retention configuration" },
        { status: 500 }
      )
    }

    // Return config or defaults
    const config: AuditRetentionConfig = data
      ? {
          ...data,
          default_anonymization_level: data.default_anonymization_level as
            | "full"
            | "partial"
            | "none"
        }
      : {
          workspace_id: workspaceId,
          retention_years: 2,
          auto_anonymize_after_days: 90,
          hard_delete_enabled: false,
          default_anonymization_level: "partial"
        }

    return NextResponse.json(
      {
        config,
        isDefault: !data
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API Audit Retention] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/audit-retention
 *
 * Update retention configuration for a workspace
 *
 * Body:
 * - workspaceId: Required
 * - retentionYears: Optional (1-10)
 * - autoAnonymizeAfterDays: Optional (30-365)
 * - hardDeleteEnabled: Optional
 * - defaultAnonymizationLevel: Optional ('full', 'partial', 'none')
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await validateUserAuthentication()

    const body: UpdateConfigRequest = await request.json()
    const { workspaceId } = body

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      )
    }

    // Validate config values
    const validationError = validateConfig(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Check admin access
    const isAdmin = await isUserAdmin(userId, workspaceId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required" },
        { status: 403 }
      )
    }

    const supabase = createSupabaseAdmin()

    // Build update object
    const updateData: Record<string, any> = {}

    if (body.retentionYears !== undefined) {
      updateData.retention_years = body.retentionYears
    }
    if (body.autoAnonymizeAfterDays !== undefined) {
      updateData.auto_anonymize_after_days = body.autoAnonymizeAfterDays
    }
    if (body.hardDeleteEnabled !== undefined) {
      updateData.hard_delete_enabled = body.hardDeleteEnabled
    }
    if (body.defaultAnonymizationLevel !== undefined) {
      updateData.default_anonymization_level = body.defaultAnonymizationLevel
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    // Upsert config
    const { data, error } = await supabase
      .from("workspace_audit_config")
      .upsert(
        {
          workspace_id: workspaceId,
          ...updateData
        },
        { onConflict: "workspace_id" }
      )
      .select()
      .single()

    if (error) {
      console.error("[API Audit Retention] Update error:", error)
      return NextResponse.json(
        { error: "Failed to update retention configuration" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        config: data
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API Audit Retention] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/audit-retention/trigger-cleanup
 *
 * Manually trigger cleanup job (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await validateUserAuthentication()

    const body = await request.json()
    const { workspaceId, action } = body

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      )
    }

    // Check admin access
    const isAdmin = await isUserAdmin(userId, workspaceId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required" },
        { status: 403 }
      )
    }

    const supabase = createSupabaseAdmin()

    // Handle different actions
    if (action === "trigger_cleanup") {
      // Execute cleanup function using raw SQL since RPC type isn't recognized
      const { data, error } = await supabase.rpc("cleanup_audit_records" as any)

      if (error) {
        console.error("[API Audit Retention] Cleanup error:", error)
        return NextResponse.json(
          { error: "Failed to execute cleanup" },
          { status: 500 }
        )
      }

      // Parse result - function returns table with hard_deleted, soft_deleted, anonymization_upgraded
      const rawResult = Array.isArray(data) && data.length > 0 ? data[0] : null
      const result = {
        hard_deleted: (rawResult as any)?.hard_deleted ?? 0,
        soft_deleted: (rawResult as any)?.soft_deleted ?? 0,
        anonymization_upgraded: (rawResult as any)?.anonymization_upgraded ?? 0
      }

      return NextResponse.json(
        {
          success: true,
          result: {
            hard_deleted: result.hard_deleted,
            soft_deleted: result.soft_deleted,
            anonymization_upgraded: result.anonymization_upgraded,
            total_processed:
              result.hard_deleted +
              result.soft_deleted +
              result.anonymization_upgraded
          }
        },
        { status: 200 }
      )
    }

    if (action === "get_deletion_log") {
      // Get recent deletion log entries
      const { data, error } = await supabase
        .from("audit_deletions_log")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("deleted_at", { ascending: false })
        .limit(100)

      if (error) {
        console.error("[API Audit Retention] Log query error:", error)
        return NextResponse.json(
          { error: "Failed to fetch deletion log" },
          { status: 500 }
        )
      }

      return NextResponse.json(
        {
          logs: data || [],
          count: data?.length || 0
        },
        { status: 200 }
      )
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("[API Audit Retention] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
