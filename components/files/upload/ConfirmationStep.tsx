"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AnalysisResult {
  sugerir_nome: string
  sugerir_descricao: string
  operadora: string
  tipo_plano: string
  abrangencia: string
  secoes_detectadas: string[]
  tags_sugeridas: string[]
  chunk_size_recomendado: number
  chunk_overlap_recomendado: number
  justificativa_chunking: string
}

interface ConfirmationStepProps {
  analysis: AnalysisResult
  onConfirm: (confirmed: {
    name: string
    description: string
    chunkSize: number
    chunkOverlap: number
    tags: string[]
  }) => void
  onCancel: () => void
}

export function ConfirmationStep({
  analysis,
  onConfirm,
  onCancel
}: ConfirmationStepProps) {
  const [name, setName] = useState(analysis.sugerir_nome)
  const [description, setDescription] = useState(analysis.sugerir_descricao)
  const [chunkSize, setChunkSize] = useState(analysis.chunk_size_recomendado)
  const [chunkOverlap, setChunkOverlap] = useState(
    analysis.chunk_overlap_recomendado
  )
  const [selectedTags, setSelectedTags] = useState<string[]>(
    analysis.tags_sugeridas
  )

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Pré-análise concluída</h3>

      <div className="grid gap-4">
        <div>
          <Label>Nome sugerido</Label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div>
          <Label>Descrição</Label>
          <textarea
            className="bg-background w-full rounded border p-2 text-sm"
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Operadora: {analysis.operadora}</Label>
          </div>
          <div>
            <Label>
              Tipo: {analysis.tipo_plano} | {analysis.abrangencia}
            </Label>
          </div>
        </div>

        <div>
          <Label>Seções detectadas</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {analysis.secoes_detectadas.map(section => (
              <span
                key={section}
                className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs"
              >
                {section}
              </span>
            ))}
          </div>
        </div>

        <div>
          <Label>Tags sugeridas</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {[
              ...new Set([
                ...analysis.tags_sugeridas,
                ...analysis.secoes_detectadas
              ])
            ].map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded px-2 py-0.5 text-xs ${
                  selectedTags.includes(tag)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Chunk Size</Label>
            <Input
              type="number"
              value={chunkSize}
              onChange={e => setChunkSize(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Chunk Overlap</Label>
            <Input
              type="number"
              value={chunkOverlap}
              onChange={e => setChunkOverlap(Number(e.target.value))}
            />
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          {analysis.justificativa_chunking}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() =>
            onConfirm({
              name,
              description,
              chunkSize,
              chunkOverlap,
              tags: selectedTags
            })
          }
        >
          Confirmar e Processar
        </Button>
      </div>
    </div>
  )
}
