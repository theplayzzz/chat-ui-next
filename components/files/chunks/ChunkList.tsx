"use client"

import { useState, useEffect } from "react"
import { ChunkCard } from "./ChunkCard"
import { SectionSidebar } from "./SectionSidebar"
import { ChunkFilterBar } from "./ChunkFilterBar"
import { ChunkEditModal } from "./ChunkEditModal"

interface Chunk {
  id: string
  content: string
  section_type: string | null
  tags: string[]
  weight: number
  page_number: number | null
  document_context: string | null
  tokens: number
}

interface ChunkListProps {
  fileId: string
}

export function ChunkList({ fileId }: ChunkListProps) {
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null)

  useEffect(() => {
    // In a real implementation, this would fetch from an API
    setLoading(false)
  }, [fileId])

  const sections = [
    ...new Set(chunks.filter(c => c.section_type).map(c => c.section_type!))
  ]
  const allTags = [...new Set(chunks.flatMap(c => c.tags))]

  const filtered = chunks.filter(c => {
    if (selectedSection && c.section_type !== selectedSection) return false
    if (selectedTag && !c.tags.includes(selectedTag)) return false
    return true
  })

  if (loading) {
    return (
      <div className="text-muted-foreground p-4 text-center">
        Loading chunks...
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      <SectionSidebar
        sections={sections}
        selectedSection={selectedSection}
        onSelect={setSelectedSection}
        chunkCounts={sections.reduce(
          (acc, s) => {
            acc[s] = chunks.filter(c => c.section_type === s).length
            return acc
          },
          {} as Record<string, number>
        )}
      />

      <div className="flex-1 space-y-4">
        <ChunkFilterBar
          tags={allTags}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
          totalChunks={chunks.length}
          filteredCount={filtered.length}
        />

        <div className="space-y-3">
          {filtered.map(chunk => (
            <ChunkCard
              key={chunk.id}
              chunk={chunk}
              onEdit={setEditingChunkId}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-muted-foreground py-8 text-center">
            No chunks found matching the current filters.
          </p>
        )}
      </div>

      {editingChunkId && (
        <ChunkEditModal
          chunkId={editingChunkId}
          chunk={chunks.find(c => c.id === editingChunkId)!}
          onClose={() => setEditingChunkId(null)}
          onSaved={() => {
            setEditingChunkId(null)
            // Refresh chunks
          }}
        />
      )}
    </div>
  )
}
