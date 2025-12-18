/**
 * Grade By Collection - Análise de Planos REAIS por Collection
 *
 * Fase 6E: Analisa collections como unidade para identificar PLANOS REAIS
 * (não arquivos individuais).
 *
 * Usa GPT-5-mini com grande context window para:
 * - Agregar todos os chunks de uma collection
 * - Incluir análises anteriores do gradeByFile
 * - Identificar quantos planos REAIS existem
 * - Extrair REGRAS e CARACTERÍSTICAS reais (não inventar)
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 */

import { ChatOpenAI } from "@langchain/openai"

import type { RetrieveByFileResult, ClientInfo } from "./retrieve-simple"
import type { FileGradingResult } from "./grade-documents"
import type {
  IdentifiedPlan,
  CollectionAnalysisResult,
  CollectionSummary,
  GradeByCollectionResult,
  GradeByCollectionStats,
  CollectionAggregatedData,
  AggregatedFile,
  LLMCollectionAnalysisResponse
} from "./types"

import { isGPT5Model } from "@/lib/tools/health-plan/prompts/extraction-prompts"

// =============================================================================
// Types
// =============================================================================

/**
 * Opções para grading por collection
 */
export interface GradeByCollectionOptions {
  /** Modelo LLM (default: gpt-5-mini) */
  model?: string
  /** Timeout por collection em ms (default: 60000) */
  timeout?: number
  /** Collections a processar em paralelo (default: 2) */
  parallelBatchSize?: number
}

const DEFAULT_OPTIONS: Required<GradeByCollectionOptions> = {
  model: "gpt-5-mini",
  timeout: 60000,
  parallelBatchSize: 2
}

// =============================================================================
// Prompts
// =============================================================================

/**
 * Prompt para análise de collection com GPT-5-mini
 */
const COLLECTION_ANALYSIS_PROMPT = `Você é um especialista em planos de saúde no Brasil.

## TAREFA
Analise esta COLLECTION e identifique os PLANOS DE SAÚDE REAIS baseando-se nas análises anteriores.

REGRAS CRÍTICAS:
- Use EXCLUSIVAMENTE as análises anteriores como fonte de informação
- NÃO INVENTE dados que não estão nas análises
- Se uma informação não existe nas análises, OMITA o campo
- Baseie TODA análise em FATOS encontrados nas análises anteriores
- Extraia REGRAS e CARACTERÍSTICAS que impactam o cliente
- Campos obrigatórios: planName, sourceFileNames, clientRelevance, relevanceJustification
- Campos opcionais: OMITA se não houver dados reais nas análises

## COLLECTION
Nome: {collectionName}
Descrição: {collectionDescription}
Tipo: {collectionType}

## ANÁLISES ANTERIORES (feitas por gradeByFile usando GPT-5-mini)

As análises abaixo foram geradas por outro LLM especializado que examinou cada arquivo individualmente.
Cada análise já avaliou relevância, compatibilidade e extraiu informações importantes dos documentos.

Use SOMENTE estas análises para identificar planos reais. NÃO invente informações adicionais.

{previousAnalyses}

## PERFIL DO CLIENTE
{clientInfo}

## CONTEXTO DA CONVERSA
{conversationContext}

---

## INSTRUÇÕES

Identifique quantos PLANOS REAIS existem nesta collection:
- Arquivos diferentes podem descrever o MESMO plano (ex: "Precos.pdf" + "Regras.pdf")
- Operadoras diferentes = planos diferentes
- Se um arquivo menciona múltiplos planos (ex: Silver, Gold, Platinum) = múltiplos planos
- Use o NOME REAL do plano encontrado nas análises

Extraia REGRAS e CARACTERÍSTICAS que impactam o perfil do cliente:
- Priorize carências, coparticipação, cobertura geográfica
- Indique explicitamente informações FALTANTES nas análises
- NUNCA invente preços ou regras não mencionadas

## OUTPUT ESPERADO (JSON)

IMPORTANTE: Só preencha campos se a informação existe nos documentos.
Campos opcionais devem ser OMITIDOS se não houver dados reais.

{
  "identifiedPlans": [
    {
      "planName": "Nome do plano encontrado nos documentos (OBRIGATÓRIO)",
      "sourceFileNames": ["arquivo1.txt", "arquivo2.txt"],
      "planType": "individual|familiar|empresarial (OMITIR se não identificado)",
      "summary": "Resumo baseado APENAS nos documentos (OMITIR se não possível)",
      "importantRules": [
        "Carência de 180 dias para internação",
        "Coparticipação de 30% em consultas"
      ],
      "waitingPeriods": ["180 dias internação", "300 dias parto"],
      "coparticipation": "30% em consultas e exames (OMITIR se não mencionado)",
      "coverage": ["SP", "RJ"],
      "basePrice": {
        "value": 500,
        "currency": "BRL",
        "period": "mensal",
        "ageRange": "30-39 anos"
      },
      "network": ["Hospital X", "Clínica Y"],
      "clientRelevance": "high|medium|low|irrelevant (OBRIGATÓRIO)",
      "relevanceJustification": "Justificativa baseada em FATOS dos documentos (OBRIGATÓRIO)"
    }
  ],
  "collectionSummary": {
    "totalPlansIdentified": 2,
    "rulesAffectingClient": [
      "Carência de parto pode afetar cônjuge gestante",
      "Coparticipação aumenta custo efetivo"
    ],
    "missingInformation": [
      "Preço para faixa etária do cliente não encontrado",
      "Rede credenciada não especificada"
    ]
  },
  "overallAnalysis": "Análise geral considerando perfil do cliente e regras encontradas"
}`

