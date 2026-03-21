"use client"

import { useState, useEffect } from "react"

interface PreAnalysisResult {
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

interface PreAnalysisStepProps {
  fileText: string
  onAnalysisComplete: (analysis: PreAnalysisResult) => void
  onError: (error: string) => void
}

export function PreAnalysisStep({
  fileText,
  onAnalysisComplete,
  onError
}: PreAnalysisStepProps) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState("Iniciando análise...")

  useEffect(() => {
    runAnalysis()
  }, [fileText])

  const runAnalysis = async () => {
    try {
      setStatus("Analisando documento...")
      setProgress(20)

      const response = await fetch("/api/files/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fileText })
      })

      setProgress(60)
      setStatus("Identificando seções...")

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Análise falhou")
      }

      setProgress(90)
      setStatus("Finalizando...")

      const analysis = await response.json()
      setProgress(100)
      onAnalysisComplete(analysis)
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro na análise")
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="text-center">
        <p className="mb-2 text-sm font-medium">{status}</p>
        <div className="bg-muted mx-auto h-2 w-full max-w-md overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{progress}%</p>
      </div>
    </div>
  )
}
