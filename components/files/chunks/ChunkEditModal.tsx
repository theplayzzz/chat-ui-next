"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ChunkEditModalProps {
  chunkId: string
  chunk: {
    content: string
    section_type: string | null
    tags: string[]
    weight: number
    document_context: string | null
  }
  onClose: () => void
  onSaved: () => void
}

export function ChunkEditModal({
  chunkId,
  chunk,
  onClose,
  onSaved
}: ChunkEditModalProps) {
  const [tags, setTags] = useState(chunk.tags.join(", "))
  const [weight, setWeight] = useState(String(chunk.weight))
  const [content, setContent] = useState(chunk.content)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // In production, this would call a PATCH API
      console.log("Saving chunk:", {
        id: chunkId,
        tags: tags
          .split(",")
          .map(t => t.trim())
          .filter(Boolean),
        weight: parseFloat(weight),
        content
      })
      onSaved()
    } catch (error) {
      console.error("Failed to save chunk:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Edit Chunk</h2>

        <div className="space-y-4">
          <div>
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} />
          </div>

          <div>
            <Label>Weight</Label>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              max="5.0"
              value={weight}
              onChange={e => setWeight(e.target.value)}
            />
          </div>

          {chunk.document_context && (
            <div>
              <Label>Context (read-only)</Label>
              <div className="bg-muted rounded p-2 text-sm">
                {chunk.document_context}
              </div>
            </div>
          )}

          <div>
            <Label>Content</Label>
            <textarea
              className="bg-background h-40 w-full rounded border p-2 text-sm"
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