// =============================================================================
// Main Function
// =============================================================================

/**
 * Analisa collections para identificar planos REAIS
 *
 * @param fileResults - Resultados da busca por arquivo
 * @param fileGradingResults - Resultados do grading por arquivo (análises anteriores)
 * @param clientInfo - Informações do cliente
 * @param conversationMessages - Contexto da conversa
 * @param options - Configurações
 * @returns Análises por collection com planos identificados
 */
export async function gradeByCollection(
  fileResults: RetrieveByFileResult[],
  fileGradingResults: FileGradingResult[],
  clientInfo: ClientInfo,
  conversationMessages: string[],
  options: GradeByCollectionOptions = {}
): Promise<GradeByCollectionResult> {
  const startTime = Date.now()
  const opts = { ...DEFAULT_OPTIONS, ...options }

  console.log("[gradeByCollection] Iniciando análise por collection...")

  // Agregar dados por collection
  const aggregatedCollections = aggregateByCollection(
    fileResults,
    fileGradingResults
  )

  if (aggregatedCollections.length === 0) {
    console.log("[gradeByCollection] Nenhuma collection para analisar")
    return createEmptyResult()
  }

  console.log(
    `[gradeByCollection] Collections: ${aggregatedCollections.length}, Batch: ${opts.parallelBatchSize}`
  )

  // Processar collections em batches
  const allResults: CollectionAnalysisResult[] = []

  for (
    let i = 0;
    i < aggregatedCollections.length;
    i += opts.parallelBatchSize
  ) {
    const batch = aggregatedCollections.slice(i, i + opts.parallelBatchSize)

    console.log(
      `[gradeByCollection] Processando batch ${Math.floor(i / opts.parallelBatchSize) + 1}/${Math.ceil(aggregatedCollections.length / opts.parallelBatchSize)}`
    )

    const batchResults = await Promise.all(
      batch.map(collection =>
        analyzeCollection(collection, clientInfo, conversationMessages, opts)
      )
    )

    allResults.push(...batchResults)
  }

  // Calcular estatísticas
  const stats = calculateStats(allResults, startTime)

  // Gerar texto consolidado
  const consolidatedAnalysisText = formatConsolidatedAnalysis(
    allResults,
    clientInfo,
    conversationMessages
  )

  console.log(
    `[gradeByCollection] Concluído: ${stats.totalPlansIdentified} planos em ${stats.totalCollections} collections (${stats.executionTimeMs}ms)`
  )

  return {
    collectionAnalyses: allResults,
    consolidatedAnalysisText,
    stats
  }
}

