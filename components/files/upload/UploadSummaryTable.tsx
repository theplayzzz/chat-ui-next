"use client"

import { Button } from "@/components/ui/button"

interface UploadSummaryProps {
  fileName: string
  fileType: string
  fileSize: number
  chunksCreated: number
  chunkSize: number
  chunkOverlap: number
  tags: string[]
  planType?: string | null
  totalTokens: number
  processingTimeMs?: number
  onClose: () => void
  onUploadAnother: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export function UploadSummaryTable({
  fileName,
  fileType,
  fileSize,
  chunksCreated,
  chunkSize,
  chunkOverlap,
  tags,
  planType,
  totalTokens,
  processingTimeMs,
  onClose,
  onUploadAnother
}: UploadSummaryProps) {
  const rows = [
    { label: "Arquivo", value: fileName },
    { label: "Tipo", value: fileType.toUpperCase() },
    { label: "Tamanho", value: formatFileSize(fileSize) },
    { label: "Chunks", value: String(chunksCreated) },
    { label: "Chunk Size", value: `${chunkSize} chars` },
    { label: "Overlap", value: `${chunkOverlap} chars` },
    {
      label: "Tokens",
      value: `${(totalTokens / 1000).toFixed(1)}K`
    },
    { label: "Tags", value: tags.length > 0 ? tags.join(", ") : "\u2014" },
    { label: "Tipo de Plano", value: planType || "\u2014" },
    {
      label: "Tempo",
      value: processingTimeMs
        ? `${(processingTimeMs / 1000).toFixed(1)}s`
        : "\u2014"
    }
  ]

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold text-green-600">
        Upload concluído!
      </h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-muted border-b">
              <td className="text-muted-foreground py-1.5 pr-4 font-medium">
                {r.label}
              </td>
              <td className="py-1.5">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onUploadAnother}>
          Upload Outro Arquivo
        </Button>
        <Button onClick={onClose}>Fechar</Button>
      </div>
    </div>
  )
}
