/**
 * Grade Documents - Document Grading para Corrective RAG
 *
 * Avalia a relevância de documentos recuperados em relação ao perfil do cliente.
 * Usa GPT-5-mini para classificar documentos como relevant, partially_relevant ou irrelevant.
 *
 * Features:
 * - Batch processing (5 docs por vez) para otimizar tokens
 * - Suporte a GPT-5 (modelKwargs) e outros modelos (temperature)
 * - Fallback robusto quando LLM falha
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: RF-005, Fase 6B.1
 */

import { ChatOpenAI } from "@langchain/openai"

import type { FusedDocument } from "./result-fusion"
import type { ClientInfoForQueries } from "./generate-queries"
import {
  type GradeResult,
  type GradeScore,
  type GradedDocument,
  GradingResponseSchema
} from "../../schemas/rag-schemas"
import {
  GRADE_DOCUMENTS_BATCH_PROMPT,
  GRADING_TEMPERATURE,
  formatClientInfoForPrompt,
  formatDocumentsForBatchPrompt
} from "../../prompts/rag-prompts"

// =============================================================================
// Types
// =============================================================================

export interface GradeDocumentsOptions {
  /** Modelo LLM a usar (default: gpt-5-mini) */
  model?: string
  /** Tamanho do batch para processamento (default: 5) */
  batchSize?: number
  /** Timeout por batch em ms (default: 15000) */
  timeout?: number
  /** Filtrar documentos irrelevantes do resultado (default: true) */
  filterIrrelevant?: boolean
}

export interface GradeDocumentsResult {
  /** Documentos com grading aplicado */
  documents: GradedDocument[]
  /** Documentos filtrados (apenas relevant e partially_relevant) */
  relevantDocuments: GradedDocument[]
  /** Estatísticas do grading */
  stats: {
    total: number
    relevant: number
    partiallyRelevant: number
    irrelevant: number
    failed: number
  }
}

const DEFAULT_OPTIONS: Required<GradeDocumentsOptions> = {
  model: "gpt-5-mini",
  batchSize: 5,
  timeout: 15000,
  filterIrrelevant: true
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Avalia relevância de documentos em relação ao perfil do cliente
 *
 * @param documents - Documentos a avaliar (resultado do RRF fusion)
 * @param clientInfo - Dados do cliente para comparação
 * @param options - Configurações de grading
 * @returns Documentos com grading e estatísticas
 */
export async function gradeDocuments(
  documents: FusedDocument[],
  clientInfo: ClientInfoForQueries,
  options: GradeDocumentsOptions = {}
): Promise<GradeDocumentsResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (documents.length === 0) {
    console.log("[gradeDocuments] Nenhum documento para avaliar")
    return {
      documents: [],
      relevantDocuments: [],
      stats: {
        total: 0,
        relevant: 0,
        partiallyRelevant: 0,
        irrelevant: 0,
        failed: 0
      }
    }
  }

  console.log(
    `[gradeDocuments] Avaliando ${documents.length} documentos em batches de ${opts.batchSize}`
  )

  // Dividir em batches
  const batches = chunkArray(documents, opts.batchSize)
  const allGradedDocs: GradedDocument[] = []

  // Processar cada batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    console.log(
      `[gradeDocuments] Processando batch ${i + 1}/${batches.length} (${batch.length} docs)`
    )

    try {
      const gradedBatch = await gradeBatch(batch, clientInfo, opts)
      allGradedDocs.push(...gradedBatch)
    } catch (error) {
      console.error(`[gradeDocuments] Erro no batch ${i + 1}:`, error)
      // Fallback: marcar todos como partially_relevant
      const fallbackDocs = batch.map(doc => ({
        ...doc,
        gradeResult: createFallbackGrade(doc.id),
        isRelevant: true // Manter no resultado por segurança
      }))
      allGradedDocs.push(...fallbackDocs)
    }
  }

  // Calcular estatísticas
  const stats = calculateStats(allGradedDocs)

  // Filtrar irrelevantes se solicitado
  const relevantDocuments = opts.filterIrrelevant
    ? allGradedDocs.filter(doc => doc.gradeResult?.score !== "irrelevant")
    : allGradedDocs

  console.log(
    `[gradeDocuments] Resultado: ${stats.relevant} relevantes, ${stats.partiallyRelevant} parciais, ${stats.irrelevant} irrelevantes`
  )

  return {
    documents: allGradedDocs,
    relevantDocuments,
    stats
  }
}

// =============================================================================
// Batch Processing
// =============================================================================