// =============================================================================
// Aggregation Functions
// =============================================================================

/**
 * Agrupa fileResults e fileGradingResults por collection
 */
function aggregateByCollection(
  fileResults: RetrieveByFileResult[],
  fileGradingResults: FileGradingResult[]
): CollectionAggregatedData[] {
  // Criar mapa de grading por fileId
  const gradingMap = new Map<string, FileGradingResult>()
  for (const grading of fileGradingResults) {
    gradingMap.set(grading.fileId, grading)
  }

  // Agrupar por collectionId
  const collectionMap = new Map<string, CollectionAggregatedData>()

  for (const fileResult of fileResults) {
    // Pular arquivos sem collection
    if (!fileResult.collection) {
      console.log(
        `[gradeByCollection] Arquivo órfão ignorado: ${fileResult.fileName}`
      )
      continue
    }

    const collectionId = fileResult.collection.id
    const grading = gradingMap.get(fileResult.fileId)

    // Criar ou obter collection agregada
    if (!collectionMap.has(collectionId)) {
      collectionMap.set(collectionId, {
        collectionId,
        collectionName: fileResult.collection.name,
        collectionDescription: fileResult.collection.description,
        collectionType: "health_plan", // Default, pode ser enriquecido depois
        files: [],
        totalTokens: 0
      })
    }

    const collection = collectionMap.get(collectionId)!

    // Calcular tokens baseado no texto da análise (conteúdo REAL do prompt)
    const analysisText = grading?.analysisText || ""
    const analysisTokens = Math.ceil(analysisText.length / 4)

    // Adicionar arquivo agregado
    const aggregatedFile: AggregatedFile = {
      fileId: fileResult.fileId,
      fileName: fileResult.fileName,
      fileDescription: fileResult.fileDescription,
      relevance: grading?.relevance || "medium",
      previousAnalysisText: analysisText
    }

    collection.files.push(aggregatedFile)
    collection.totalTokens += analysisTokens
  }

  return Array.from(collectionMap.values())
}

// =============================================================================
// Collection Analysis
// =============================================================================

/**
 * Analisa uma collection individual usando LangChain ChatOpenAI
 */
async function analyzeCollection(
  collection: CollectionAggregatedData,
  clientInfo: ClientInfo,
  conversationMessages: string[],
  options: Required<GradeByCollectionOptions>
): Promise<CollectionAnalysisResult> {
  console.log(
    `[gradeByCollection] Analisando: ${collection.collectionName} (${collection.files.length} arquivos, ~${collection.totalTokens} tokens de análises)`
  )

  // Log detalhado de tokens por arquivo
  console.log(
    `[gradeByCollection] Detalhes: ${collection.files
      .map(
        f => `${f.fileName}=${Math.ceil(f.previousAnalysisText.length / 4)}t`
      )
      .join(", ")}`
  )

  try {
    // Preparar conteúdos (SOMENTE análises anteriores)
    const previousAnalyses = formatPreviousAnalyses(collection.files)
    const clientInfoText = formatClientInfo(clientInfo)
    const conversationContext = formatConversationContext(conversationMessages)

    // Construir prompt
    const prompt = COLLECTION_ANALYSIS_PROMPT.replace(
      "{collectionName}",
      collection.collectionName
    )
      .replace(
        "{collectionDescription}",
        collection.collectionDescription || "Não especificada"
      )
      .replace("{collectionType}", collection.collectionType)
      .replace("{previousAnalyses}", previousAnalyses)
      .replace("{clientInfo}", clientInfoText)
      .replace("{conversationContext}", conversationContext)

    // Configurar parâmetros do modelo baseado no tipo (GPT-5 vs outros)
    const isGPT5 = isGPT5Model(options.model)

    // Criar LLM com LangChain (aparece no LangSmith)
    const llm = new ChatOpenAI({
      modelName: options.model,
      // GPT-5 não suporta temperature customizada, usa apenas temperature=1
      temperature: isGPT5 ? 1 : 0.3,
      timeout: options.timeout,
      maxRetries: 2,
      tags: ["grade-by-collection", "health-plan-v2", "fase-6e"],
      // Configurações adicionais via modelKwargs (Chat Completions API)
      modelKwargs: {
        response_format: { type: "json_object" },
        // GPT-5 usa max_completion_tokens e reasoning_effort
        ...(isGPT5
          ? {
              max_completion_tokens: 4096,
              reasoning_effort: "low"
            }
          : {})
      },
      // maxTokens para modelos não-GPT-5
      ...(isGPT5 ? {} : { maxTokens: 4096 })
    })

    // Preparar mensagens
    const systemMessage =
      "Você é um especialista em planos de saúde. Responda SEMPRE em JSON válido seguindo o schema especificado."

    // Chamar LLM via LangChain (traceado pelo LangSmith)
    const response = await llm.invoke([
      { role: "system", content: systemMessage },
      { role: "user", content: prompt }
    ])

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content)

    if (!content) {
      throw new Error("Resposta vazia do LLM")
    }

    // Parse JSON
    const parsed = JSON.parse(content) as LLMCollectionAnalysisResponse

    // Converter para CollectionAnalysisResult
    return createCollectionResult(collection, parsed, options.model)
  } catch (error) {
    console.error(
      `[gradeByCollection] Erro ao analisar ${collection.collectionName}:`,
      error
    )
    return createFallbackResult(collection, options.model)
  }
}

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Formata análises anteriores do gradeByFile
 */
