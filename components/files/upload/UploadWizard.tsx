"use client"

import { useState, useContext, useCallback, useRef } from "react"
import { ChatbotUIContext } from "@/context/context"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ACCEPTED_FILE_TYPES } from "@/components/chat/chat-hooks/use-select-file-handler"
import { PreAnalysisStep } from "./PreAnalysisStep"
import { ConfirmationStep } from "./ConfirmationStep"
import { ProcessingProgress } from "./ProcessingProgress"
import { UploadSummaryTable } from "./UploadSummaryTable"
import { supabase } from "@/lib/supabase/browser-client"
import { uploadFile } from "@/db/storage/files"
import { createFileWorkspace } from "@/db/files"
import { toast } from "sonner"
import { IconUpload, IconLoader2, IconAlertCircle } from "@tabler/icons-react"

type WizardStep =
  | "FILE_SELECT"
  | "ANALYZING"
  | "CONFIRMATION"
  | "PROCESSING"
  | "SUMMARY"

interface UploadWizardProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onFileCreated?: (fileId: string) => void
}

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

interface SummaryData {
  fileName: string
  fileType: string
  fileSize: number
  chunksCreated: number
  chunkSize: number
  chunkOverlap: number
  tags: string[]
  planType: string | null
  totalTokens: number
  processingTimeMs: number
}

const DEFAULT_ANALYSIS: AnalysisResult = {
  sugerir_nome: "",
  sugerir_descricao: "",
  operadora: "N/A",
  tipo_plano: "N/A",
  abrangencia: "N/A",
  secoes_detectadas: [],
  tags_sugeridas: [],
  chunk_size_recomendado: 4000,
  chunk_overlap_recomendado: 200,
  justificativa_chunking:
    "Valores padrão. A pré-análise não foi executada para este tipo de arquivo."
}

