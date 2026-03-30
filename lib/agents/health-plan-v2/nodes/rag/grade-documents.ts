/**
 * Grade Documents - Avaliação por Arquivo como Unidade
 *
 * Avalia a relevância de ARQUIVOS (não chunks individuais) usando:
 * - Todos os chunks do arquivo concatenados
 * - Nome e descrição da coleção e arquivo
 * - Perfil do cliente
 * - CONTEXTO DA CONVERSA
 *
 * Retorna análise textual formatada para cada arquivo.
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

import { ChatOpenAI } from "@langchain/openai"

import type { RetrieveByFileResult, ClientInfo } from "./retrieve-simple"
import { concatenateFileChunks } from "./retrieve-simple"

// =============================================================================
// Types
// =============================================================================

/**
 * Nível de relevância do arquivo
 */
export type FileRelevance = "high" | "medium" | "low" | "irrelevant"

/**
 * Resultado do grading de um arquivo
 */
export interface FileGradingResult {
  /** ID do arquivo */
  fileId: string
  /** Nome do arquivo */
  fileName: string
  /** Nome da coleção/operadora */
  collectionName: string
  /** Nível de relevância */
  relevance: FileRelevance
  /** Texto de análise gerado pelo LLM */
  analysisText: string
}

/**
 * Opções para grading por arquivo
 */
export interface GradeByFileOptions {
  /** Modelo LLM a usar (default: gpt-5-mini) */
  model?: string
  /** Timeout por arquivo em ms (default: 30000) */
  timeout?: number
  /** Número de arquivos a processar em paralelo (default: 3) */
  parallelBatchSize?: number
}

/**
 * Resultado completo do grading
 */
export interface GradeByFileResult {
  /** Resultados por arquivo */
  fileGradingResults: FileGradingResult[]
  /** Texto formatado com todas as análises */
  analysisText: string
  /** Estatísticas */
  stats: {
    totalFiles: number
    highRelevance: number
    mediumRelevance: number
    lowRelevance: number
    irrelevant: number
  }
}

const DEFAULT_OPTIONS: Required<GradeByFileOptions> = {
  model: "gpt-5-mini",
  timeout: 30000,
  parallelBatchSize: 3
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Verifica se o modelo é GPT-5 (requer parâmetros especiais)
 */
function isGPT5Model(model: string): boolean {
  return (
    model.startsWith("gpt-5") ||
    model.startsWith("o1") ||
    model.startsWith("o3")
  )
}

/**
 * Prompt para grading de arquivo como unidade
 */
const GRADE_FILE_PROMPT = `Você é um consultor especializado em planos de saúde no Brasil.

Analise o documento abaixo e avalie se este PLANO DE SAÚDE é adequado para o cliente.

## Perfil do Cliente
{clientInfo}

## Contexto da Conversa
{conversationContext}

## Documento do Plano
{documentContent}

---

Forneça uma análise estruturada seguindo EXATAMENTE este formato:

**COMPATIBILIDADE:** [Alta/Média/Baixa/Inadequado]

**ATENDE AO PERFIL:**
- Faixa etária: [Sim/Não/Parcial] - [explicação breve]
- Localização: [Sim/Não/Parcial] - [explicação breve]
- Orçamento: [Sim/Não/Parcial] - [explicação breve]
- Dependentes: [Sim/Não/Parcial/N/A] - [explicação breve]

**DESTAQUES DO PLANO:**
- [Liste 2-4 pontos positivos relevantes para este cliente]

**ALERTAS:**
- [Liste 1-3 pontos de atenção, carências, limitações]

**RESPOSTA À PERGUNTA DO CLIENTE:**
[Se o cliente fez alguma pergunta específica no contexto da conversa, responda aqui. Caso contrário, escreva "Nenhuma pergunta específica identificada."]

**RESUMO:**
[1-2 frases resumindo se este plano é recomendado para o cliente e por quê]

IMPORTANTE: Seja objetivo e direto. Baseie-se apenas nas informações do documento.`

// =============================================================================
// Main Function
// =============================================================================

/**
 * Avalia arquivos como unidade em relação ao perfil do cliente e contexto da conversa
 *
 * @param fileResults - Resultados da busca agrupados por arquivo
 * @param clientInfo - Dados do cliente para comparação
 * @param conversationMessages - Mensagens da conversa para contexto
 * @param options - Configurações de grading
 * @returns Análises textuais por arquivo
 */
export async function gradeByFile(
  fileResults: RetrieveByFileResult[],
  clientInfo: ClientInfo,
  conversationMessages: string[],
  options: GradeByFileOptions = {}
): Promise<GradeByFileResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Filtrar arquivos vazios
  const nonEmptyFiles = fileResults.filter(f => f.totalChunks > 0)

  if (nonEmptyFiles.length === 0) {
    console.log("[gradeByFile] Nenhum arquivo com chunks para avaliar")
    return createEmptyGradeResult()
  }

  console.log(
    `[gradeByFile] Avaliando ${nonEmptyFiles.length} arquivos (batch: ${opts.parallelBatchSize})`
  )

  // Processar arquivos em batches paralelos
  const allResults: FileGradingResult[] = []

  for (let i = 0; i < nonEmptyFiles.length; i += opts.parallelBatchSize) {
    const batch = nonEmptyFiles.slice(i, i + opts.parallelBatchSize)

    console.log(
      `[gradeByFile] Processando batch ${Math.floor(i / opts.parallelBatchSize) + 1}/${Math.ceil(nonEmptyFiles.length / opts.parallelBatchSize)}`
    )

    const batchResults = await Promise.all(
      batch.map(file => gradeFile(file, clientInfo, conversationMessages, opts))
    )

    allResults.push(...batchResults)
  }

  // Calcular estatísticas
  const stats = calculateGradeStats(allResults)

  // Gerar texto formatado final
  const analysisText = formatAllAnalyses(
    allResults,
    clientInfo,
    conversationMessages
  )

  console.log(
    `[gradeByFile] Resultado: ${stats.highRelevance} alta, ${stats.mediumRelevance} média, ${stats.lowRelevance} baixa, ${stats.irrelevant} irrelevantes`
  )

  return {
    fileGradingResults: allResults,
    analysisText,
    stats
  }
}