function formatPreviousAnalyses(files: AggregatedFile[]): string {
  const analyses = files
    .filter(f => f.previousAnalysisText)
    .map(f => {
      return `### ${f.fileName}\n${f.previousAnalysisText}`
    })

  if (analyses.length === 0) {
    return "Nenhuma análise anterior disponível."
  }

  return analyses.join("\n\n---\n\n")
}

/**
 * Formata informações do cliente
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
    const deps = clientInfo.dependents
      .map(d => {
        const parts = []
        if (d.relationship) parts.push(d.relationship)
        if (d.age !== undefined) parts.push(`${d.age} anos`)
        return parts.join(" de ") || "dependente"
      })
      .join(", ")
    parts.push(`- Dependentes: ${deps}`)
  }
  if (clientInfo.preExistingConditions?.length) {
    parts.push(
      `- Condições pré-existentes: ${clientInfo.preExistingConditions.join(", ")}`
    )
  }
  if (clientInfo.preferences?.length) {
    parts.push(`- Preferências: ${clientInfo.preferences.join(", ")}`)
  }

  return parts.length > 0 ? parts.join("\n") : "Perfil não especificado"
}

/**
 * Formata contexto da conversa
 */
function formatConversationContext(messages: string[]): string {
  if (!messages || messages.length === 0) {
    return "Nenhum contexto adicional."
  }

  return messages
    .slice(-5)
    .map((msg, i) => `[${i + 1}] ${msg}`)
    .join("\n")
}

// =============================================================================
// Result Creation
// =============================================================================

/**
 * Cria CollectionAnalysisResult a partir da resposta do LLM
 */
function createCollectionResult(
  collection: CollectionAggregatedData,
  llmResponse: LLMCollectionAnalysisResponse,
  model: string
): CollectionAnalysisResult {
  // Mapear planos identificados
  const identifiedPlans: IdentifiedPlan[] = (
    llmResponse.identifiedPlans || []
  ).map(plan => ({
    planName: plan.planName,
    sourceFileNames: plan.sourceFileNames || [],
    planType: plan.planType,
    summary: plan.summary,
    basePrice: plan.basePrice,
    coverage: plan.coverage,
    importantRules: plan.importantRules,
    waitingPeriods: plan.waitingPeriods,
    coparticipation: plan.coparticipation,
    network: plan.network,
    clientRelevance: plan.clientRelevance || "medium",
    relevanceJustification: plan.relevanceJustification || "Sem justificativa"
  }))

  // Mapear arquivos analisados
  const analyzedFiles = collection.files.map(f => ({
    fileId: f.fileId,
    fileName: f.fileName,
    fileDescription: f.fileDescription,
    relevance: f.relevance
  }))

  // Resumo da collection
  const collectionSummary: CollectionSummary = {
    rulesAffectingClient:
      llmResponse.collectionSummary?.rulesAffectingClient || [],
    missingInformation: llmResponse.collectionSummary?.missingInformation || []
  }

  return {
    collectionId: collection.collectionId,
    collectionName: collection.collectionName,
    collectionDescription: collection.collectionDescription,
    identifiedPlans,
    totalPlans: identifiedPlans.length,
    analyzedFiles,
    collectionSummary,
    overallAnalysis: llmResponse.overallAnalysis || "",
    modelUsed: model,
    timestamp: new Date().toISOString()
  }
}

