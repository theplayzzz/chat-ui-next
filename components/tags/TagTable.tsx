"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IconPlus, IconTrash, IconEdit } from "@tabler/icons-react"

interface ChunkTag {
  id: string
  name: string
  slug: string
  description: string | null
  weight_boost: number
  color: string
  is_system: boolean
  parent_tag_id: string | null
}

interface TagTableProps {
  workspaceId: string
  onCreateClick: () => void
  onEditClick: (tag: ChunkTag) => void
}

export function TagTable({
  workspaceId,
  onCreateClick,
  onEditClick
}: TagTableProps) {
  const [tags, setTags] = useState<ChunkTag[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetchTags()
  }, [workspaceId])

  const fetchTags = async () => {
    try {
      const res = await fetch(`/api/tags?workspaceId=${workspaceId}`)
      const data = await res.json()
      setTags(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch tags:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (tag: ChunkTag) => {
    if (tag.is_system) return
    if (!confirm(`Delete tag "${tag.name}"?`)) return

    try {
      await fetch(`/api/tags?id=${tag.id}`, { method: "DELETE" })
      setTags(prev => prev.filter(t => t.id !== tag.id))
    } catch (error) {
      console.error("Failed to delete tag:", error)
    }
  }

  const filtered = tags.filter(
    t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="text-muted-foreground p-4 text-center">
        Loading tags...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search tags..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={onCreateClick} size="sm">
          <IconPlus className="mr-1 size-4" />
          New Tag
        </Button>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="p-2 text-left">Color</th>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Slug</th>
              <th className="p-2 text-left">Weight</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(tag => (
              <tr key={tag.id} className="border-b">
                <td className="p-2">
                  <div
                    className="size-4 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                </td>
                <td className="p-2 font-medium">{tag.name}</td>
                <td className="text-muted-foreground p-2">{tag.slug}</td>
                <td className="p-2">{tag.weight_boost}x</td>
                <td className="p-2">
                  {tag.is_system ? (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      System
                    </span>
                  ) : (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      Custom
                    </span>
                  )}
                </td>
                <td className="p-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditClick(tag)}
                  >
                    <IconEdit className="size-4" />
                  </Button>
                  {!tag.is_system && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(tag)}
                    >
                      <IconTrash className="text-destructive size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
