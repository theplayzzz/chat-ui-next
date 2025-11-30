/**
 * API Route: /api/admin/erp-config/cache/clear
 * Task 17.3 - Clear Cache
 *
 * DELETE: Limpar cache ERP do workspace
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
 * DELETE /api/admin/erp-config/cache/clear
 *
 * Clear ERP cache for workspace
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await validateUserAuthentication()

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")
    const clearAll = searchParams.get("all") === "true"

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

    // Clear cache
    const removedCount = clearAll
      ? erpPriceCache.invalidateCache() // Clear all
      : erpPriceCache.invalidateCache(workspaceId) // Clear workspace only

    return NextResponse.json(
      {
        success: true,
        message: clearAll
          ? `Cache global limpo: ${removedCount} entradas removidas`
          : `Cache do workspace limpo: ${removedCount} entradas removidas`,
        removedCount,
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API ERP Cache Clear] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