/**
 * Cria resultado de fallback em caso de erro
 */
function createFallbackResult(
  collection: CollectionAggregatedData,
  model: string
): CollectionAnalysisResult {
  return {
    collectionId: collection.collectionId,
    collectionName: collection.collectionName,
    collectionDescription: collection.collectionDescription,
    identifiedPlans: [],
    totalPlans: 0,
    analyzedFiles: collection.files.map(f => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileDescription: f.fileDescription,
      relevance: f.relevance
    })),
    collectionSummary: {
      rulesAffectingClient: [],
      missingInformation: [
        "Análise automática falhou - revisão manual necessária"
      ]
    },
    overallAnalysis:
      "Análise automática não disponível. Os documentos estão disponíveis para revisão manual.",
    modelUsed: model,
    timestamp: new Date().toISOString()
  }
}

/**
 * Cria resultado vazio
 */
function createEmptyResult(): GradeByCollectionResult {
  return {
    collectionAnalyses: [],
    consolidatedAnalysisText: "Nenhuma collection para analisar.",
    stats: {
      totalCollections: 0,
      totalPlansIdentified: 0,
      highRelevancePlans: 0,
      mediumRelevancePlans: 0,
      lowRelevancePlans: 0,
      irrelevantPlans: 0,
      executionTimeMs: 0
    }
  }
}

// =============================================================================
// Statistics & Formatting
// =============================================================================

/**
 * Calcula estatísticas do grading
 */
function calculateStats(
  results: CollectionAnalysisResult[],
  startTime: number
): GradeByCollectionStats {
  let totalPlansIdentified = 0
  let highRelevancePlans = 0
  let mediumRelevancePlans = 0
  let lowRelevancePlans = 0
  let irrelevantPlans = 0

  for (const result of results) {
    for (const plan of result.identifiedPlans) {
      totalPlansIdentified++
      switch (plan.clientRelevance) {
        case "high":
          highRelevancePlans++
          break
        case "medium":
          mediumRelevancePlans++
          break
        case "low":
          lowRelevancePlans++
          break
        case "irrelevant":
          irrelevantPlans++
          break
      }
    }
  }

  return {
    totalCollections: results.length,
    totalPlansIdentified,
    highRelevancePlans,
    mediumRelevancePlans,
    lowRelevancePlans,
    irrelevantPlans,
    executionTimeMs: Date.now() - startTime
  }
}

/**
 * Formata análise consolidada para output final
 */