// =============================================================================
// File Processing
// =============================================================================

/**
 * Avalia um único arquivo
 */
async function gradeFile(
  fileResult: RetrieveByFileResult,
  clientInfo: ClientInfo,
  conversationMessages: string[],
  options: Required<GradeByFileOptions>
): Promise<FileGradingResult> {
  const isGPT5 = isGPT5Model(options.model)

  // GPT-5 usa temperature=1 e max_output_tokens via modelKwargs
  // Modelos anteriores usam temperature customizada e maxTokens
  const llm = new ChatOpenAI({
    modelName: options.model,
    temperature: isGPT5 ? 1 : 0.3,
    timeout: options.timeout,
    maxRetries: 2,
    maxCompletionTokens: isGPT5 ? 4096 : undefined,
    tags: ["grade-by-file", "health-plan-v2"],
    modelKwargs: isGPT5 ? { reasoning_effort: "low" } : {},
    // maxTokens para modelos não-GPT-5
    ...(isGPT5 ? {} : { maxTokens: 4096 })
  })

  // Concatenar chunks do arquivo
  const documentContent = concatenateFileChunks(fileResult)

  // Preparar contextos
  const clientInfoText = formatClientInfo(clientInfo)
  const conversationContext = formatConversationContext(conversationMessages)

  // Construir prompt
  const prompt = GRADE_FILE_PROMPT.replace("{clientInfo}", clientInfoText)
    .replace("{conversationContext}", conversationContext)
    .replace("{documentContent}", documentContent)

  try {
    // Chamar LLM
    const response = await llm.invoke(prompt)
    const analysisText =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content)

    // Extrair nível de relevância do texto
    const relevance = extractRelevance(analysisText)

    return {
      fileId: fileResult.fileId,
      fileName: fileResult.fileName,
      collectionName: fileResult.collection?.name || "Desconhecida",
      relevance,
      analysisText
    }
  } catch (error) {
    console.error(
      `[gradeFile] Erro ao avaliar arquivo ${fileResult.fileId}:`,
      error
    )

    return createFallbackGradeResult(fileResult)
  }
}

/**
 * Extrai nível de relevância do texto de análise
 */
