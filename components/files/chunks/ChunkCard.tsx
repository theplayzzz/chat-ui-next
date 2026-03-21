"use client"

interface ChunkCardProps {
  chunk: {
    id: string
    content: string
    section_type: string | null
    tags: string[]
    weight: number
    page_number: number | null
    document_context: string | null
    tokens: number
  }
  onEdit: (chunkId: string) => void
}

export function ChunkCard({ chunk, onEdit }: ChunkCardProps) {
  return (
    <div className="hover:border-primary/50 rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {chunk.section_type && (
            <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-medium">
              {chunk.section_type}
            </span>
          )}
          {chunk.tags.map(tag => (
            <span key={tag} className="bg-muted rounded px-2 py-0.5 text-xs">
              {tag}
            </span>
          ))}
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {chunk.page_number && <span>p.{chunk.page_number}</span>}
          <span>{chunk.tokens} tokens</span>
          <span>w:{chunk.weight}</span>
        </div>
      </div>

      {chunk.document_context && (
        <div className="mb-2 rounded bg-blue-50 p-2 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {chunk.document_context}
        </div>
      )}

      <p className="line-clamp-4 text-sm">{chunk.content}</p>

      <div className="mt-2 flex justify-end">
        <button
          onClick={() => onEdit(chunk.id)}
          className="text-primary text-xs hover:underline"
        >
          Edit
        </button>
      </div>
    </div>
  )
}
