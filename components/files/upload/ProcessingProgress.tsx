"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { IconCheck, IconLoader2, IconX, IconClock } from "@tabler/icons-react"

interface StageInfo {
  stage: string
  status: "pending" | "started" | "completed" | "failed"
  durationMs?: number | null
  chunksCreated?: number | null
}

interface ProcessingProgressProps {
  correlationId: string
  onComplete: (hasError: boolean) => void
}

const STAGE_LABELS: Record<string, string> = {
  chunking: "Quebrando documento em chunks",
  embedding: "Gerando embeddings",
  tag_inference: "Classificando tags dos chunks",
  context_generation: "Gerando contexto posicional",
  file_embedding: "Embedding do arquivo"
}

export function ProcessingProgress({
  correlationId,
  onComplete
}: ProcessingProgressProps) {
  const [stages, setStages] = useState<StageInfo[]>([
    { stage: "chunking", status: "pending" },
    { stage: "embedding", status: "pending" },
    { stage: "tag_inference", status: "pending" },
    { stage: "context_generation", status: "pending" },
    { stage: "file_embedding", status: "pending" }
  ])
  const intervalRef = useRef<NodeJS.Timeout>()
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/files/progress?correlationId=${correlationId}`
      )
      if (res.ok) {
        const data = await res.json()
        setStages(data.stages)
        if (data.done) {
          clearInterval(intervalRef.current)
          onCompleteRef.current(data.hasError)
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [correlationId])

  useEffect(() => {
    poll() // initial
    intervalRef.current = setInterval(poll, 2000)
    return () => clearInterval(intervalRef.current)
  }, [poll])

  const getIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <IconCheck className="text-green-500" size={18} />
      case "started":
        return <IconLoader2 className="animate-spin text-blue-500" size={18} />
      case "failed":
        return <IconX className="text-red-500" size={18} />
      default:
        return <IconClock className="text-muted-foreground" size={18} />
    }
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm font-medium">Processando arquivo...</p>
      {stages.map(s => (
        <div key={s.stage} className="flex items-center gap-3">
          {getIcon(s.status)}
          <span
            className={`text-sm ${s.status === "pending" ? "text-muted-foreground" : ""}`}
          >
            {STAGE_LABELS[s.stage] || s.stage}
          </span>
          {s.durationMs && s.status === "completed" && (
            <span className="text-muted-foreground ml-auto text-xs">
              {(s.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {s.chunksCreated && (
            <span className="text-muted-foreground text-xs">
              {s.chunksCreated} chunks
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
