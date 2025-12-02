import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { supabase } from "@/lib/supabase/browser-client"
import { IconCheck, IconLoader2, IconRefresh, IconX } from "@tabler/icons-react"
import { FC, useCallback, useEffect, useState } from "react"

interface ProcessingStatusProps {
  collectionId: string
  onReprocess?: () => void
}

interface ProcessingState {
  total: number
  processed: number
  failed: number
  loading: boolean
}

export const ProcessingStatus: FC<ProcessingStatusProps> = ({
  collectionId,
  onReprocess
}) => {
  const [status, setStatus] = useState<ProcessingState>({
    total: 0,
    processed: 0,
    failed: 0,
    loading: true
  })
  const [isReprocessing, setIsReprocessing] = useState(false)

  const loadProcessingStatus = useCallback(async () => {
    try {
      // Get all files in this collection
      const { data: collectionFiles, error: cfError } = await supabase
        .from("collection_files")
        .select("file_id")
        .eq("collection_id", collectionId)

      if (cfError) throw cfError

      if (!collectionFiles || collectionFiles.length === 0) {
        setStatus({ total: 0, processed: 0, failed: 0, loading: false })
        return
      }

      const fileIds = collectionFiles.map(cf => cf.file_id)

      // Check how many files have been processed (have file_items)
      const { data: processedFiles, error: pError } = await supabase
        .from("file_items")
        .select("file_id")
        .in("file_id", fileIds)

      if (pError) throw pError

      // Get unique processed file IDs
      const processedFileIds = new Set(
        processedFiles?.map(pf => pf.file_id) || []
      )

      setStatus({
        total: fileIds.length,
        processed: processedFileIds.size,
        failed: 0, // We don't track failed status in current schema
        loading: false
      })
    } catch (error) {
      console.error("Error loading processing status:", error)
      setStatus(prev => ({ ...prev, loading: false }))
    }
  }, [collectionId])

  useEffect(() => {
    if (collectionId) {
      loadProcessingStatus()
    }
  }, [collectionId, loadProcessingStatus])

  // Polling when processing is in progress
  useEffect(() => {
    if (
      status.processed < status.total &&
      status.total > 0 &&
      !status.loading
    ) {
      const interval = setInterval(loadProcessingStatus, 10000) // Poll every 10s
      return () => clearInterval(interval)
    }
  }, [status.processed, status.total, status.loading, loadProcessingStatus])

  const handleReprocess = async () => {
    setIsReprocessing(true)
    try {
      if (onReprocess) {
        onReprocess()
      }
      // Reload status after reprocess trigger
      await loadProcessingStatus()
    } finally {
      setIsReprocessing(false)
    }
  }

  if (status.loading) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <IconLoader2 size={14} className="animate-spin" />
        <span className="text-muted-foreground">Verificando status...</span>
      </div>
    )
  }

  if (status.total === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        Nenhum arquivo na collection
      </div>
    )
  }

  const isComplete = status.processed === status.total
  const hasFailed = status.failed > 0
  const isProcessing = status.processed < status.total && !hasFailed
  const progressPercent = (status.processed / status.total) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete && !hasFailed && (
            <Badge
              variant="default"
              className="gap-1 bg-green-500/10 text-green-500"
            >
              <IconCheck size={12} />
              Processado
            </Badge>
          )}
          {isProcessing && (
            <Badge
              variant="secondary"
              className="gap-1 bg-blue-500/10 text-blue-500"
            >
              <IconLoader2 size={12} className="animate-spin" />
              Processando {status.processed}/{status.total}
            </Badge>
          )}
          {hasFailed && (
            <Badge
              variant="destructive"
              className="gap-1 bg-red-500/10 text-red-500"
            >
              <IconX size={12} />
              Erro ({status.failed})
            </Badge>
          )}
        </div>

        {onReprocess && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleReprocess}
            disabled={isReprocessing || isProcessing}
            className="h-7 gap-1 px-2 text-xs"
          >
            <IconRefresh
              size={12}
              className={isReprocessing ? "animate-spin" : ""}
            />
            Reprocessar
          </Button>
        )}
      </div>

      {isProcessing && <Progress value={progressPercent} className="h-1.5" />}

      <div className="text-muted-foreground text-xs">
        {status.processed} de {status.total} arquivo
        {status.total !== 1 ? "s" : ""} processado
        {status.processed !== 1 ? "s" : ""}
      </div>
    </div>
  )
}
