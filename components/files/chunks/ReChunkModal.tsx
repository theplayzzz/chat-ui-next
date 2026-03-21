"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ReChunkModalProps {
  fileId: string
  currentChunkSize: number
  currentChunkOverlap: number
  currentChunkCount: number
  open: boolean
  onClose: () => void
  onRechunked: () => void
}

export function ReChunkModal({
  fileId,
  currentChunkSize,
  currentChunkOverlap,
  currentChunkCount,
  open,
  onClose,
  onRechunked
}: ReChunkModalProps) {
  const [chunkSize, setChunkSize] = useState(currentChunkSize)
  const [chunkOverlap, setChunkOverlap] = useState(currentChunkOverlap)
  const [processing, setProcessing] = useState(false)

  if (!open) return null

  const estimatedChunks = Math.max(
    1,
    Math.round(currentChunkCount * (currentChunkSize / chunkSize))
  )
  const estimatedCost = (estimatedChunks * 0.001).toFixed(3)

  const handleRechunk = async () => {
    setProcessing(true)
    try {
      const response = await fetch("/api/files/rechunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, chunkSize, chunkOverlap })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Re-chunking failed")
      }

      onRechunked()
      onClose()
    } catch (error) {
      console.error("Re-chunking failed:", error)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background w-full max-w-md rounded-lg p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Re-Chunk File</h2>

        <div className="space-y-4">
          <div>
            <Label>Chunk Size</Label>
            <Input
              type="number"
              min={500}
              max={8000}
              value={chunkSize}
              onChange={e => setChunkSize(Number(e.target.value))}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Current: {currentChunkSize}
            </p>
          </div>

          <div>
            <Label>Chunk Overlap</Label>
            <Input
              type="number"
              min={0}
              max={2000}
              value={chunkOverlap}
              onChange={e => setChunkOverlap(Number(e.target.value))}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Current: {currentChunkOverlap}
            </p>
          </div>

          <div className="bg-muted rounded p-3 text-sm">
            <p>Estimated chunks: ~{estimatedChunks}</p>
            <p>Estimated cost: ~${estimatedCost}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Includes: contextual retrieval, tag inference, embedding
              regeneration
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={processing}>
            Cancel
          </Button>
          <Button onClick={handleRechunk} disabled={processing}>
            {processing ? "Processing..." : "Re-Chunk"}
          </Button>
        </div>
      </div>
    </div>
  )
}
