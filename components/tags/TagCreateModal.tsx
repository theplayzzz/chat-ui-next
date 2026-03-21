"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TagCreateModalProps {
  workspaceId: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const COLORS = [
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#14b8a6",
  "#6b7280",
  "#94a3b8",
  "#ec4899"
]

export function TagCreateModal({
  workspaceId,
  open,
  onClose,
  onCreated
}: TagCreateModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [weightBoost, setWeightBoost] = useState("1.0")
  const [color, setColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name,
          slug,
          description: description || null,
          weight_boost: parseFloat(weightBoost),
          color
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create tag")
      }

      setName("")
      setDescription("")
      setWeightBoost("1.0")
      onCreated()
      onClose()
    } catch (error) {
      console.error("Failed to create tag:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background w-full max-w-md rounded-lg p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Create New Tag</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Urgência"
              required
            />
            {slug && (
              <p className="text-muted-foreground mt-1 text-xs">Slug: {slug}</p>
            )}
          </div>

          <div>
            <Label htmlFor="tag-desc">Description</Label>
            <Input
              id="tag-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div>
            <Label htmlFor="tag-weight">Weight Boost</Label>
            <Input
              id="tag-weight"
              type="number"
              step="0.1"
              min="0.1"
              max="5.0"
              value={weightBoost}
              onChange={e => setWeightBoost(e.target.value)}
            />
          </div>

          <div>
            <Label>Color</Label>
            <div className="mt-1 flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`size-6 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name || saving}>
              {saving ? "Creating..." : "Create Tag"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
