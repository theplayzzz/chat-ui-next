/**
 * API Route: /api/admin/erp-config/health
 * Task 17.5 - Health Check Endpoint
 *
 * GET: Obter status de saude e metricas do ERP
 * POST: Executar health check manual
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

interface HealthStatus {
  currentStatus: "healthy" | "degraded" | "down" | "unknown"
  lastCheck: string | null
  latencyMs: number | null
  uptime24h: number
  avgLatency24h: number
  checksLast24h: number
  successRate24h: number
  recentChecks: Array<{
    id: string
    timestamp: string
    status: "healthy" | "degraded" | "down"
    latency_ms: number | null
    error_details: string | null
  }>
}

interface HealthMetrics {
  total_checks: number
  healthy_count: number
  degraded_count: number
  down_count: number
  avg_latency_ms: number
  min_latency_ms: number
  max_latency_ms: number
  current_status: string
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
// API HANDLERS
// =============================================================================

/**
 * GET /api/admin/erp-config/health
 *
 * Get health status and metrics for the ERP connection
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

    // Get most recent health check
    const { data: latestCheck, error: latestError } = await supabase
      .from("erp_health_checks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single()

    if (latestError && latestError.code !== "PGRST116") {
      console.error(
        "[API ERP Health] Error fetching latest check:",
        latestError
      )
    }

    // Get health metrics for last 24 hours
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString()

    const { data: metricsResult, error: metricsError } = await supabase.rpc(
      "get_erp_health_metrics",
      {
        p_workspace_id: workspaceId,
        p_hours: 24
      }
    )

    if (metricsError) {
      console.error("[API ERP Health] Error fetching metrics:", metricsError)
    }

    // Get recent checks (last 10)
    const { data: recentChecks, error: recentError } = await supabase
      .from("erp_health_checks")
      .select("id, timestamp, status, latency_ms, error_details")
      .eq("workspace_id", workspaceId)
      .order("timestamp", { ascending: false })
      .limit(10)

    if (recentError) {
      console.error(
        "[API ERP Health] Error fetching recent checks:",
        recentError
      )
    }

    // Build response
    const metrics = metricsResult as HealthMetrics | null

    const response: HealthStatus = {
      currentStatus:
        (latestCheck?.status as "healthy" | "degraded" | "down") || "unknown",
      lastCheck: latestCheck?.timestamp || null,
      latencyMs: latestCheck?.latency_ms || null,
      uptime24h:
        metrics?.total_checks && metrics.total_checks > 0
          ? Math.round(
              ((metrics.healthy_count + metrics.degraded_count) /
                metrics.total_checks) *
                100
            )
          : 0,
      avgLatency24h: metrics?.avg_latency_ms || 0,
      checksLast24h: metrics?.total_checks || 0,
      successRate24h:
        metrics?.total_checks && metrics.total_checks > 0
          ? Math.round(
              ((metrics.healthy_count + metrics.degraded_count) /
                metrics.total_checks) *
                100
            )
          : 0,
      recentChecks: (recentChecks || []).map(check => ({
        id: check.id,
        timestamp: check.timestamp,
        status: check.status as "healthy" | "degraded" | "down",
        latency_ms: check.latency_ms,
        error_details: check.error_details as string | null
      }))
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error: any) {
    console.error("[API ERP Health] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/erp-config/health
 *
 * Execute a manual health check
 */
export async function POST(request: NextRequest) {
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

    // Get ERP config for the workspace
    const { data: config, error: configError } = await supabase
      .from("workspace_erp_config")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: "ERP configuration not found for this workspace" },
        { status: 404 }
      )
    }

    if (!config.is_active) {
      return NextResponse.json(
        { error: "ERP integration is not active for this workspace" },
        { status: 400 }
      )
    }

    // Decrypt API key before use
    const { data: decryptedKey, error: decryptError } = await supabase.rpc(
      "decrypt_api_key",
      { encrypted_key: config.encrypted_api_key }
    )

    if (decryptError || !decryptedKey) {
      console.error("[API ERP Health] Error decrypting API key:", decryptError)
      return NextResponse.json(
        { error: "Failed to decrypt API key" },
        { status: 500 }
      )
    }

    // Perform health check
    const startTime = Date.now()
    let status: "healthy" | "degraded" | "down" = "down"
    let latencyMs: number | null = null
    let errorDetails: string | null = null

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(),
        config.timeout_ms ?? 5000
      )

      const response = await fetch(config.api_url, {
        method: "HEAD",
        headers: {
          Authorization: `Bearer ${decryptedKey}`,
          ...((config.custom_headers as Record<string, string>) || {})
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      latencyMs = Date.now() - startTime

      if (response.ok) {
        // Determine status based on latency
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

    // Save health check result
    const { data: newCheck, error: insertError } = await supabase
      .from("erp_health_checks")
      .insert({
        workspace_id: workspaceId,
        status,
        latency_ms: latencyMs,
        error_details: errorDetails
      })
      .select()
      .single()

    if (insertError) {
      console.error("[API ERP Health] Error saving check:", insertError)
    }

    return NextResponse.json(
      {
        success: true,
        check: {
          id: newCheck?.id,
          timestamp: newCheck?.timestamp,
          status,
          latency_ms: latencyMs,
          error_details: errorDetails
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API ERP Health] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
