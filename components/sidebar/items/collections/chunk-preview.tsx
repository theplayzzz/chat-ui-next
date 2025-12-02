import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { IconEye } from "@tabler/icons-react"
import { FC, useMemo, useState } from "react"

interface ChunkPreviewProps {
  chunkSize: number
  chunkOverlap: number
}

interface PreviewChunk {
  index: number
  content: string
  overlapStart: number
  overlapEnd: number
}

export const ChunkPreview: FC<ChunkPreviewProps> = ({
  chunkSize,
  chunkOverlap
}) => {
  const [sampleText, setSampleText] = useState("")
  const [isOpen, setIsOpen] = useState(false)

  const previewChunks = useMemo(() => {
    if (!sampleText) return []

    const chunks: PreviewChunk[] = []
    let start = 0
    const maxChunks = 5

    for (let i = 0; i < maxChunks && start < sampleText.length; i++) {
      const end = Math.min(start + chunkSize, sampleText.length)
      chunks.push({
        index: i,
        content: sampleText.slice(start, end),
        overlapStart: i > 0 ? chunkOverlap : 0,
        overlapEnd: end < sampleText.length ? chunkOverlap : 0
      })
      start = end - chunkOverlap
      if (start >= sampleText.length) break
    }

    return chunks
  }, [sampleText, chunkSize, chunkOverlap])

  const stats = useMemo(() => {
    if (!sampleText) {
      return {
        estimatedChunks: 0,
        estimatedTokens: 0,
        avgChunkSize: 0
      }
    }

    const effectiveChunkSize = chunkSize - chunkOverlap
    const estimatedChunks = Math.ceil(sampleText.length / effectiveChunkSize)
    const estimatedTokens = Math.ceil(sampleText.length / 4) // ~4 chars per token

    return {
      estimatedChunks,
      estimatedTokens,
      avgChunkSize: Math.round(sampleText.length / Math.max(1, estimatedChunks))
    }
  }, [sampleText, chunkSize, chunkOverlap])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <IconEye size={16} />
          Preview Chunking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview de Divisão em Chunks</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Cole um texto de exemplo para visualizar a divisão:
            </label>
            <Textarea
              value={sampleText}
              onChange={e => setSampleText(e.target.value)}
              placeholder="Cole aqui um trecho do documento para visualizar como será dividido em chunks..."
              className="min-h-[100px]"
            />
          </div>

          {sampleText && (
            <>
              <div className="bg-muted grid grid-cols-3 gap-4 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-500">
                    {stats.estimatedChunks}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Chunks Estimados
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {stats.estimatedTokens.toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Tokens Estimados
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-500">
                    {stats.avgChunkSize}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Chars/Chunk Médio
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Preview dos primeiros {previewChunks.length} chunks:
                  </span>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span className="inline-block size-3 rounded bg-yellow-500/30" />
                    Área de overlap
                  </div>
                </div>

                <div className="space-y-3">
                  {previewChunks.map(chunk => (
                    <div
                      key={chunk.index}
                      className="bg-background rounded-lg border p-3"
                    >
                      <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium">
                          Chunk {chunk.index + 1}
                        </span>
                        <span>{chunk.content.length} caracteres</span>
                      </div>
                      <div className="break-words text-xs leading-relaxed">
                        {chunk.overlapStart > 0 && (
                          <span className="rounded bg-yellow-500/30 px-0.5">
                            {chunk.content.slice(0, chunk.overlapStart)}
                          </span>
                        )}
                        <span>
                          {chunk.content.slice(
                            chunk.overlapStart,
                            chunk.content.length - chunk.overlapEnd
                          )}
                        </span>
                        {chunk.overlapEnd > 0 && (
                          <span className="rounded bg-yellow-500/30 px-0.5">
                            {chunk.content.slice(
                              chunk.content.length - chunk.overlapEnd
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {stats.estimatedChunks > previewChunks.length && (
                  <p className="text-muted-foreground text-center text-xs">
                    + {stats.estimatedChunks - previewChunks.length} chunks
                    adicionais não exibidos
                  </p>
                )}
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">
                  <strong>Configuração atual:</strong> Cada chunk terá até{" "}
                  {chunkSize} caracteres, com sobreposição de {chunkOverlap}{" "}
                  caracteres entre chunks adjacentes.
                </p>
              </div>
            </>
          )}

          {!sampleText && (
            <div className="bg-muted/50 rounded-lg p-8 text-center">
              <IconEye
                size={32}
                className="text-muted-foreground mx-auto mb-2"
              />
              <p className="text-muted-foreground text-sm">
                Cole um texto acima para visualizar como será dividido em chunks
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
