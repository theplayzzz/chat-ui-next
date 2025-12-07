/**
 * Grade Documents - Avaliador de Relevância com Contexto Enriquecido
 *
 * Avalia a relevância de chunks recuperados usando:
 * - Nome e descrição da coleção
 * - Nome e descrição do arquivo
 * - Conteúdo do chunk
 * - Perfil do cliente
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

import { ChatOpenAI } from "@langchain/openai"

import type { EnrichedChunk, ClientInfo } from "./retrieve-simple"
import {
  type GradeResult,
  type GradeScore,
  GradingResponseSchema
} from "../../schemas/rag-schemas"

// =============================================================================
// Types
// =============================================================================

export interface GradeDocumentsOptions {
  /** Modelo LLM a usar (default: gpt-4o-mini) */
  model?: string
  /** Tamanho do batch para processamento (default: 5) */
  batchSize?: number
  /** Timeout por batch em ms (default: 15000) */
  timeout?: number
  /** Filtrar documentos irrelevantes do resultado (default: true) */
  filterIrrelevant?: boolean
}

export interface GradedChunk extends EnrichedChunk {
  /** Resultado do grading */
  gradeResult: GradeResult
  /** Flag se é relevante */
  isRelevant: boolean
}

export interface GradeDocumentsResult {
  /** Todos os chunks com grading aplicado */
  allChunks: GradedChunk[]
  /** Chunks filtrados (apenas relevant e partially_relevant) */
  relevantChunks: GradedChunk[]
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
  model: "gpt-4o-mini",
  batchSize: 5,
  timeout: 15000,
  filterIrrelevant: true
}

// =============================================================================
// Constants
// =============================================================================

const GRADING_TEMPERATURE = 0.1

/**
 * Prompt para grading com contexto enriquecido
 */
const GRADE_ENRICHED_BATCH_PROMPT = `Você é um avaliador especializado em planos de saúde no Brasil.

Avalie CADA documento listado abaixo quanto à relevância para o perfil do cliente.
Use o CONTEXTO (nome/descrição da coleção e arquivo) para entender melhor o conteúdo.

## Critérios de Avaliação

- **relevant**: Documento aborda diretamente o que o cliente precisa
  - Compatível com idade, localização, orçamento do cliente
  - Cobre dependentes e condições pré-existentes mencionadas

- **partially_relevant**: Documento tem alguma relação mas não é ideal
  - Operadora diferente da preferida
  - Faixa de preço próxima mas não exata
  - Cobertura parcial das necessidades

- **irrelevant**: Documento não serve para este cliente
  - Região de cobertura diferente
  - Fora do orçamento declarado
  - Não atende necessidades específicas

## Perfil do Cliente
{clientInfo}

## Documentos a Avaliar
{documents}

## Formato de Resposta (JSON)
{
  "results": [
    {
      "documentId": "id do documento",
      "score": "relevant" | "partially_relevant" | "irrelevant",
      "reason": "Explicação breve (1-2 frases)"
    }
  ]
}

IMPORTANTE: Avalie TODOS os documentos. Use o contexto de coleção/arquivo para inferir relevância.

Avalie agora:`

// =============================================================================
// Main Function
// =============================================================================

/**
 * Avalia relevância de chunks enriquecidos em relação ao perfil do cliente
 *
 * @param chunks - Chunks enriquecidos a avaliar
 * @param clientInfo - Dados do cliente para comparação
 * @param options - Configurações de grading
 * @returns Chunks com grading e estatísticas
 */
