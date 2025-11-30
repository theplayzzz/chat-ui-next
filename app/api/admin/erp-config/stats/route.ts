/**
 * API Route: /api/admin/erp-config/stats
 * Task 17.3 - Cache Stats Dashboard
 *
 * GET: Obter estatisticas do cache ERP
 *
 * Requer: workspace owner ou admin global
 *
 * Referencia: PRD RF-006, Task #17
 */

import { NextRequest, NextResponse } from "next/server"
import { validateUserAuthentication } from "@/lib/server/workspace-authorization"
import { isUserAdmin } from "@/lib/server/admin-helpers"
import { erpPriceCache } from "@/lib/cache/erp-price-cache"

// =============================================================================
// API HANDLER
// =============================================================================

/**
 * GET /api/admin/erp-config/stats
 *
 * Get ERP cache statistics
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

    // Get cache stats
    const stats = erpPriceCache.getCacheStats()

    // Get workspace-specific entries count
    const allEntries = erpPriceCache.getAllEntries()
    let workspaceEntries = 0
    let workspaceHits = 0
    let oldestWorkspaceEntry: number | null = null

    for (const entry of allEntries.values()) {
      if (entry.workspace_id === workspaceId) {
        workspaceEntries++
        workspaceHits += entry.hits
        if (
          oldestWorkspaceEntry === null ||
          entry.timestamp < oldestWorkspaceEntry
        ) {
          oldestWorkspaceEntry = entry.timestamp
        }
      }
    }

    return NextResponse.json(
      {
        // Global stats
        global: {
          totalEntries: stats.totalEntries,
          hitRate: Math.round(stats.hitRate * 100),
          missRate: Math.round(stats.missRate * 100),
          evictions: stats.evictions,
          totalHits: stats.totalHits,
          oldestEntry: stats.oldestEntry
            ? new Date(stats.oldestEntry).toISOString()
            : null
        },
        // Workspace-specific stats
        workspace: {
          entries: workspaceEntries,
          hits: workspaceHits,
          oldestEntry: oldestWorkspaceEntry
            ? new Date(oldestWorkspaceEntry).toISOString()
            : null
        },
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API ERP Stats] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
