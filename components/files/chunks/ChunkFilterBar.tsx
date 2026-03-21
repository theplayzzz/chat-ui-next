"use client"

interface ChunkFilterBarProps {
  tags: string[]
  selectedTag: string | null
  onTagChange: (tag: string | null) => void
  totalChunks: number
  filteredCount: number
}

export function ChunkFilterBar({
  tags,
  selectedTag,
  onTagChange,
  totalChunks,
  filteredCount
}: ChunkFilterBarProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Filter by tag:</span>
        <select
          className="bg-background rounded border px-2 py-1 text-sm"
          value={selectedTag || ""}
          onChange={e => onTagChange(e.target.value || null)}
        >
          <option value="">All tags</option>
          {tags.map(tag => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>
      <span className="text-muted-foreground text-xs">
        Showing {filteredCount} of {totalChunks} chunks
      </span>
    </div>
  )
}
