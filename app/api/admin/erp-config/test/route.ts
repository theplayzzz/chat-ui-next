/**
 * API Route: /api/admin/erp-config/test
 * Task 17.2 - Teste de conectividade ERP
 *
 * POST: Testar credenciais ERP chamando API com dados mock
 *
 * Requer: workspace owner ou admin global
 *
 * Referencia: PRD RF-006, Task #17
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateUserAuthentication } from "@/lib/server/workspace-authorization"
import { isUserAdmin } from "@/lib/server/admin-helpers"
import { ERPClient } from "@/lib/clients/erp-client"
import type { Database } from "@/supabase/types"
import type { WorkspaceERPConfig } from "@/lib/tools/health-plan/types"

// =============================================================================
// TYPES
// =============================================================================

interface TestRequest {
  workspaceId: string
  // Optional: test with temporary credentials without saving
  tempApiUrl?: string
  tempApiKey?: string
  tempTimeoutMs?: number
  tempRetryAttempts?: number
  tempCustomHeaders?: Record<string, string>
}

interface TestResult {
  success: boolean
  latencyMs: number
  message: string
  details?: {
    responseStatus?: number
    errorCode?: string
    dataReceived?: boolean
  }
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

// =============================================================================
// API HANDLER
// =============================================================================

/**
 * POST /api/admin/erp-config/test
 *
 * Test ERP API connectivity with stored or temporary credentials
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await validateUserAuthentication()

    const body: TestRequest = await request.json()
    const { workspaceId, tempApiUrl, tempApiKey } = body

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
    let erpConfig: WorkspaceERPConfig
    let apiKey: string

    // Determine if using temporary or stored credentials
    if (tempApiUrl && tempApiKey) {
      // Use temporary credentials for testing before save
      erpConfig = {
        id: crypto.randomUUID(), // Temporary ID for testing
        workspace_id: workspaceId,
        api_url: tempApiUrl,
        encrypted_api_key: "", // Not used with decrypted key
        custom_headers: body.tempCustomHeaders || {},
        timeout_ms: body.tempTimeoutMs || 10000,
        retry_attempts: body.tempRetryAttempts ?? 2,
        cache_ttl_minutes: 15,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      apiKey = tempApiKey
    } else {
      // Use stored credentials
      const { data: config, error: configError } = await supabase
        .from("workspace_erp_config")
        .select("*")
        .eq("workspace_id", workspaceId)
        .single()

      if (configError || !config) {
        return NextResponse.json(
          {
            error: "No ERP configuration found for this workspace",
            testResult: null
          },
          { status: 404 }
        )
      }

      erpConfig = config as WorkspaceERPConfig

      // Decrypt API key
      const { data: decryptedKey, error: decryptError } = await supabase.rpc(
        "decrypt_api_key" as any,
        { encrypted_key: config.encrypted_api_key }
      )

      if (decryptError || !decryptedKey) {
        console.error("[API ERP Test] Decrypt error:", decryptError)
        return NextResponse.json(
          { error: "Failed to decrypt API key" },
          { status: 500 }
        )
      }

      apiKey = decryptedKey
    }

    // Create ERP client and test connectivity
    const client = new ERPClient(erpConfig, apiKey)
    const startTime = Date.now()

    // Use mock plan IDs for testing - these should return valid data from any ERP
    const testPlanIds = ["TEST_PLAN_001", "TEST_PLAN_002"]

    const result = await client.fetchPrices(testPlanIds)
    const latencyMs = Date.now() - startTime

    const testResult: TestResult = {
      success: result.success,
      latencyMs,
      message: result.success
        ? `Conexao bem sucedida! API respondeu em ${latencyMs}ms`
        : `Falha na conexao: ${result.error?.message || "Erro desconhecido"}`,
      details: {
        errorCode: result.success ? undefined : result.error?.code,
        dataReceived: result.success && result.data && result.data.length > 0
      }
    }

    // Log the test attempt to erp_api_logs
    try {
      await supabase.from("erp_api_logs").insert({
        workspace_id: workspaceId,
        status: result.success ? "success" : "error",
        response_time_ms: latencyMs,
        cache_hit: false,
        error_message: result.success ? null : result.error?.message,
        request_params: {
          type: "connectivity_test",
          plan_ids: testPlanIds,
          used_temp_credentials: !!(tempApiUrl && tempApiKey)
        }
      })
    } catch (logError) {
      // Don't fail the test if logging fails
      console.error("[API ERP Test] Failed to log test:", logError)
    }

    return NextResponse.json(
      {
        testResult,
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API ERP Test] Error:", error)
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
        testResult: {
          success: false,
          latencyMs: 0,
          message: `Erro interno: ${error.message || "Erro desconhecido"}`,
          details: {}
        }
      },
      { status: 500 }
    )
  }
}