export async function gradeDocuments(
  chunks: EnrichedChunk[],
  clientInfo: ClientInfo,
  options: GradeDocumentsOptions = {}
): Promise<GradeDocumentsResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (chunks.length === 0) {
    console.log("[gradeDocuments] Nenhum chunk para avaliar")
    return {
      allChunks: [],
      relevantChunks: [],
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
    `[gradeDocuments] Avaliando ${chunks.length} chunks em batches de ${opts.batchSize}`
  )

  // Dividir em batches
  const batches = chunkArray(chunks, opts.batchSize)
  const allGradedChunks: GradedChunk[] = []

  // Processar cada batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    console.log(
      `[gradeDocuments] Processando batch ${i + 1}/${batches.length} (${batch.length} chunks)`
    )

    try {
      const gradedBatch = await gradeBatch(batch, clientInfo, opts)
      allGradedChunks.push(...gradedBatch)
    } catch (error) {
      console.error(`[gradeDocuments] Erro no batch ${i + 1}:`, error)
      // Fallback: marcar todos como partially_relevant
      const fallbackChunks = batch.map(chunk => ({
        ...chunk,
        gradeResult: createFallbackGrade(chunk.id),
        isRelevant: true
      }))
      allGradedChunks.push(...fallbackChunks)
    }
  }

  // Calcular estatísticas
  const stats = calculateStats(allGradedChunks)

  // Filtrar irrelevantes se solicitado
  const relevantChunks = opts.filterIrrelevant
    ? allGradedChunks.filter(chunk => chunk.gradeResult.score !== "irrelevant")
    : allGradedChunks

  console.log(
    `[gradeDocuments] Resultado: ${stats.relevant} relevantes, ${stats.partiallyRelevant} parciais, ${stats.irrelevant} irrelevantes`
  )

  return {
    allChunks: allGradedChunks,
    relevantChunks,
    stats
  }
}

// =============================================================================
// Batch Processing
// =============================================================================

/**
 * Processa um batch de chunks
 */
