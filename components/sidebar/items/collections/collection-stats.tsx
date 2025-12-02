import { supabase } from "@/lib/supabase/browser-client"
import { IconFile, IconHash, IconLetterCase } from "@tabler/icons-react"
import { FC, useEffect, useState } from "react"

interface CollectionStatsProps {
  collectionId: string
  chunkSize?: number
}

interface Stats {
  totalFiles: number
  estimatedChunks: number
  estimatedTokens: number
  loading: boolean
}

export const CollectionStats: FC<CollectionStatsProps> = ({
  collectionId,
  chunkSize = 4000
}) => {
  const [stats, setStats] = useState<Stats>({
    totalFiles: 0,
    estimatedChunks: 0,
    estimatedTokens: 0,
    loading: true
  })

  useEffect(() => {
    const loadStats = async () => {
      try {
        // Query collection_files with nested files including tokens
        const { data: collectionFiles, error } = await supabase
          .from("collection_files")
          .select("file_id, files(id, tokens)")
          .eq("collection_id", collectionId)

        if (error) throw error

        const files = collectionFiles || []
        const totalFiles = files.length
        const totalTokens = files.reduce(
          (sum, cf) => sum + ((cf.files as { tokens?: number })?.tokens || 0),
          0
        )
        // Estimar chunks: tokens / (chunk_size em tokens, ~1 token = 4 chars)
        const chunkSizeInTokens = Math.ceil(chunkSize / 4)
        const estimatedChunks = Math.ceil(totalTokens / chunkSizeInTokens)

        setStats({
          totalFiles,
          estimatedChunks,
          estimatedTokens: totalTokens,
          loading: false
        })
      } catch (error) {
        console.error("Error loading collection stats:", error)
        setStats(prev => ({ ...prev, loading: false }))
      }
    }

    if (collectionId) {
      loadStats()
    }
  }, [collectionId, chunkSize])

  if (stats.loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="animate-pulse">Carregando...</span>
      </div>
    )
  }

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
      <div className="flex items-center gap-1" title="Arquivos">
        <IconFile size={12} />
        <span>{stats.totalFiles}</span>
      </div>

      <div className="flex items-center gap-1" title="Chunks estimados">
        <IconHash size={12} />
        <span>{stats.estimatedChunks}</span>
      </div>

      <div className="flex items-center gap-1" title="Tokens estimados">
        <IconLetterCase size={12} />
        <span>
          {stats.estimatedTokens > 1000
            ? `${Math.round(stats.estimatedTokens / 1000)}k`
            : stats.estimatedTokens}
        </span>
      </div>
    </div>
  )
}
