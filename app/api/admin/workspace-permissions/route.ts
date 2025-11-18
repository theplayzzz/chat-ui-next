/**
 * API Route: /api/admin/workspace-permissions
 *
 * Manage workspace permissions for health plan assistant
 *
 * Requires admin privileges (workspace owner)
 */

import { NextRequest, NextResponse } from "next/server"
import { validateUserAuthentication } from "@/lib/server/workspace-authorization"
import {
  isUserAdmin,
  listAuthorizedWorkspaces,
  grantHealthPlanAccess,
  revokeHealthPlanAccess,
  getHealthPlanAssistantId
} from "@/lib/server/admin-helpers"

/**
 * GET /api/admin/workspace-permissions
 *
 * List all workspaces with their authorization status
 *
 * Query params:
 * - workspaceId: Admin's workspace ID (for permission check)
 */
export async function GET(request: NextRequest) {
  try {
    // Validate user authentication
    const userId = await validateUserAuthentication()

    // Get workspace ID from query params
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")

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

    // Get health plan assistant ID
    const healthPlanAssistantId = await getHealthPlanAssistantId()
    if (!healthPlanAssistantId) {
      return NextResponse.json(
        { error: "Health plan assistant not found" },
        { status: 404 }
      )
    }

    // List workspaces with authorization status
    const workspaces = await listAuthorizedWorkspaces(healthPlanAssistantId)

    return NextResponse.json(
      {
        workspaces,
        healthPlanAssistantId
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API Admin] Error listing workspaces:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/workspace-permissions
 *
 * Grant health plan assistant access to a workspace
 *
 * Body:
 * - targetWorkspaceId: Workspace to grant access
 * - adminWorkspaceId: Admin's workspace (for permission check)
 */
export async function POST(request: NextRequest) {
  try {
    // Validate user authentication
    const userId = await validateUserAuthentication()

    // Parse request body
    const body = await request.json()
    const { targetWorkspaceId, adminWorkspaceId } = body

    if (!targetWorkspaceId || !adminWorkspaceId) {
      return NextResponse.json(
        { error: "targetWorkspaceId and adminWorkspaceId are required" },
        { status: 400 }
      )
    }

    // Check if user is admin
    const isAdmin = await isUserAdmin(userId, adminWorkspaceId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required" },
        { status: 403 }
      )
    }

    // Get health plan assistant ID
    const healthPlanAssistantId = await getHealthPlanAssistantId()
    if (!healthPlanAssistantId) {
      return NextResponse.json(
        { error: "Health plan assistant not found" },
        { status: 404 }
      )
    }

    // Grant access
    const result = await grantHealthPlanAccess(
      targetWorkspaceId,
      healthPlanAssistantId,
      userId
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(
      {
        success: true,
        message: "Access granted successfully"
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API Admin] Error granting access:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/workspace-permissions
 *
 * Revoke health plan assistant access from a workspace
 *
 * Body:
 * - targetWorkspaceId: Workspace to revoke access
 * - adminWorkspaceId: Admin's workspace (for permission check)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Validate user authentication
    const userId = await validateUserAuthentication()

    // Parse request body
    const body = await request.json()
    const { targetWorkspaceId, adminWorkspaceId } = body

    if (!targetWorkspaceId || !adminWorkspaceId) {
      return NextResponse.json(
        { error: "targetWorkspaceId and adminWorkspaceId are required" },
        { status: 400 }
      )
    }

    // Check if user is admin
    const isAdmin = await isUserAdmin(userId, adminWorkspaceId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required" },
        { status: 403 }
      )
    }

    // Get health plan assistant ID
    const healthPlanAssistantId = await getHealthPlanAssistantId()
    if (!healthPlanAssistantId) {
      return NextResponse.json(
        { error: "Health plan assistant not found" },
        { status: 404 }
      )
    }

    // Revoke access
    const result = await revokeHealthPlanAccess(
      targetWorkspaceId,
      healthPlanAssistantId,
      userId
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(
      {
        success: true,
        message: "Access revoked successfully"
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API Admin] Error revoking access:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
