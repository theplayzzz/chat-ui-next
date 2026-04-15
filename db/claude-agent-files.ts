/**
 * Client wrappers for Claude Agent files.
 * All operations go through /api/claude-agent/files (which proxies to Docker + Supabase).
 */

export interface ClaudeAgentFile {
  id: string
  filename: string
  size_bytes: number
  uploaded_by: string | null
  uploaded_at: string
}

export async function listClaudeAgentFiles(): Promise<ClaudeAgentFile[]> {
  const resp = await fetch("/api/claude-agent/files")
  if (!resp.ok) {
    throw new Error(`Failed to list files: ${resp.status}`)
  }
  const data = await resp.json()
  return data.files ?? []
}

export async function uploadClaudeAgentFile(
  file: File
): Promise<ClaudeAgentFile> {
  const form = new FormData()
  form.append("file", file)
  const resp = await fetch("/api/claude-agent/files", {
    method: "POST",
    body: form
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Upload failed" }))
    throw new Error(err.error ?? `Upload failed: ${resp.status}`)
  }
  const data = await resp.json()
  return data.file
}

export async function deleteClaudeAgentFile(id: string): Promise<void> {
  const resp = await fetch(`/api/claude-agent/files/${id}`, {
    method: "DELETE"
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Delete failed" }))
    throw new Error(err.error ?? `Delete failed: ${resp.status}`)
  }
}
