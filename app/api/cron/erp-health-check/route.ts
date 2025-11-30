/**
 * Cron Job: /api/cron/erp-health-check
 * Task 17.5 - Periodic ERP Health Checks
 *
 * Vercel Cron Job that runs every 5 minutes to check ERP health
 * for all active workspace configurations.
 *
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/erp-health-check",
 *     "schedule": "0,5,10,15,20,25,30,35,40,45,50,55 * * * *"
 *   }]
 * }
 *
 * Referencia: PRD RF-006, Task #17
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"

// =============================================================================
// TYPES
// =============================================================================

interface WorkspaceConfig {
  workspace_id: string
  api_url: string
  encrypted_api_key: string
  decrypted_api_key?: string
  timeout_ms: number
  custom_headers: Record<string, string> | null
}

interface HealthCheckResult {
  workspace_id: string
  status: "healthy" | "degraded" | "down"
  latency_ms: number | null
  error_details: string | null
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
 * Perform health check for a single workspace
 */
async function checkWorkspaceHealth(
  config: WorkspaceConfig
): Promise<HealthCheckResult> {
  const startTime = Date.now()
  let status: "healthy" | "degraded" | "down" = "down"
  let latencyMs: number | null = null
  let errorDetails: string | null = null

  // Use decrypted key if available, otherwise skip this check
  const apiKey = config.decrypted_api_key
  if (!apiKey) {
    return {
      workspace_id: config.workspace_id,
      status: "down",
      latency_ms: null,
      error_details: "Failed to decrypt API key"
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout_ms)

    const response = await fetch(config.api_url, {
      method: "HEAD",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(config.custom_headers || {})
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    latencyMs = Date.now() - startTime

    if (response.ok) {
      // Determine status based on latency thresholds
      if (latencyMs <= 1000) {
        status = "healthy"
      } else if (latencyMs <= 3000) {
        status = "degraded"
      } else {
        status = "degraded"
      }
    } else {
      status = "down"
      errorDetails = `HTTP ${response.status}: ${response.statusText}`
    }
  } catch (error: any) {
    latencyMs = Date.now() - startTime
    status = "down"
    errorDetails =
      error.name === "AbortError"
        ? `Timeout after ${config.timeout_ms}ms`
        : error.message || "Unknown error"
  }

  return {
    workspace_id: config.workspace_id,
    status,
    latency_ms: latencyMs,
    error_details: errorDetails
  }
}

// =============================================================================
// API HANDLER
// =============================================================================

/**
 * GET /api/cron/erp-health-check
 *
 * Cron job endpoint for periodic health checks
 *
 * Security: Protected by CRON_SECRET header
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel sets this automatically for cron jobs)
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    // In production, verify the cron secret
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow in development or when no secret is set
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const supabase = createSupabaseAdmin()

    // Get all active ERP configurations
    const { data: configs, error: configsError } = await supabase
      .from("workspace_erp_config")
      .select(
        "workspace_id, api_url, encrypted_api_key, timeout_ms, custom_headers"
      )
      .eq("is_active", true)

    if (configsError) {
      console.error("[Cron ERP Health] Error fetching configs:", configsError)
      return NextResponse.json(
        { error: "Failed to fetch configurations" },
        { status: 500 }
      )
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "No active ERP configurations found",
          checked: 0
        },
        { status: 200 }
      )
    }

    console.log(`[Cron ERP Health] Checking ${configs.length} workspaces`)

    // Decrypt API keys for all configs
    const configsWithDecryptedKeys: WorkspaceConfig[] = await Promise.all(
      configs.map(async config => {
        const { data: decryptedKey } = await supabase.rpc("decrypt_api_key", {
          encrypted_key: config.encrypted_api_key
        })
        return {
          workspace_id: config.workspace_id,
          api_url: config.api_url,
          encrypted_api_key: config.encrypted_api_key,
          decrypted_api_key: decryptedKey || undefined,
          timeout_ms: config.timeout_ms ?? 5000,
          custom_headers: config.custom_headers as Record<string, string> | null
        }
      })
    )

    // Perform health checks in parallel (with concurrency limit)
    const CONCURRENCY_LIMIT = 5
    const results: HealthCheckResult[] = []

    for (
      let i = 0;
      i < configsWithDecryptedKeys.length;
      i += CONCURRENCY_LIMIT
    ) {
      const batch = configsWithDecryptedKeys.slice(i, i + CONCURRENCY_LIMIT)
      const batchResults = await Promise.all(
        batch.map(config => checkWorkspaceHealth(config))
      )
      results.push(...batchResults)
    }

    // Save all health check results
    const healthChecks = results.map(result => ({
      workspace_id: result.workspace_id,
      status: result.status,
      latency_ms: result.latency_ms,
      error_details: result.error_details
    }))

    const { error: insertError } = await supabase
      .from("erp_health_checks")
      .insert(healthChecks)

    if (insertError) {
      console.error("[Cron ERP Health] Error saving results:", insertError)
    }

    // Generate summary
    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === "healthy").length,
      degraded: results.filter(r => r.status === "degraded").length,
      down: results.filter(r => r.status === "down").length
    }

    console.log("[Cron ERP Health] Summary:", summary)

    return NextResponse.json(
      {
        success: true,
        message: `Health checks completed for ${results.length} workspaces`,
        summary,
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[Cron ERP Health] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