function extractRelevance(analysisText: string): FileRelevance {
  const lowerText = analysisText.toLowerCase()

  // Procurar padrão "COMPATIBILIDADE: X"
  const compatMatch = lowerText.match(
    /compatibilidade[:\s]*\*?\*?\s*(alta|média|media|baixa|inadequado)/i
  )

  if (compatMatch) {
    const level = compatMatch[1].toLowerCase()
    if (level === "alta") return "high"
    if (level === "média" || level === "media") return "medium"
    if (level === "baixa") return "low"
    if (level === "inadequado") return "irrelevant"
  }

  // Fallback: tentar inferir do texto geral
  if (
    lowerText.includes("altamente recomendado") ||
    lowerText.includes("excelente opção")
  ) {
    return "high"
  }
  if (
    lowerText.includes("pode ser uma opção") ||
    lowerText.includes("parcialmente")
  ) {
    return "medium"
  }
  if (
    lowerText.includes("não recomendado") ||
    lowerText.includes("inadequado")
  ) {
    return "irrelevant"
  }

  return "medium" // Default
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Formata informações do cliente para o prompt
 */
function formatClientInfo(clientInfo: ClientInfo): string {
  const parts: string[] = []

  if (clientInfo.age !== undefined) {
    parts.push(`- Idade: ${clientInfo.age} anos`)
  }

  if (clientInfo.city || clientInfo.state) {
    const location = [clientInfo.city, clientInfo.state]
      .filter(Boolean)
      .join(", ")
    parts.push(`- Localização: ${location}`)
  }

  if (clientInfo.budget !== undefined) {
    parts.push(
      `- Orçamento: até R$ ${clientInfo.budget.toLocaleString("pt-BR")}/mês`
    )
  }

  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const depsDescriptions = clientInfo.dependents.map(dep => {
      const depParts = []
      if (dep.relationship) depParts.push(dep.relationship)
      if (dep.age !== undefined) depParts.push(`${dep.age} anos`)
      return depParts.join(" de ") || "dependente"
    })
    parts.push(`- Dependentes: ${depsDescriptions.join(", ")}`)
  }

  if (
    clientInfo.preExistingConditions &&
    clientInfo.preExistingConditions.length > 0
  ) {
    parts.push(
      `- Condições pré-existentes: ${clientInfo.preExistingConditions.join(", ")}`
    )
  }

  if (clientInfo.preferences && clientInfo.preferences.length > 0) {
    parts.push(`- Preferências: ${clientInfo.preferences.join(", ")}`)
  }

  if (parts.length === 0) {
    return "Nenhuma informação específica do cliente disponível"
  }

  return parts.join("\n")
}

/**
 * Formata contexto da conversa para o prompt
 */
function formatConversationContext(messages: string[]): string {
  if (!messages || messages.length === 0) {
    return "Nenhum contexto adicional da conversa."
  }

  // Limitar a últimas 5 mensagens relevantes
  const recentMessages = messages.slice(-5)

  const formatted = recentMessages
    .map((msg, i) => `[${i + 1}] ${msg}`)
    .join("\n")

  return `Últimas mensagens do cliente:\n${formatted}`
}

/**
 * Formata todas as análises em um texto único
 */
