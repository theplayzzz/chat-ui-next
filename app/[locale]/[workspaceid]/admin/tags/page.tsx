"use client"

import { useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { TagTable } from "@/components/tags/TagTable"
import { TagCreateModal } from "@/components/tags/TagCreateModal"

export default function TagsAdminPage() {
  const params = useParams()
  const workspaceId = params.workspaceid as string
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleCreated = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Tag Management</h1>
      <p className="text-muted-foreground mb-4">
        Manage semantic tags used for chunk classification and search boosting.
      </p>

      <TagTable
        key={refreshKey}
        workspaceId={workspaceId}
        onCreateClick={() => setShowCreateModal(true)}
        onEditClick={tag => {
          // TODO: Open edit modal
          console.log("Edit tag:", tag)
        }}
      />

      <TagCreateModal
        workspaceId={workspaceId}
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