function formatConsolidatedAnalysis(
  results: CollectionAnalysisResult[],
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
  if (clientInfo.dependents?.length) {
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

  // Para cada collection
  for (const collection of results) {
    lines.push(`=== OPERADORA: ${collection.collectionName} ===`)
    if (collection.collectionDescription) {
      lines.push(`Descrição: ${collection.collectionDescription}`)
    }
    lines.push("")

    // Planos identificados
    if (collection.identifiedPlans.length === 0) {
      lines.push("Nenhum plano identificado nesta operadora.")
      lines.push("")
    } else {
      for (let i = 0; i < collection.identifiedPlans.length; i++) {
        const plan = collection.identifiedPlans[i]
        const relevanceLabel = {
          high: "ALTA",
          medium: "MÉDIA",
          low: "BAIXA",
          irrelevant: "INADEQUADO"
        }[plan.clientRelevance]

        lines.push(
          `--- PLANO ${i + 1}: ${plan.planName} (Relevância: ${relevanceLabel}) ---`
        )
        lines.push(`Arquivos fonte: ${plan.sourceFileNames.join(", ")}`)
        lines.push("")

        // Resumo
        if (plan.summary) {
          lines.push(`Resumo: ${plan.summary}`)
          lines.push("")
        }

        // Tipo do plano
        if (plan.planType) {
          lines.push(`Tipo: ${plan.planType}`)
        }

        // Regras importantes
        if (plan.importantRules?.length) {
          lines.push("REGRAS IMPORTANTES:")
          for (const rule of plan.importantRules) {
            lines.push(`- ${rule}`)
          }
          lines.push("")
        }

        // Carências
        if (plan.waitingPeriods?.length) {
          lines.push("CARÊNCIAS:")
          for (const period of plan.waitingPeriods) {
            lines.push(`- ${period}`)
          }
          lines.push("")
        }

        // Coparticipação
        if (plan.coparticipation) {
          lines.push(`COPARTICIPAÇÃO: ${plan.coparticipation}`)
          lines.push("")
        }

        // Cobertura
        if (plan.coverage?.length) {
          lines.push(`COBERTURA: ${plan.coverage.join(", ")}`)
          lines.push("")
        }

        // Rede credenciada
        if (plan.network?.length) {
          lines.push(`REDE CREDENCIADA: ${plan.network.join(", ")}`)
          lines.push("")
        }

        // Preço
        if (plan.basePrice) {
          const priceStr = `R$${plan.basePrice.value}/${plan.basePrice.period}`
          const ageStr = plan.basePrice.ageRange
            ? ` (faixa ${plan.basePrice.ageRange})`
            : ""
          lines.push(`PREÇO: ${priceStr}${ageStr}`)
          lines.push("")
        }

        // Justificativa
        lines.push(`Justificativa: ${plan.relevanceJustification}`)
        lines.push("")
      }
    }

    // Resumo da collection
    lines.push("=== RESUMO DA OPERADORA ===")
    lines.push(`Planos identificados: ${collection.totalPlans}`)

    if (collection.collectionSummary.rulesAffectingClient.length > 0) {
      lines.push("")
      lines.push("REGRAS QUE AFETAM O CLIENTE:")
      for (const rule of collection.collectionSummary.rulesAffectingClient) {
        lines.push(`- ${rule}`)
      }
    }

    if (collection.collectionSummary.missingInformation.length > 0) {
      lines.push("")
      lines.push("INFORMAÇÕES NÃO ENCONTRADAS:")
      for (const info of collection.collectionSummary.missingInformation) {
        lines.push(`- ${info}`)
      }
    }

    if (collection.overallAnalysis) {
      lines.push("")
      lines.push("ANÁLISE GERAL:")
      lines.push(collection.overallAnalysis)
    }

    lines.push("")
    lines.push("")
  }

  // Estatísticas finais
  const totalPlans = results.reduce((sum, r) => sum + r.totalPlans, 0)
  const highCount = results.reduce(
    (sum, r) =>
      sum + r.identifiedPlans.filter(p => p.clientRelevance === "high").length,
    0
  )
  const mediumCount = results.reduce(
    (sum, r) =>
      sum +
      r.identifiedPlans.filter(p => p.clientRelevance === "medium").length,
    0
  )

  lines.push("=== ESTATÍSTICAS ===")
  lines.push(`Total de operadoras analisadas: ${results.length}`)
  lines.push(`Total de planos identificados: ${totalPlans}`)
  lines.push(`Planos alta relevância: ${highCount}`)
  lines.push(`Planos média relevância: ${mediumCount}`)

  return lines.join("\n")
}

// =============================================================================
// Exports
// =============================================================================

export type {
  IdentifiedPlan,
  CollectionAnalysisResult,
  CollectionSummary,
  GradeByCollectionResult,
  GradeByCollectionStats
}
