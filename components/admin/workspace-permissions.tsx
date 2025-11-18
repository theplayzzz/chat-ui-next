"use client"

import { FC, useContext, useEffect, useState } from "react"
import { ChatbotUIContext } from "@/context/context"
import { Tables } from "@/supabase/types"
import { IconCheck, IconX, IconLoader, IconShield } from "@tabler/icons-react"

interface WorkspaceWithAccess {
  workspace: Tables<"workspaces">
  hasAccess: boolean
}

/**
 * Component to manage workspace permissions for health plan assistant
 *
 * Admin-only component for granting/revoking health plan assistant access
 *
 * Usage:
 * ```tsx
 * <WorkspacePermissions />
 * ```
 */
export const WorkspacePermissions: FC = () => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)
  const [workspaces, setWorkspaces] = useState<WorkspaceWithAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    loadWorkspaces()
  }, [selectedWorkspace])

  const loadWorkspaces = async () => {
    if (!selectedWorkspace) return

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(
        `/api/admin/workspace-permissions?workspaceId=${selectedWorkspace.id}`
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to load workspaces")
      }

      const data = await response.json()
      setWorkspaces(data.workspaces || [])
    } catch (err: any) {
      console.error("Error loading workspaces:", err)
      setError(err.message || "Failed to load workspaces")
    } finally {
      setLoading(false)
    }
  }

  const handleToggleAccess = async (
    targetWorkspaceId: string,
    currentAccess: boolean
  ) => {
    if (!selectedWorkspace) return

    try {
      setProcessingId(targetWorkspaceId)
      setError(null)

      const endpoint = "/api/admin/workspace-permissions"
      const method = currentAccess ? "DELETE" : "POST"

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetWorkspaceId,
          adminWorkspaceId: selectedWorkspace.id
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update access")
      }

      // Reload workspaces to reflect changes
      await loadWorkspaces()
    } catch (err: any) {
      console.error("Error toggling access:", err)
      setError(err.message || "Failed to update access")
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <IconLoader className="animate-spin" size={32} />
        <span className="ml-2">Loading workspaces...</span>
      </div>
    )
  }

  if (error && workspaces.length === 0) {
    // Special handling for "assistant not found" error
    if (error.includes("Health plan assistant not found")) {
      return (
        <div className="rounded-lg border border-yellow-500 bg-yellow-500/10 p-6">
          <h3 className="mb-2 text-lg font-bold text-yellow-600">
            Health Plan Assistant Not Found
          </h3>
          <p className="text-muted-foreground mb-4">
            To use this feature, you need to create a Health Plan Assistant
            first.
          </p>
          <div className="bg-muted rounded border p-4">
            <p className="mb-2 font-medium">Steps to set up:</p>
            <ol className="text-muted-foreground ml-4 list-decimal space-y-1 text-sm">
              <li>Create a new Assistant</li>
              <li>
                Create a Collection with type <code>health_plan</code>
              </li>
              <li>Associate the Collection with the Assistant</li>
              <li>Return to this page to manage workspace permissions</li>
            </ol>
          </div>
        </div>
      )
    }

    return (
      <div className="bg-destructive/10 border-destructive rounded-lg border p-4">
        <p className="text-destructive font-medium">Error: {error}</p>
        <button
          onClick={loadWorkspaces}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 rounded px-4 py-2"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconShield size={24} className="text-primary" />
        <h2 className="text-xl font-bold">
          Health Plan Assistant - Workspace Permissions
        </h2>
      </div>

      {error && (
        <div className="bg-destructive/10 border-destructive rounded border p-3">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      <div className="text-muted-foreground text-sm">
        Grant or revoke access to the Health Plan Assistant for workspaces. Only
        workspace owners can manage permissions.
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left">Workspace</th>
              <th className="p-3 text-left">Description</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map(({ workspace, hasAccess }) => (
              <tr key={workspace.id} className="border-t">
                <td className="p-3 font-medium">{workspace.name}</td>
                <td className="text-muted-foreground p-3 text-sm">
                  {workspace.description || "No description"}
                </td>
                <td className="p-3 text-center">
                  {hasAccess ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-500">
                      <IconCheck size={16} />
                      Authorized
                    </span>
                  ) : (
                    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm">
                      <IconX size={16} />
                      No Access
                    </span>
                  )}
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => handleToggleAccess(workspace.id, hasAccess)}
                    disabled={processingId === workspace.id}
                    className={`rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                      hasAccess
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {processingId === workspace.id ? (
                      <IconLoader className="animate-spin" size={16} />
                    ) : hasAccess ? (
                      "Revoke"
                    ) : (
                      "Grant"
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {workspaces.length === 0 && !loading && (
        <div className="bg-muted rounded-lg p-8 text-center">
          <p className="text-muted-foreground">No workspaces found</p>
        </div>
      )}
    </div>
  )
}
