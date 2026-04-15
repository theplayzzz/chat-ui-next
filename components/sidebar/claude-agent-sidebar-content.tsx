/**
 * Sidebar content para Claude Agent: upload simples + lista com trash.
 * Usa claudeAgentFiles do ChatbotUIContext. Não reaproveita UploadWizard/SidebarDataList
 * porque o Claude Agent não precisa de chunking/embedding/folders/drag-drop.
 */

import { ChatbotUIContext } from "@/context/context"
import {
  deleteClaudeAgentFile,
  listClaudeAgentFiles,
  uploadClaudeAgentFile
} from "@/db/claude-agent-files"
import {
  IconFileText,
  IconLoader2,
  IconTrash,
  IconUpload
} from "@tabler/icons-react"
import { FC, useContext, useRef, useState } from "react"
import { toast } from "sonner"

export const ClaudeAgentSidebarContent: FC = () => {
  const { claudeAgentFiles, setClaudeAgentFiles } = useContext(ChatbotUIContext)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = claudeAgentFiles.filter(f =>
    f.filename.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadClaudeAgentFile(file)
        toast.success(`Uploaded: ${uploaded.filename}`)
      }
      // Reload list to capture auto-renames
      const fresh = await listClaudeAgentFiles()
      setClaudeAgentFiles(fresh)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Upload failed: ${msg}`)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return
    setDeletingId(id)
    try {
      await deleteClaudeAgentFile(id)
      setClaudeAgentFiles(prev => prev.filter(f => f.id !== id))
      toast.success(`Deleted: ${filename}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Delete failed: ${msg}`)
    } finally {
      setDeletingId(null)
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex max-h-[calc(100%-50px)] grow flex-col">
      <div className="mt-2 flex items-center">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="border-input bg-background hover:bg-accent hover:text-accent-foreground flex h-[36px] grow items-center justify-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50"
        >
          {uploading ? (
            <IconLoader2 size={16} className="animate-spin" />
          ) : (
            <IconUpload size={16} />
          )}
          <span>{uploading ? "Uploading..." : "Upload File"}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      <div className="mt-2">
        <input
          type="text"
          placeholder="Search files..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        />
      </div>

      <div className="mt-2 flex flex-1 flex-col gap-1 overflow-auto">
        {filtered.length === 0 && (
          <div className="text-muted-foreground mt-4 text-center text-xs">
            {claudeAgentFiles.length === 0
              ? "Nenhum arquivo. Clique em Upload para enviar PDFs."
              : "Nenhum resultado."}
          </div>
        )}
        {filtered.map(file => (
          <div
            key={file.id}
            className="hover:bg-accent flex items-center gap-2 rounded-md p-2"
          >
            <IconFileText size={18} className="shrink-0 opacity-70" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm" title={file.filename}>
                {file.filename}
              </div>
              <div className="text-muted-foreground text-xs">
                {formatSize(file.size_bytes)}
              </div>
            </div>
            <button
              type="button"
              disabled={deletingId === file.id}
              onClick={() => handleDelete(file.id, file.filename)}
              className="hover:text-destructive shrink-0 opacity-60 hover:opacity-100 disabled:opacity-30"
              title="Delete"
            >
              {deletingId === file.id ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconTrash size={16} />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