/**
 * Processa um batch de documentos
 */
async function gradeBatch(
  documents: FusedDocument[],
  clientInfo: ClientInfoForQueries,
  options: Required<GradeDocumentsOptions>
): Promise<GradedDocument[]> {
  // Configurar LLM
  const isGpt5Model = options.model.startsWith("gpt-5")

  const llm = new ChatOpenAI({
    modelName: options.model,
    timeout: options.timeout,
    maxRetries: 2,
    tags: ["grade-documents", "health-plan-v2", "rag"],
    // GPT-5 usa reasoning_effort (Chat Completions API)
    // GPT-4 usa temperature
    ...(isGpt5Model
      ? {
          modelKwargs: {
            reasoning_effort: "low"
          }
        }
      : {
          temperature: GRADING_TEMPERATURE
        })
  })

  // Preparar prompt
  const clientInfoText = formatClientInfoForPrompt(clientInfo)
  const documentsText = formatDocumentsForBatchPrompt(documents)

  const prompt = GRADE_DOCUMENTS_BATCH_PROMPT.replace(
    "{clientInfo}",
    clientInfoText
  ).replace("{documents}", documentsText)

  // Chamar LLM
  const response = await llm.invoke(prompt)
  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content)

  // Extrair e validar JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn("[gradeBatch] Não foi possível extrair JSON da resposta")
    return documents.map(doc => ({
      ...doc,
      gradeResult: createFallbackGrade(doc.id),
      isRelevant: true
    }))
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    const validated = GradingResponseSchema.parse(parsed)

    // Mapear resultados para documentos
    return documents.map(doc => {
      const gradeResult = validated.results.find(r => r.documentId === doc.id)

      if (gradeResult) {
        return {
          ...doc,
          gradeResult,
          isRelevant: gradeResult.score !== "irrelevant"
        }
      }

      // Documento não encontrado na resposta - usar fallback
      return {
        ...doc,
        gradeResult: createFallbackGrade(doc.id),
        isRelevant: true
      }
    })
  } catch (error) {
    console.error("[gradeBatch] Erro ao parsear resposta:", error)
    return documents.map(doc => ({
      ...doc,
      gradeResult: createFallbackGrade(doc.id),
      isRelevant: true
    }))
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Divide array em chunks de tamanho fixo
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Cria um GradeResult de fallback quando LLM falha
 */
function createFallbackGrade(documentId: string): GradeResult {
  return {
    documentId,
    score: "partially_relevant" as GradeScore,
    reason:
      "Avaliação automática não disponível - documento mantido por precaução",
    confidence: 0.5
  }
}

/**
 * Calcula estatísticas do grading
 */
function calculateStats(
  documents: GradedDocument[]
): GradeDocumentsResult["stats"] {
  let relevant = 0
  let partiallyRelevant = 0
  let irrelevant = 0
  let failed = 0

  for (const doc of documents) {
    const score = doc.gradeResult?.score

    switch (score) {
      case "relevant":
        relevant++
        break
      case "partially_relevant":
        partiallyRelevant++
        break
      case "irrelevant":
        irrelevant++
        break
      default:
        failed++
    }
  }

  return {
    total: documents.length,
    relevant,
    partiallyRelevant,
    irrelevant,
    failed
  }
}

/**
 * Versão simplificada que retorna apenas documentos relevantes
 */
export async function filterRelevantDocuments(
  documents: FusedDocument[],
  clientInfo: ClientInfoForQueries,
  model: string = "gpt-5-mini"
): Promise<FusedDocument[]> {
  const result = await gradeDocuments(documents, clientInfo, {
    model,
    filterIrrelevant: true
  })

  // Retornar como FusedDocument (sem campos de grading)
  return result.relevantDocuments.map(doc => ({
    id: doc.id,
    content: doc.content,
    score: doc.score,
    metadata: doc.metadata,
    rrfScore: (doc as FusedDocument).rrfScore || 0,
    appearances: (doc as FusedDocument).appearances || 1,
    queryMatches: (doc as FusedDocument).queryMatches || []
  }))
}

/**
 * Conta documentos por score
 */
export function countByScore(
  documents: GradedDocument[]
): Record<GradeScore, number> {
  const counts: Record<GradeScore, number> = {
    relevant: 0,
    partially_relevant: 0,
    irrelevant: 0
  }

  for (const doc of documents) {
    const score = doc.gradeResult?.score
    if (score && score in counts) {
      counts[score]++
    }
  }

  return counts
}