function formatAllAnalyses(
  results: FileGradingResult[],
  clientInfo: ClientInfo,
  conversationMessages: string[]
): string {
  const lines: string[] = []

  // Cabeçalho
  lines.push("=== ANÁLISE DE PLANOS DE SAÚDE ===")
  lines.push("")

  // Resumo do perfil
  const profileParts = []
  if (clientInfo.age) profileParts.push(`${clientInfo.age} anos`)
  if (clientInfo.city) profileParts.push(clientInfo.city)
  if (clientInfo.budget) profileParts.push(`orçamento R$${clientInfo.budget}`)
  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    profileParts.push(`${clientInfo.dependents.length} dependente(s)`)
  }

  lines.push(`Perfil: ${profileParts.join(", ") || "Não especificado"}`)

  // Contexto da conversa
  if (conversationMessages.length > 0) {
    const lastMsg = conversationMessages[conversationMessages.length - 1]
    if (lastMsg && lastMsg.length > 10) {
      const truncated =
        lastMsg.length > 100 ? lastMsg.substring(0, 100) + "..." : lastMsg
      lines.push(`Contexto: "${truncated}"`)
    }
  }

  lines.push("")

  // Ordenar por relevância
  const sortedResults = [...results].sort((a, b) => {
    const order: Record<FileRelevance, number> = {
      high: 0,
      medium: 1,
      low: 2,
      irrelevant: 3
    }
    return order[a.relevance] - order[b.relevance]
  })

  // Filtrar irrelevantes do texto final
  const relevantResults = sortedResults.filter(
    r => r.relevance !== "irrelevant"
  )

  if (relevantResults.length === 0) {
    lines.push("Nenhum plano relevante encontrado para este perfil.")
    lines.push("")
    lines.push("Sugestão: Ajuste os critérios de busca ou orçamento.")
  } else {
    // Adicionar cada análise
    relevantResults.forEach((result, index) => {
      const relevanceLabel = {
        high: "ALTA",
        medium: "MÉDIA",
        low: "BAIXA",
        irrelevant: "INADEQUADO"
      }[result.relevance]

      lines.push(
        `--- PLANO ${index + 1}: ${result.collectionName} - ${result.fileName} (Relevância: ${relevanceLabel}) ---`
      )
      lines.push("")
      lines.push(result.analysisText)
      lines.push("")
    })

    // Resumo final
    lines.push("=== RESUMO ===")

    const highCount = relevantResults.filter(r => r.relevance === "high").length
    const mediumCount = relevantResults.filter(
      r => r.relevance === "medium"
    ).length
    const lowCount = relevantResults.filter(r => r.relevance === "low").length

    lines.push(
      `- ${relevantResults.length} plano(s) analisado(s): ${highCount} alta, ${mediumCount} média, ${lowCount} baixa relevância`
    )

    if (highCount > 0) {
      const topPlan = relevantResults[0]
      lines.push(
        `- Recomendação principal: ${topPlan.collectionName} - ${topPlan.fileName}`
      )
    }
  }

  return lines.join("\n")
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Cria resultado vazio
 */
function createEmptyGradeResult(): GradeByFileResult {
  return {
    fileGradingResults: [],
    analysisText: "Nenhum arquivo para analisar.",
    stats: {
      totalFiles: 0,
      highRelevance: 0,
      mediumRelevance: 0,
      lowRelevance: 0,
      irrelevant: 0
    }
  }
}

/**
 * Cria resultado de fallback para erro
 */
function createFallbackGradeResult(
  fileResult: RetrieveByFileResult
): FileGradingResult {
  return {
    fileId: fileResult.fileId,
    fileName: fileResult.fileName,
    collectionName: fileResult.collection?.name || "Desconhecida",
    relevance: "medium",
    analysisText: `**COMPATIBILIDADE:** Média (análise automática não disponível)

**ATENDE AO PERFIL:**
- Análise detalhada não disponível

**DESTAQUES DO PLANO:**
- Documento disponível para análise manual

**ALERTAS:**
- Análise automática falhou - recomenda-se revisão manual

**RESPOSTA À PERGUNTA DO CLIENTE:**
Nenhuma pergunta específica identificada.

**RESUMO:**
Este plano foi mantido para revisão manual pois a análise automática não foi possível.`
  }
}

/**
 * Calcula estatísticas do grading
 */
function calculateGradeStats(
  results: FileGradingResult[]
): GradeByFileResult["stats"] {
  let highRelevance = 0
  let mediumRelevance = 0
  let lowRelevance = 0
  let irrelevant = 0

  for (const result of results) {
    switch (result.relevance) {
      case "high":
        highRelevance++
        break
      case "medium":
        mediumRelevance++
        break
      case "low":
        lowRelevance++
        break
      case "irrelevant":
        irrelevant++
        break
    }
  }

  return {
    totalFiles: results.length,
    highRelevance,
    mediumRelevance,
    lowRelevance,
    irrelevant
  }
}

// =============================================================================
// Legacy Exports (para compatibilidade)
// =============================================================================

// Re-exportar tipos do retrieve-simple para compatibilidade
export type { EnrichedChunk, ClientInfo } from "./retrieve-simple"

/**
 * Tipo legado para compatibilidade
 * @deprecated Use FileGradingResult em vez disso
 */
export interface GradedChunk {
  id: string
  content: string
  tokens: number
  similarity: number
  file: {
    id: string
    name: string
    description: string
  }
  collection: {
    id: string
    name: string
    description: string
  } | null
  gradeResult: {
    documentId: string
    score: "relevant" | "partially_relevant" | "irrelevant"
    reason: string
  }
  isRelevant: boolean
}
