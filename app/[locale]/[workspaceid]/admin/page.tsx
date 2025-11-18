"use client"

import { WorkspacePermissions } from "@/components/admin/workspace-permissions"
import { ChatbotUIContext } from "@/context/context"
import { IconShield } from "@tabler/icons-react"
import { useContext } from "react"

/**
 * Admin page for managing workspace permissions for health plan assistant
 *
 * Route: /[locale]/[workspaceid]/admin
 *
 * This page allows administrators to grant or revoke access to the Health Plan
 * Assistant for different workspaces.
 */
export default function AdminPage() {
  const { profile } = useContext(ChatbotUIContext)

  // Check if user is admin (basic check - backend will validate properly)
  const isAdmin = profile?.user_id

  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center">
        <div className="bg-destructive/10 border-destructive max-w-md rounded-lg border p-6 text-center">
          <IconShield size={48} className="text-destructive mx-auto mb-4" />
          <h2 className="text-destructive mb-2 text-xl font-bold">
            Access Denied
          </h2>
          <p className="text-muted-foreground">
            You do not have permission to access this page. Only workspace
            administrators can manage permissions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <WorkspacePermissions />
        </div>
      </div>
    </div>
  )
}