export function UploadWizard({
  isOpen,
  onOpenChange,
  onFileCreated
}: UploadWizardProps) {
  const { profile, selectedWorkspace, setFiles } = useContext(ChatbotUIContext)

  const [step, setStep] = useState<WizardStep>("FILE_SELECT")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileText, setFileText] = useState<string>("")
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [correlationId, setCorrelationId] = useState<string>("")
  const [createdFileId, setCreatedFileId] = useState<string>("")
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [error, setError] = useState<string>("")
  const [isExtracting, setIsExtracting] = useState(false)

  // Track confirmed config for summary
  const confirmedConfigRef = useRef<{
    name: string
    description: string
    chunkSize: number
    chunkOverlap: number
    tags: string[]
  } | null>(null)

  const startTimeRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetWizard = useCallback(() => {
    setStep("FILE_SELECT")
    setSelectedFile(null)
    setFileText("")
    setAnalysis(null)
    setCorrelationId("")
    setCreatedFileId("")
    setSummaryData(null)
    setError("")
    setIsExtracting(false)
    confirmedConfigRef.current = null
    startTimeRef.current = 0
  }, [])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetWizard()
      }
      onOpenChange(open)
    },
    [onOpenChange, resetWizard]
  )

  // Step 1: File selection
  // Supports both React synthetic events and native DOM events (for Playwright/automation)
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement> | Event) => {
      const input =
        "target" in e ? (e.target as HTMLInputElement) : fileInputRef.current
      if (!input?.files || !input.files[0]) return

      const file = input.files[0]
      setSelectedFile(file)
      setError("")
    },
    []
  )

  const handleProceedToAnalysis = async () => {
    if (!selectedFile) return

    const simplifiedType = getSimplifiedType(selectedFile)

    // For text-based files, extract text and run pre-analysis
    if (["txt", "md", "csv", "json"].includes(simplifiedType)) {
      setIsExtracting(true)
      try {
        const text = await selectedFile.text()
        setFileText(text)
        setIsExtracting(false)
        setStep("ANALYZING")
      } catch {
        setIsExtracting(false)
        setError("Erro ao ler o arquivo")
      }
    } else {
      // For PDF/DOCX, skip pre-analysis and go to confirmation with defaults
      const baseName = selectedFile.name.split(".").slice(0, -1).join(".")
      const defaultAnalysis: AnalysisResult = {
        ...DEFAULT_ANALYSIS,
        sugerir_nome: baseName,
        sugerir_descricao: `Documento ${simplifiedType.toUpperCase()}: ${baseName}`
      }
      setAnalysis(defaultAnalysis)
      setStep("CONFIRMATION")
    }
  }

  // Step 2: Analysis complete
  const handleAnalysisComplete = (result: AnalysisResult) => {
    setAnalysis(result)
    setStep("CONFIRMATION")
  }

  const handleAnalysisError = (errorMsg: string) => {
    // On analysis error, fall back to defaults
    const baseName = selectedFile
      ? selectedFile.name.split(".").slice(0, -1).join(".")
      : "arquivo"
    const defaultAnalysis: AnalysisResult = {
      ...DEFAULT_ANALYSIS,
      sugerir_nome: baseName,
      sugerir_descricao: `Arquivo: ${baseName}`
    }
    setAnalysis(defaultAnalysis)
    setStep("CONFIRMATION")
    toast.error(`Pré-análise falhou: ${errorMsg}. Usando valores padrão.`)
  }

  // Step 3: Confirmation -> create file and process
  const handleConfirm = async (confirmed: {
    name: string
    description: string
    chunkSize: number
    chunkOverlap: number
    tags: string[]
  }) => {
    if (!selectedFile || !profile || !selectedWorkspace) return

    confirmedConfigRef.current = confirmed
    startTimeRef.current = Date.now()
    setStep("PROCESSING")

    try {
      const simplifiedType = getSimplifiedType(selectedFile)

      // Sanitize file name for storage
      let validFilename = confirmed.name
        .replace(/[^a-z0-9.]/gi, "_")
        .toLowerCase()
      const extension = selectedFile.name.split(".").pop()
      const extensionIndex = validFilename.lastIndexOf(".")
      const baseName = validFilename.substring(
        0,
        extensionIndex < 0 ? undefined : extensionIndex
      )
      const maxBaseNameLength = 100 - (extension?.length || 0) - 1
      const storageName =
        baseName.length > maxBaseNameLength
          ? baseName.substring(0, maxBaseNameLength) + "." + extension
          : baseName + "." + extension

      // 1. Create file record in DB
      const { data: createdFile, error: insertError } = await supabase
        .from("files")
        .insert([
          {
            user_id: profile.user_id,
            name: storageName,
            description: confirmed.description,
            file_path: "",
            size: selectedFile.size,
            tokens: 0,
            type: simplifiedType,
            chunk_size: confirmed.chunkSize,
            chunk_overlap: confirmed.chunkOverlap
          }
        ])
        .select("*")
        .single()

      if (insertError || !createdFile) {
        throw new Error(
          insertError?.message || "Falha ao criar registro do arquivo"
        )
      }

      setCreatedFileId(createdFile.id)

      // 2. Create file-workspace association
      await createFileWorkspace({
        user_id: createdFile.user_id,
        file_id: createdFile.id,
        workspace_id: selectedWorkspace.id
      })

      // 3. Upload file to storage
      const filePath = await uploadFile(selectedFile, {
        name: createdFile.name,
        user_id: createdFile.user_id,
        file_id: createdFile.name
      })

      // 4. Update file_path
      await supabase
        .from("files")
        .update({ file_path: filePath })
        .eq("id", createdFile.id)

      // 5. Always enable Level 3 enrichment (tags, context, plan_type)
      await supabase
        .from("files")
        .update({
          ingestion_metadata: {
            tags: confirmed.tags.length > 0 ? confirmed.tags : [],
            enableLevel3: true
          }
        } as any)
        .eq("id", createdFile.id)

      // 6. Call /api/retrieval/process
      const formData = new FormData()
      formData.append("file_id", createdFile.id)
      formData.append("embeddingsProvider", "openai")

      const response = await fetch("/api/retrieval/process", {
        method: "POST",
        body: formData
      })

      if (!response.ok) {
        const jsonText = await response.text()
        const json = JSON.parse(jsonText)
        throw new Error(json.message || "Falha no processamento")
      }

      const result = await response.json()
      setCorrelationId(result.correlationId || "")

      // If no correlationId (basic flow without Level 3), go straight to summary
      const processingTime = Date.now() - startTimeRef.current

      // Fetch updated file to get token count
      const { data: updatedFile } = await supabase
        .from("files")
        .select("*")
        .eq("id", createdFile.id)
        .single()

      if (updatedFile) {
        setFiles(prev => [...prev, updatedFile])
      }

      setSummaryData({
        fileName: confirmed.name,
        fileType: simplifiedType,
        fileSize: selectedFile.size,
        chunksCreated: result.chunksCreated || 0,
        chunkSize: confirmed.chunkSize,
        chunkOverlap: confirmed.chunkOverlap,
        tags: confirmed.tags,
        planType: analysis?.tipo_plano || null,
        totalTokens: result.totalTokens || updatedFile?.tokens || 0,
        processingTimeMs: processingTime
      })

      // If there's a correlation ID and Level 3 is enabled, poll progress
      if (result.correlationId && confirmed.tags.length > 0) {
        // ProcessingProgress component will handle polling
        // It stays on PROCESSING step until complete
        return
      }

      // Otherwise go directly to summary
      setStep("SUMMARY")
      onFileCreated?.(createdFile.id)
    } catch (err: any) {
      console.error("Upload failed:", err)
      setError(err?.message || "Erro no upload")
      toast.error("Falha no upload: " + (err?.message || "Erro desconhecido"), {
        duration: 10000
      })
      setStep("FILE_SELECT")
    }
  }

  // Step 4: Processing complete (from ProcessingProgress poll)
  const handleProcessingComplete = useCallback(
    (hasError: boolean) => {
      const processingTime = Date.now() - startTimeRef.current

      if (summaryData) {
        setSummaryData(prev =>
          prev ? { ...prev, processingTimeMs: processingTime } : prev
        )
      }

      if (hasError) {
        toast.error(
          "Processamento concluído com erros. Verifique os logs para detalhes."
        )
      }

      setStep("SUMMARY")
      if (createdFileId) {
        onFileCreated?.(createdFileId)
      }
    },
    [summaryData, createdFileId, onFileCreated]
  )

  const handleUploadAnother = () => {
    resetWizard()
  }

  const handleClose = () => {
    handleOpenChange(false)
  }

  // Cancel from confirmation goes back to file select
  const handleCancel = () => {
    resetWizard()
  }

  if (!profile || !selectedWorkspace) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "FILE_SELECT" && "Upload de Arquivo"}
            {step === "ANALYZING" && "Analisando Documento"}
            {step === "CONFIRMATION" && "Confirmar Configuração"}
            {step === "PROCESSING" && "Processando"}
            {step === "SUMMARY" && "Resumo do Upload"}
          </DialogTitle>
          <DialogDescription>
            {step === "FILE_SELECT" &&
              "Selecione um arquivo para upload e processamento RAG."}
            {step === "ANALYZING" &&
              "Analisando o documento para sugerir configurações..."}
            {step === "CONFIRMATION" &&
              "Revise e ajuste as configurações antes de processar."}
            {step === "PROCESSING" &&
              "O arquivo está sendo processado. Aguarde..."}
            {step === "SUMMARY" && "Processamento finalizado."}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: File Select */}
        {step === "FILE_SELECT" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect as any}
                accept={ACCEPTED_FILE_TYPES}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="file-upload-input"
              />
              {selectedFile && (
                <p className="text-muted-foreground text-xs">
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)}{" "}
                  KB)
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <IconAlertCircle size={16} />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleProceedToAnalysis}
                disabled={!selectedFile || isExtracting}
              >
                {isExtracting ? (
                  <>
                    <IconLoader2 className="mr-2 animate-spin" size={16} />
                    Lendo arquivo...
                  </>
                ) : (
                  <>
                    <IconUpload className="mr-2" size={16} />
                    Próximo
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Analyzing */}
        {step === "ANALYZING" && (
          <PreAnalysisStep
            fileText={fileText}
            onAnalysisComplete={handleAnalysisComplete}
            onError={handleAnalysisError}
          />
        )}

        {/* STEP 3: Confirmation */}
        {step === "CONFIRMATION" && analysis && (
          <ConfirmationStep
            analysis={analysis}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}

        {/* STEP 4: Processing */}
        {step === "PROCESSING" && (
          <>
            {correlationId ? (
              <ProcessingProgress
                correlationId={correlationId}
                onComplete={handleProcessingComplete}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 p-8">
                <IconLoader2 className="text-primary animate-spin" size={32} />
                <p className="text-sm">Enviando e processando arquivo...</p>
              </div>
            )}
          </>
        )}

        {/* STEP 5: Summary */}
        {step === "SUMMARY" && summaryData && (
          <UploadSummaryTable
            {...summaryData}
            onClose={handleClose}
            onUploadAnother={handleUploadAnother}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function getSimplifiedType(file: File): string {
  const type = file.type
  if (type.includes("pdf")) return "pdf"
  if (
    type.includes("vnd.openxmlformats-officedocument.wordprocessingml.document")
  )
    return "docx"
  if (type.includes("csv")) return "csv"
  if (type.includes("json")) return "json"
  if (type.includes("markdown")) return "md"
  if (type.includes("plain")) return "txt"

  // Fallback: use file extension
  const ext = file.name.split(".").pop()?.toLowerCase()
  return ext || "txt"
}
