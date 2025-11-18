import { useContext, useMemo } from "react"
import { ChatbotUIContext } from "@/context/context"
import { Tables } from "@/supabase/types"

/**
 * Hook to check if the current workspace has access to health plan assistants
 *
 * This hook verifies if:
 * 1. An assistant is a health plan assistant (identified by specific collections)
 * 2. The current workspace has authorization to use health plan features
 *
 * @returns Object with authorization status and helper functions
 */
export const useHealthPlanAccess = () => {
  const { assistants, selectedWorkspace } = useContext(ChatbotUIContext)

  /**
   * Check if an assistant is a health plan assistant
   * Health plan assistants are identified by having collections of type 'health_plan'
   */
  const isHealthPlanAssistant = (assistant: Tables<"assistants">): boolean => {
    // For now, we identify health plan assistants by checking if their name
    // contains "health plan" or "plano de saúde" (case insensitive)
    // This can be enhanced later to check actual collection types
    const name = assistant.name.toLowerCase()
    const description = assistant.description?.toLowerCase() || ""

    return (
      name.includes("health plan") ||
      name.includes("plano de saúde") ||
      name.includes("planos de saúde") ||
      description.includes("health plan") ||
      description.includes("plano de saúde")
    )
  }

  /**
   * Check if current workspace is authorized for health plan features
   *
   * Authorization logic:
   * - If a health plan assistant exists in the workspace's assistant list,
   *   it means the workspace is authorized (via assistant_workspaces table)
   * - The backend ensures only authorized workspaces can see health plan assistants
   */
  const isWorkspaceAuthorized = useMemo(() => {
    if (!selectedWorkspace) return false

    // Check if any assistant in the current workspace is a health plan assistant
    const hasHealthPlanAssistant = assistants.some(assistant =>
      isHealthPlanAssistant(assistant)
    )

    return hasHealthPlanAssistant
  }, [assistants, selectedWorkspace])

  /**
   * Get all health plan assistants available in current workspace
   */
  const healthPlanAssistants = useMemo(() => {
    return assistants.filter(assistant => isHealthPlanAssistant(assistant))
  }, [assistants])

  return {
    /**
     * Whether the current workspace has access to health plan features
     */
    isAuthorized: isWorkspaceAuthorized,

    /**
     * Check if a specific assistant is a health plan assistant
     */
    isHealthPlanAssistant,

    /**
     * List of health plan assistants in current workspace
     */
    healthPlanAssistants,

    /**
     * Current workspace info
     */
    workspace: selectedWorkspace
  }
}
