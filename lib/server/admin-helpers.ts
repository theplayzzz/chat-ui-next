import { Database, Tables } from "@/supabase/types"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Admin helpers for workspace and permission management
 *
 * IMPORTANT: All functions assume caller has already validated admin privileges
 */

function getSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        }
      }
    }
  )
}

/**
 * Check if user is admin
 *
 * For MVP: checks if user is workspace owner
 * TODO: Implement proper role-based access control
 *
 * @param userId - User ID to check
 * @param workspaceId - Workspace ID to check ownership
 * @returns true if user is admin/owner
 */
export async function isUserAdmin(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from("workspaces")
    .select("user_id")
    .eq("id", workspaceId)
    .single()

  if (error || !data) {
    return false
  }

  return data.user_id === userId
}

/**
 * Grant health plan assistant access to a workspace
 *
 * Creates assistant_workspaces entry for health plan assistant
 *
 * @param workspaceId - Workspace to grant access
 * @param healthPlanAssistantId - Health plan assistant ID
 * @param userId - User performing the action (for audit)
 * @returns Success status
 */
export async function grantHealthPlanAccess(
  workspaceId: string,
  healthPlanAssistantId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient()

  // Check if association already exists
  const { data: existing } = await supabase
    .from("assistant_workspaces")
    .select("id")
    .eq("assistant_id", healthPlanAssistantId)
    .eq("workspace_id", workspaceId)
    .single()

  if (existing) {
    return {
      success: false,
      error: "Workspace already has access to this assistant"
    }
  }

  // Create assistant_workspaces entry
  const { error } = await supabase.from("assistant_workspaces").insert({
    user_id: userId,
    assistant_id: healthPlanAssistantId,
    workspace_id: workspaceId
  })

  if (error) {
    console.error("[Admin] Error granting access:", error)
    return {
      success: false,
      error: error.message
    }
  }

  // Log audit event
  await logAuditEvent({
    action: "grant_health_plan_access",
    userId,
    workspaceId,
    assistantId: healthPlanAssistantId,
    timestamp: new Date().toISOString()
  })

  return { success: true }
}

/**
 * Revoke health plan assistant access from workspace
 *
 * @param workspaceId - Workspace to revoke access
 * @param healthPlanAssistantId - Health plan assistant ID
 * @param userId - User performing the action
 * @returns Success status
 */
export async function revokeHealthPlanAccess(
  workspaceId: string,
  healthPlanAssistantId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient()

  const { error } = await supabase
    .from("assistant_workspaces")
    .delete()
    .eq("assistant_id", healthPlanAssistantId)
    .eq("workspace_id", workspaceId)

  if (error) {
    console.error("[Admin] Error revoking access:", error)
    return {
      success: false,
      error: error.message
    }
  }

  // Log audit event
  await logAuditEvent({
    action: "revoke_health_plan_access",
    userId,
    workspaceId,
    assistantId: healthPlanAssistantId,
    timestamp: new Date().toISOString()
  })

  return { success: true }
}

/**
 * List all workspaces with their authorization status for health plan assistant
 *
 * @param healthPlanAssistantId - Health plan assistant ID
 * @returns List of workspaces with access status
 */
export async function listAuthorizedWorkspaces(
  healthPlanAssistantId: string
): Promise<
  Array<{
    workspace: Tables<"workspaces">
    hasAccess: boolean
  }>
> {
  const supabase = getSupabaseServerClient()

  // Get all workspaces
  const { data: workspaces, error: workspacesError } = await supabase
    .from("workspaces")
    .select("*")
    .order("name")

  if (workspacesError || !workspaces) {
    return []
  }

  // Get authorized workspace IDs
  const { data: authorizations, error: authError } = await supabase
    .from("assistant_workspaces")
    .select("workspace_id")
    .eq("assistant_id", healthPlanAssistantId)

  const authorizedIds = new Set(authorizations?.map(a => a.workspace_id) || [])

  return workspaces.map(workspace => ({
    workspace,
    hasAccess: authorizedIds.has(workspace.id)
  }))
}

/**
 * Get health plan assistant ID
 *
 * Finds assistant by checking for health_plan collection type
 * For MVP: assumes single health plan assistant
 *
 * @returns Health plan assistant ID or null
 */
export async function getHealthPlanAssistantId(): Promise<string | null> {
  const supabase = getSupabaseServerClient()

  // Get collections of type health_plan
  const { data: collections, error: collError } = await supabase
    .from("collections")
    .select("id")
    .eq("collection_type", "health_plan")
    .limit(1)
    .single()

  if (collError || !collections) {
    return null
  }

  // Get assistant associated with this collection
  const { data: assistantCollection, error: acError } = await supabase
    .from("assistant_collections")
    .select("assistant_id")
    .eq("collection_id", collections.id)
    .limit(1)
    .single()

  if (acError || !assistantCollection) {
    return null
  }

  return assistantCollection.assistant_id
}

/**
 * Log audit event
 *
 * TODO: Implement proper audit table
 * For now: console.log with structured data
 *
 * @param event - Audit event data
 */
async function logAuditEvent(event: {
  action: string
  userId: string
  workspaceId: string
  assistantId: string
  timestamp: string
}) {
  console.log("[AUDIT]", JSON.stringify(event))

  // TODO: Store in audit_logs table when implemented
  // const supabase = getSupabaseServerClient()
  // await supabase.from("audit_logs").insert({
  //   action: event.action,
  //   user_id: event.userId,
  //   workspace_id: event.workspaceId,
  //   assistant_id: event.assistantId,
  //   created_at: event.timestamp
  // })
}
