/**
 * API Route: /api/admin/erp-config
 * Task 17.2 - Formulario ERP Config + CRUD
 *
 * GET: Obter configuracao ERP atual
 * PUT: Atualizar configuracao
 * POST: Criar configuracao (se nao existir)
 * DELETE: Remover configuracao
 *
 * Requer: workspace owner ou admin global
 *
 * Referencia: PRD RF-006, Task #17
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateUserAuthentication } from "@/lib/server/workspace-authorization"
import { isUserAdmin } from "@/lib/server/admin-helpers"
import type { Database } from "@/supabase/types"

// =============================================================================
// TYPES
// =============================================================================

interface ERPConfigResponse {
  workspace_id: string
  api_url: string
  encrypted_api_key: string
  custom_headers: Record<string, string>
  timeout_ms: number
  retry_attempts: number
  cache_ttl_minutes: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

interface CreateERPConfigRequest {
  workspaceId: string
  apiUrl: string
  apiKey: string
  customHeaders?: Record<string, string>
  timeoutMs?: number
  retryAttempts?: number
  cacheTtlMinutes?: number
}

interface UpdateERPConfigRequest {
  workspaceId: string
  apiUrl?: string
  apiKey?: string
  customHeaders?: Record<string, string>
  timeoutMs?: number
  retryAttempts?: number
  cacheTtlMinutes?: number
  isActive?: boolean
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
 * Validate ERP config values
 */
function validateConfig(
  config: Partial<CreateERPConfigRequest | UpdateERPConfigRequest>
): string | null {
  if ("apiUrl" in config && config.apiUrl) {
    try {
      const url = new URL(config.apiUrl)
      if (url.protocol !== "https:") {
        return "API URL must use HTTPS"
      }
    } catch {
      return "Invalid API URL format"
    }
  }

  if (
    "timeoutMs" in config &&
    config.timeoutMs !== undefined &&
    (config.timeoutMs < 1000 || config.timeoutMs > 60000)
  ) {
    return "Timeout must be between 1000ms and 60000ms"
  }

  if (
    "retryAttempts" in config &&
    config.retryAttempts !== undefined &&
    (config.retryAttempts < 0 || config.retryAttempts > 5)
  ) {
    return "Retry attempts must be between 0 and 5"
  }

  if (
    "cacheTtlMinutes" in config &&
    config.cacheTtlMinutes !== undefined &&
    (config.cacheTtlMinutes < 1 || config.cacheTtlMinutes > 1440)
  ) {
    return "Cache TTL must be between 1 and 1440 minutes"
  }

  return null
}

// =============================================================================
// API HANDLERS
// =============================================================================

/**
 * GET /api/admin/erp-config
 *
 * Get ERP configuration for a workspace
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

    // Get existing config
    const { data, error } = await supabase
      .from("workspace_erp_config")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found
      console.error("[API ERP Config] Query error:", error)
      return NextResponse.json(
        { error: "Failed to fetch ERP configuration" },
        { status: 500 }
      )
    }

    // Return config or null
    return NextResponse.json(
      {
        config: data
          ? {
              ...data,
              // Never return the actual encrypted key to client
              encrypted_api_key: data.encrypted_api_key ? "********" : null
            }
          : null,
        exists: !!data
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API ERP Config] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/erp-config
 *
 * Create ERP configuration for a workspace
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await validateUserAuthentication()

    const body: CreateERPConfigRequest = await request.json()
    const { workspaceId, apiUrl, apiKey } = body

    if (!workspaceId || !apiUrl || !apiKey) {
      return NextResponse.json(
        { error: "workspaceId, apiUrl, and apiKey are required" },
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

    // Check if config already exists
    const { data: existing } = await supabase
      .from("workspace_erp_config")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: "ERP configuration already exists for this workspace" },
        { status: 409 }
      )
    }

    // Encrypt API key
    const { data: encryptedKey, error: encryptError } = await supabase.rpc(
      "encrypt_api_key" as any,
      { api_key: apiKey }
    )

    if (encryptError) {
      console.error("[API ERP Config] Encryption error:", encryptError)
      return NextResponse.json(
        { error: "Failed to encrypt API key" },
        { status: 500 }
      )
    }

    // Create config
    const { data, error } = await supabase
      .from("workspace_erp_config")
      .insert({
        workspace_id: workspaceId,
        api_url: apiUrl,
        encrypted_api_key: encryptedKey,
        custom_headers: body.customHeaders || {},
        timeout_ms: body.timeoutMs || 10000,
        retry_attempts: body.retryAttempts ?? 2,
        cache_ttl_minutes: body.cacheTtlMinutes || 15,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      console.error("[API ERP Config] Insert error:", error)
      return NextResponse.json(
        { error: "Failed to create ERP configuration" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        config: {
          ...data,
          encrypted_api_key: "********"
        }
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("[API ERP Config] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/erp-config
 *
 * Update ERP configuration for a workspace
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await validateUserAuthentication()

    const body: UpdateERPConfigRequest = await request.json()
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
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (body.apiUrl !== undefined) {
      updateData.api_url = body.apiUrl
    }

    if (body.apiKey !== undefined) {
      // Encrypt new API key
      const { data: encryptedKey, error: encryptError } = await supabase.rpc(
        "encrypt_api_key" as any,
        { api_key: body.apiKey }
      )

      if (encryptError) {
        console.error("[API ERP Config] Encryption error:", encryptError)
        return NextResponse.json(
          { error: "Failed to encrypt API key" },
          { status: 500 }
        )
      }

      updateData.encrypted_api_key = encryptedKey
    }

    if (body.customHeaders !== undefined) {
      updateData.custom_headers = body.customHeaders
    }

    if (body.timeoutMs !== undefined) {
      updateData.timeout_ms = body.timeoutMs
    }

    if (body.retryAttempts !== undefined) {
      updateData.retry_attempts = body.retryAttempts
    }

    if (body.cacheTtlMinutes !== undefined) {
      updateData.cache_ttl_minutes = body.cacheTtlMinutes
    }

    if (body.isActive !== undefined) {
      updateData.is_active = body.isActive
    }

    if (Object.keys(updateData).length === 1) {
      // Only updated_at
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    // Update config
    const { data, error } = await supabase
      .from("workspace_erp_config")
      .update(updateData)
      .eq("workspace_id", workspaceId)
      .select()
      .single()

    if (error) {
      console.error("[API ERP Config] Update error:", error)
      return NextResponse.json(
        { error: "Failed to update ERP configuration" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        config: {
          ...data,
          encrypted_api_key: "********"
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API ERP Config] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/erp-config
 *
 * Delete ERP configuration for a workspace
 */
export async function DELETE(request: NextRequest) {
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

    // Delete config
    const { error } = await supabase
      .from("workspace_erp_config")
      .delete()
      .eq("workspace_id", workspaceId)

    if (error) {
      console.error("[API ERP Config] Delete error:", error)
      return NextResponse.json(
        { error: "Failed to delete ERP configuration" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: "ERP configuration deleted successfully"
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API ERP Config] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
