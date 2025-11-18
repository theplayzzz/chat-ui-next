import { Database } from "@/supabase/types"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Server-side authorization helpers for workspace and assistant access control
 *
 * These functions validate:
 * 1. User authentication
 * 2. Workspace membership
 * 3. Assistant-workspace associations
 * 4. Health plan assistant specific permissions
 */

/**
 * Get Supabase server client with current user session
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
 * Validate if user is authenticated and get user ID
 *
 * @returns User ID if authenticated
 * @throws Error if user is not authenticated
 */
export async function validateUserAuthentication(): Promise<string> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new Error("Unauthorized: User not authenticated")
  }

  return data.user.id
}

/**
 * Validate if user has access to a specific workspace
 *
 * Checks workspace_users table to verify membership
 *
 * @param userId - User ID to validate
 * @param workspaceId - Workspace ID to check access
 * @returns true if user has access, false otherwise
 */
export async function validateWorkspaceMembership(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, user_id")
    .eq("id", workspaceId)
    .single()

  if (error || !data) {
    return false
  }

  // User is owner of the workspace
  if (data.user_id === userId) {
    return true
  }

  // Check if user is a member of the workspace
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_users")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single()

  if (membershipError || !membership) {
    return false
  }

  return true
}

/**
 * Validate if an assistant belongs to a workspace
 *
 * Checks assistant_workspaces junction table
 *
 * @param assistantId - Assistant ID to validate
 * @param workspaceId - Workspace ID to check
 * @returns true if assistant is associated with workspace
 */
export async function validateAssistantWorkspaceAssociation(
  assistantId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from("assistant_workspaces")
    .select("assistant_id, workspace_id")
    .eq("assistant_id", assistantId)
    .eq("workspace_id", workspaceId)
    .single()

  if (error || !data) {
    return false
  }

  return true
}

/**
 * Validate complete access: user authentication + workspace membership + assistant association
 *
 * This is the main authorization function to use in API routes
 *
 * @param assistantId - Assistant ID being accessed
 * @param workspaceId - Workspace ID context
 * @returns Object with validation result and user ID
 */
export async function validateAssistantWorkspaceAccess(
  assistantId: string,
  workspaceId: string
): Promise<{
  isAuthorized: boolean
  userId: string
  errors: string[]
}> {
  const errors: string[] = []

  // 1. Validate user authentication
  let userId: string
  try {
    userId = await validateUserAuthentication()
  } catch (error) {
    return {
      isAuthorized: false,
      userId: "",
      errors: ["User not authenticated"]
    }
  }

  // 2. Validate workspace membership
  const hasWorkspaceAccess = await validateWorkspaceMembership(
    userId,
    workspaceId
  )
  if (!hasWorkspaceAccess) {
    errors.push("User does not have access to this workspace")
  }

  // 3. Validate assistant-workspace association
  const isAssistantInWorkspace = await validateAssistantWorkspaceAssociation(
    assistantId,
    workspaceId
  )
  if (!isAssistantInWorkspace) {
    errors.push("Assistant is not associated with this workspace")
  }

  return {
    isAuthorized: errors.length === 0,
    userId,
    errors
  }
}

/**
 * Get all workspaces authorized for a specific assistant
 *
 * @param assistantId - Assistant ID
 * @returns Array of authorized workspace IDs
 */
export async function getAuthorizedWorkspacesForAssistant(
  assistantId: string
): Promise<string[]> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from("assistant_workspaces")
    .select("workspace_id")
    .eq("assistant_id", assistantId)

  if (error || !data) {
    return []
  }

  return data.map(row => row.workspace_id)
}

/**
 * Check if an assistant is a health plan assistant
 *
 * Identifies by checking associated collections for type 'health_plan'
 *
 * @param assistantId - Assistant ID to check
 * @returns true if assistant has health_plan collections
 */
export async function isHealthPlanAssistant(
  assistantId: string
): Promise<boolean> {
  const supabase = getSupabaseServerClient()

  // Get collections associated with this assistant
  const { data: assistantCollections, error: acError } = await supabase
    .from("assistant_collections")
    .select("collection_id")
    .eq("assistant_id", assistantId)

  if (acError || !assistantCollections || assistantCollections.length === 0) {
    return false
  }

  const collectionIds = assistantCollections.map(ac => ac.collection_id)

  // Check if any of these collections are health_plan type
  const { data: collections, error: collError } = await supabase
    .from("collections")
    .select("id, collection_type")
    .in("id", collectionIds)
    .eq("collection_type", "health_plan")

  if (collError || !collections || collections.length === 0) {
    return false
  }

  return true
}

/**
 * Authorization error response helper
 *
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 403)
 * @returns Response object
 */
export function unauthorizedResponse(
  message: string = "Access denied",
  statusCode: number = 403
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      statusCode
    }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json"
      }
    }
  )
}