async function gradeBatch(
  chunks: EnrichedChunk[],
  clientInfo: ClientInfo,
  options: Required<GradeDocumentsOptions>
): Promise<GradedChunk[]> {
  const llm = new ChatOpenAI({
    modelName: options.model,
    temperature: GRADING_TEMPERATURE,
    timeout: options.timeout,
    maxRetries: 2,
    tags: ["grade-documents", "health-plan-v2", "rag-simple"]
  })

  // Preparar prompt
  const clientInfoText = formatClientInfo(clientInfo)
  const documentsText = formatEnrichedChunksForPrompt(chunks)

  const prompt = GRADE_ENRICHED_BATCH_PROMPT.replace(
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
    return chunks.map(chunk => ({
      ...chunk,
      gradeResult: createFallbackGrade(chunk.id),
      isRelevant: true
    }))
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    const validated = GradingResponseSchema.parse(parsed)

    // Mapear resultados para chunks
    return chunks.map(chunk => {
      const gradeResult = validated.results.find(r => r.documentId === chunk.id)

      if (gradeResult) {
        return {
          ...chunk,
          gradeResult,
          isRelevant: gradeResult.score !== "irrelevant"
        }
      }

      // Chunk não encontrado na resposta - usar fallback
      return {
        ...chunk,
        gradeResult: createFallbackGrade(chunk.id),
        isRelevant: true
      }
    })
  } catch (error) {
    console.error("[gradeBatch] Erro ao parsear resposta:", error)
    return chunks.map(chunk => ({
      ...chunk,
      gradeResult: createFallbackGrade(chunk.id),
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
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
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
function calculateStats(chunks: GradedChunk[]): GradeDocumentsResult["stats"] {
  let relevant = 0
  let partiallyRelevant = 0
  let irrelevant = 0
  let failed = 0

  for (const chunk of chunks) {
    const score = chunk.gradeResult?.score

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
    total: chunks.length,
    relevant,
    partiallyRelevant,
    irrelevant,
    failed
  }
}

/**
 * Formata informações do cliente para o prompt
 */
function formatClientInfo(clientInfo: ClientInfo): string {
  const parts: string[] = []

  if (clientInfo.age !== undefined) {
    parts.push(`- **Idade:** ${clientInfo.age} anos`)
  }

  if (clientInfo.city || clientInfo.state) {
    const location = [clientInfo.city, clientInfo.state]
      .filter(Boolean)
      .join(", ")
    parts.push(`- **Localização:** ${location}`)
  }

  if (clientInfo.budget !== undefined) {
    parts.push(
      `- **Orçamento:** até R$ ${clientInfo.budget.toLocaleString("pt-BR")}/mês`
    )
  }

  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const depsDescriptions = clientInfo.dependents.map(dep => {
      const depParts = []
      if (dep.relationship) depParts.push(dep.relationship)
      if (dep.age !== undefined) depParts.push(`${dep.age} anos`)
      return depParts.join(" de ") || "dependente"
    })
    parts.push(`- **Dependentes:** ${depsDescriptions.join(", ")}`)
  }

  if (
    clientInfo.preExistingConditions &&
    clientInfo.preExistingConditions.length > 0
  ) {
    parts.push(
      `- **Condições pré-existentes:** ${clientInfo.preExistingConditions.join(", ")}`
    )
  }

  if (clientInfo.preferences && clientInfo.preferences.length > 0) {
    parts.push(`- **Preferências:** ${clientInfo.preferences.join(", ")}`)
  }

  if (parts.length === 0) {
    return "Nenhuma informação específica do cliente disponível"
  }

  return parts.join("\n")
}

/**
 * Formata chunks enriquecidos para o prompt de grading
 */
function formatEnrichedChunksForPrompt(chunks: EnrichedChunk[]): string {
  return chunks
    .map((chunk, index) => {
      const lines: string[] = []

      lines.push(`### Documento ${index + 1} (ID: ${chunk.id})`)

      // Contexto da coleção
      if (chunk.collection) {
        lines.push(`**Coleção:** ${chunk.collection.name}`)
        lines.push(`**Descrição da Coleção:** ${chunk.collection.description}`)
      }

      // Contexto do arquivo
      lines.push(`**Arquivo:** ${chunk.file.name}`)
      lines.push(`**Descrição do Arquivo:** ${chunk.file.description}`)

      // Similaridade
      lines.push(`**Similaridade:** ${(chunk.similarity * 100).toFixed(1)}%`)

      // Conteúdo (truncado se muito longo)
      const content =
        chunk.content.length > 600
          ? chunk.content.substring(0, 600) + "..."
          : chunk.content
      lines.push(`**Conteúdo:**\n${content}`)

      return lines.join("\n")
    })
    .join("\n\n---\n\n")
}

// =============================================================================
// Legacy Compatibility (para transição gradual)
// =============================================================================

/**
 * Tipo legado para compatibilidade
 * @deprecated Use EnrichedChunk em vez disso
 */
export interface FusedDocument {
  id: string
  content: string
  score?: number
  metadata?: {
    documentType?: string
    operator?: string
    planCode?: string
    tags?: string[]
    fileId?: string
    fileName?: string
    fileDescription?: string
    collectionId?: string
    collectionName?: string
    collectionDescription?: string
  }
  rrfScore?: number
  appearances?: number
  queryMatches?: string[]
}

/**
 * Tipo legado para compatibilidade
 * @deprecated Use ClientInfo em vez disso
 */
export interface ClientInfoForQueries {
  age?: number
  city?: string
  state?: string
  budget?: number
  dependents?: Array<{
    age?: number
    relationship?: string
  }>
  preExistingConditions?: string[]
  preferences?: string[]
}

/**
 * Converte FusedDocument[] para EnrichedChunk[] para compatibilidade
 * @deprecated Use retrieve-simple diretamente
 */
export function convertFusedToEnriched(docs: FusedDocument[]): EnrichedChunk[] {
  return docs.map(doc => ({
    id: doc.id,
    content: doc.content,
    tokens: 0,
    similarity: doc.score || doc.rrfScore || 0,
    file: {
      id: doc.metadata?.fileId || "",
      name: doc.metadata?.fileName || "Arquivo sem nome",
      description: doc.metadata?.fileDescription || ""
    },
    collection: doc.metadata?.collectionId
      ? {
          id: doc.metadata.collectionId,
          name: doc.metadata.collectionName || "Coleção sem nome",
          description: doc.metadata.collectionDescription || ""
        }
      : null
  }))
}
