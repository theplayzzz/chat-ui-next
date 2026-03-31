/**
 * Capacidade: searchPlans
 *
 * Busca planos de saúde via RAG por arquivo.
 * Idempotente - pode ser chamada múltiplas vezes.
 *
 * Implementa:
 * - Busca vetorial por arquivo (top 5 chunks por arquivo)
 * - Grading por arquivo como unidade
 * - Contexto de conversa para análise
 * - Retorno de análise textual formatada
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"
import {
  invokeSearchPlansGraph,
  type SearchMetadata,
  type SearchPlansGraphResult
} from "../../graphs/search-plans-graph"
import type { FileGradingResult } from "../../nodes/rag/grade-documents"
import type {
  CollectionAnalysisResult,
  IdentifiedPlan
} from "../../nodes/rag/types"
import type { HealthPlanDocument } from "../../types"
import { humanizeResponse } from "./humanize-response"

/**
 * Busca planos de saúde usando sub-grafo RAG por arquivo
 *
 * O sub-grafo executa:
 * 1. Carrega fileIds das collections
 * 2. Busca top 5 chunks de CADA arquivo
 * 3. Grading por arquivo como unidade com contexto da conversa
 * 4. Retorna análise textual formatada
 */
export async function searchPlans(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const startTime = Date.now()
  console.log("[searchPlans] Iniciando busca via sub-grafo RAG por arquivo...")

  // Verificar se há dados suficientes para busca
  const clientInfo = state.clientInfo || {}
  const hasMinimumData = Boolean(
    clientInfo.age || clientInfo.city || clientInfo.budget
  )

  if (!hasMinimumData) {
    const rawResponse =
      "Preciso de algumas informações para buscar os melhores planos para você. " +
      "Pode me dizer sua idade, cidade e orçamento aproximado?"

    console.log("[searchPlans] Dados insuficientes para busca")

    const humanized = await humanizeResponse({
      rawResponse,
      state,
      messageType: "follow_up_question"
    })

    return {
      currentResponse: humanized.response,
      messages: [new AIMessage(humanized.response)]
    }
  }

  try {
    // Construir query semântica a partir do perfil do cliente E contexto da conversa
    const messagesArray = Array.isArray(state.messages) ? state.messages : []
    const userQuery = buildSearchQuery(clientInfo, messagesArray)

    // Extrair mensagens da conversa para o grading
    const conversationMessages = extractConversationMessages(messagesArray)

    console.log(
      `[searchPlans] Query construída: "${userQuery.substring(0, 100)}..."`
    )
    console.log(
      `[searchPlans] Mensagens de contexto: ${conversationMessages.length}`
    )

    // Invocar o sub-grafo de busca
    console.log("[searchPlans] Invocando searchPlansGraph...")
    const result = await invokeSearchPlansGraph({
      assistantId: state.assistantId,
      userQuery,
      clientInfo: state.clientInfo,
      conversationMessages,
      ragModel: "gpt-5.4-mini",
      chunksPerFile: 5
    })

    const executionTimeMs = Date.now() - startTime

    // Converter planos identificados para HealthPlanDocument[]
    // FASE 6E: Usa collectionAnalyses com planos REAIS identificados
    let searchResults: HealthPlanDocument[] = result.collectionAnalyses.flatMap(
      collection =>
        collection.identifiedPlans
          .filter(plan => plan.clientRelevance !== "irrelevant")
          .map(plan => convertPlanToDocument(plan, collection))
    )

    // FALLBACK: Se gradeByCollection não identificou planos mas gradeByFile
    // tem análises relevantes, criar resultados sintéticos das análises
    if (searchResults.length === 0 && result.fileGradingResults) {
      const relevantFiles = result.fileGradingResults.filter(
        (f: any) => f.relevance !== "irrelevant"
      )
      if (relevantFiles.length > 0) {
        console.log(
          `[searchPlans] gradeByCollection returned 0 plans, falling back to ${relevantFiles.length} relevant files from gradeByFile`
        )
        searchResults = relevantFiles.map((f: any) => ({
          id: f.fileId,
          operadora: f.collectionName || "Operadora",
          nome_plano: f.fileName.replace(/\.pdf$/i, "").replace(/_/g, " "),
          tipo: "empresarial",
          abrangencia: "nacional",
          coparticipacao: false,
          rede_credenciada: [],
          carencias: {},
          metadata: {
            relevance: f.relevance,
            relevanceJustification: "Análise de arquivo identificou relevância",
            sourceFiles: [f.fileName],
            summary: f.analysisText?.substring(0, 500)
          }
        }))
      }
    }

    // Preparar metadata
    const searchMetadata: SearchMetadata = result.metadata
      ? {
          ...result.metadata,
          executionTimeMs
        }
      : {
          query: userQuery,
          totalFiles: 0,
          filesWithResults: 0,
          totalChunks: 0,
          ragModel: "gpt-5.4-mini",
          executionTimeMs,
          gradingStats: {
            highRelevance: 0,
            mediumRelevance: 0,
            lowRelevance: 0,
            irrelevant: 0
          }
        }

    // FASE 7: Retornar apenas dados brutos, sem resposta final
    // A resposta humanizada será gerada por generateRecommendation via LLM
    const rawResponse =
      searchResults.length > 0
        ? `Encontrei ${searchResults.length} plano${searchResults.length > 1 ? "s" : ""} compatíveis. Analisando...`
        : "Não encontrei planos compatíveis com seu perfil. Vamos ajustar os critérios?"

    console.log(
      `[searchPlans] Busca concluída: ${searchResults.length} planos identificados em ${executionTimeMs}ms`
    )

    const humanized = await humanizeResponse({
      rawResponse,
      state,
      messageType: "search_status"
    })

    // Build ragAnalysisContext: prefer consolidated analysis,
    // but fallback to raw file grading analyses if consolidated is empty
    let ragContext = result.analysisText || ""
    if (
      ragContext.length < 200 &&
      result.fileGradingResults &&
      result.fileGradingResults.length > 0
    ) {
      const fileAnalyses = result.fileGradingResults
        .filter((f: any) => f.analysisText && f.relevance !== "irrelevant")
        .map(
          (f: any) =>
            `=== ${f.fileName} (${f.collectionName || "?"}) ===\n${f.analysisText}`
        )
        .join("\n\n---\n\n")
      if (fileAnalyses.length > ragContext.length) {
        ragContext = fileAnalyses
        console.log(
          `[searchPlans] Using file-level analyses as ragContext (${ragContext.length} chars)`
        )
      }
    }

    return {
      searchResults,
      searchMetadata,
      collectionAnalyses: result.collectionAnalyses,
      ragAnalysisContext: ragContext,
      searchResultsVersion: (state.searchResultsVersion || 0) + 1,
      currentResponse: humanized.response,
      messages: [new AIMessage(humanized.response)]
    }
  } catch (error) {
    console.error("[searchPlans] Erro na busca:", error)

    const rawError =
      "Desculpe, houve um problema ao buscar os planos. Vou tentar de outra forma. " +
      "Pode me contar mais sobre suas necessidades específicas?"

    const humanized = await humanizeResponse({
      rawResponse: rawError,
      state,
      messageType: "error"
    })

    return {
      currentResponse: humanized.response,
      messages: [new AIMessage(humanized.response)],
      errors: [
        {
          capability: "searchPlans",
          message: error instanceof Error ? error.message : "Erro desconhecido",
          timestamp: new Date().toISOString()
        }
      ]
    }
  }
}

/**
 * Converte IdentifiedPlan (Fase 6E) para HealthPlanDocument
 */
function convertPlanToDocument(
  plan: IdentifiedPlan,
  collection: CollectionAnalysisResult
): HealthPlanDocument {
  // Tentar extrair dias das carências (ex: "180 dias internação" -> 180)
  const carencias: Record<string, number> = {}
  if (plan.waitingPeriods) {
    plan.waitingPeriods.forEach((period, index) => {
      const daysMatch = period.match(/(\d+)\s*(dias?)?/i)
      if (daysMatch) {
        carencias[`carencia_${index + 1}`] = parseInt(daysMatch[1], 10)
      }
    })
  }

  return {
    id: `${collection.collectionId}-${plan.planName}`,
    operadora: collection.collectionName,
    nome_plano: plan.planName,
    tipo: plan.planType || "general",
    abrangencia: plan.coverage?.length ? plan.coverage.join(", ") : "nacional",
    coparticipacao: Boolean(plan.coparticipation),
    rede_credenciada: plan.network || [],
    carencias,
    preco_base: plan.basePrice?.value,
    metadata: {
      relevance: plan.clientRelevance,
      relevanceJustification: plan.relevanceJustification,
      sourceFiles: plan.sourceFileNames,
      importantRules: plan.importantRules,
      waitingPeriods: plan.waitingPeriods, // Carências em texto original
      coparticipationDetails: plan.coparticipation,
      summary: plan.summary
    }
  }
}

/**
 * Extrai mensagens da conversa em formato string para o grading
 */
function extractConversationMessages(messages: any[]): string[] {
  if (!messages || messages.length === 0) {
    return []
  }

  // Pegar últimas 10 mensagens
  const recentMessages = messages.slice(-10)

  // Filtrar apenas mensagens do usuário e extrair conteúdo
  return recentMessages
    .filter(msg => {
      const type = msg._getType?.() || msg.constructor?.name || ""
      return type === "human" || type === "HumanMessage"
    })
    .map(msg => {
      const content =
        typeof msg.content === "string" ? msg.content : String(msg.content)
      return content
    })
    .filter(content => {
      // Filtrar mensagens muito curtas ou stop phrases
      const normalized = content.toLowerCase().trim()
      return normalized.length >= 5 && !STOP_PHRASES.has(normalized)
    })
}

// FASE 7: Função generateSearchResponseFromCollections REMOVIDA
// A geração de resposta humanizada agora é feita por generateRecommendation via LLM
// Ver: lib/agents/health-plan-v2/nodes/capabilities/generate-recommendation.ts

// =============================================================================
// Construção de Query
// =============================================================================

/**
 * Constrói query semântica rica a partir do perfil do cliente E contexto da conversa
 */
function buildSearchQuery(
  clientInfo: Record<string, any>,
  messages: any[]
): string {
  const queryParts: string[] = []

  // === PARTE 1: EXTRAIR CONTEXTO DA CONVERSA ===
  const conversationContext = extractConversationContext(messages)
  if (conversationContext) {
    queryParts.push(conversationContext)
  }

  // === PARTE 2: CONSTRUIR CONTEXTO DO CLIENTE ===

  // Base: sempre buscar planos de saúde
  queryParts.push("plano de saúde")

  // Idade e tipo de titular
  if (clientInfo.age) {
    const age = clientInfo.age
    if (age < 18) {
      queryParts.push(`criança ${age} anos`)
    } else if (age >= 18 && age < 30) {
      queryParts.push(`jovem adulto ${age} anos`)
    } else if (age >= 30 && age < 50) {
      queryParts.push(`adulto ${age} anos`)
    } else if (age >= 50 && age < 60) {
      queryParts.push(`adulto sênior ${age} anos`)
    } else {
      queryParts.push(`idoso ${age} anos terceira idade`)
    }
  }

  // Localização
  if (clientInfo.city) {
    queryParts.push(`${clientInfo.city}`)
  }
  if (clientInfo.state) {
    queryParts.push(`${clientInfo.state}`)
  }
  if (clientInfo.city || clientInfo.state) {
    queryParts.push("cobertura regional")
  }

  // Orçamento
  if (clientInfo.budget) {
    const budget = clientInfo.budget
    if (budget <= 300) {
      queryParts.push("econômico popular baixo custo")
    } else if (budget <= 500) {
      queryParts.push("custo moderado intermediário")
    } else if (budget <= 800) {
      queryParts.push("intermediário completo")
    } else if (budget <= 1500) {
      queryParts.push("premium executivo")
    } else {
      queryParts.push("premium alto padrão completo")
    }
    queryParts.push(`preço até R$${budget}`)
  }

  // Beneficiários empresariais
  if (clientInfo.beneficiaries && clientInfo.beneficiaries.length > 0) {
    const benCount = clientInfo.beneficiaries.length
    queryParts.push(`empresarial PME ${benCount} vidas funcionários`)

    // Coletar todas as idades dos beneficiários e seus dependentes
    const allAges: number[] = []
    let hasChildDep = false
    let hasElderlyBen = false
    let allConditions: string[] = []

    for (const ben of clientInfo.beneficiaries) {
      if (ben.age) allAges.push(ben.age)
      if (ben.age && ben.age >= 60) hasElderlyBen = true
      if (ben.healthConditions) allConditions.push(...ben.healthConditions)
      if (ben.dependents) {
        for (const dep of ben.dependents) {
          if (dep.age) allAges.push(dep.age)
          if (dep.age && dep.age < 18) hasChildDep = true
          if (dep.healthConditions) allConditions.push(...dep.healthConditions)
        }
      }
    }

    if (allAges.length > 0) {
      const minAge = Math.min(...allAges)
      const maxAge = Math.max(...allAges)
      queryParts.push(`faixa etária ${minAge} a ${maxAge} anos`)
    }
    if (hasChildDep) queryParts.push("cobertura infantil pediatria dependentes")
    if (hasElderlyBen) queryParts.push("cobertura idoso geriátrico")
    if (allConditions.length > 0) {
      queryParts.push("cobertura doenças pré-existentes")
      queryParts.push(
        Array.from(new Set(allConditions.map(c => c.toLowerCase()))).join(" ")
      )
    }
  }
  // Dependentes (plano individual/familiar)
  else if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    queryParts.push("plano familiar dependentes")

    const hasChildren = clientInfo.dependents.some(
      (d: any) => d.age && d.age < 18
    )
    const hasElderly = clientInfo.dependents.some(
      (d: any) => d.age && d.age >= 60
    )
    const hasSpouse = clientInfo.dependents.some(
      (d: any) => d.relationship === "cônjuge" || d.relationship === "spouse"
    )

    if (hasChildren) queryParts.push("cobertura infantil pediatria")
    if (hasElderly) queryParts.push("cobertura idoso geriátrico")
    if (hasSpouse) queryParts.push("casal cônjuge")
  } else {
    queryParts.push("individual")
  }

  // Tipo de contratação
  if (clientInfo.contractType) {
    queryParts.push(clientInfo.contractType)
  }

  // Condições de saúde
  if (clientInfo.healthConditions && clientInfo.healthConditions.length > 0) {
    queryParts.push("cobertura doenças pré-existentes")
    queryParts.push(clientInfo.healthConditions.join(" "))
  }

  // Preferências
  if (clientInfo.preferences && clientInfo.preferences.length > 0) {
    queryParts.push(clientInfo.preferences.join(" "))
  }

  // Tipo de plano
  if (clientInfo.planType) {
    queryParts.push(clientInfo.planType)
  }

  // Coparticipação
  if (clientInfo.acceptsCoparticipation === true) {
    queryParts.push("coparticipação")
  } else if (clientInfo.acceptsCoparticipation === false) {
    queryParts.push("sem coparticipação integral")
  }

  return queryParts.join(" ")
}

// =============================================================================
// Extração de Contexto da Conversa
// =============================================================================

const STOP_PHRASES = new Set([
  "sim",
  "não",
  "ok",
  "certo",
  "entendi",
  "pode ser",
  "beleza",
  "blz",
  "obrigado",
  "obrigada",
  "valeu",
  "show",
  "perfeito",
  "legal",
  "ótimo",
  "bom",
  "ta",
  "tá",
  "hmm",
  "uhum",
  "aham",
  "claro",
  "com certeza",
  "isso",
  "exato",
  "isso mesmo"
])

const HEALTH_PLAN_KEYWORDS = [
  "cirurgia",
  "bariátrica",
  "parto",
  "cesárea",
  "fisioterapia",
  "psicologia",
  "psicólogo",
  "psiquiatra",
  "nutricionista",
  "fonoaudiologia",
  "terapia",
  "quimioterapia",
  "radioterapia",
  "hemodiálise",
  "transplante",
  "home care",
  "internação",
  "uti",
  "emergência",
  "urgência",
  "exame",
  "ressonância",
  "tomografia",
  "ultrassom",
  "mamografia",
  "cardiologista",
  "ortopedista",
  "ginecologista",
  "pediatra",
  "dermatologista",
  "neurologista",
  "oncologista",
  "diabetes",
  "hipertensão",
  "câncer",
  "gravidez",
  "gestante",
  "carência",
  "coparticipação",
  "reembolso",
  "rede credenciada",
  "hospital",
  "unimed",
  "bradesco",
  "amil",
  "sulamerica",
  "hapvida"
]

function extractConversationContext(messages: any[]): string | null {
  if (!messages || messages.length === 0) {
    return null
  }

  const recentMessages = messages.slice(-10)
  const userMessages = recentMessages.filter(msg => {
    const type = msg._getType?.() || msg.constructor?.name || ""
    return type === "human" || type === "HumanMessage"
  })

  if (userMessages.length === 0) {
    return null
  }

  const relevantTerms: string[] = []

  for (const msg of userMessages) {
    const content =
      typeof msg.content === "string" ? msg.content : String(msg.content)

    const normalizedContent = content.toLowerCase().trim()
    if (normalizedContent.length < 5 || STOP_PHRASES.has(normalizedContent)) {
      continue
    }

    // Extrair termos de saúde
    for (const keyword of HEALTH_PLAN_KEYWORDS) {
      if (normalizedContent.includes(keyword.toLowerCase())) {
        relevantTerms.push(keyword)
      }
    }

    // Incluir mensagens longas
    if (content.length > 20) {
      const cleaned = cleanMessageForQuery(content)
      if (cleaned) {
        relevantTerms.push(cleaned)
      }
    }
  }

  const uniqueTerms = Array.from(new Set(relevantTerms))

  if (uniqueTerms.length === 0) {
    return null
  }

  const contextString = uniqueTerms.slice(0, 10).join(" ")
  console.log(
    `[buildSearchQuery] Contexto extraído da conversa: "${contextString}"`
  )

  return contextString
}

function cleanMessageForQuery(text: string): string | null {
  const cleanPatterns = [
    /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eai)[,!.\s]*/i,
    /^(por favor|pf|pfv)[,.\s]*/i,
    /(obrigado|obrigada|valeu|agradeço)[!.\s]*$/i,
    /^(eu )?(quero|preciso|gostaria|queria)( de)?( saber)?/i,
    /^(me )?(fala|conta|diz|explica)( sobre)?/i,
    /\?+$/
  ]

  let cleaned = text.trim()
  for (const pattern of cleanPatterns) {
    cleaned = cleaned.replace(pattern, "").trim()
  }

  if (cleaned.length < 10 || STOP_PHRASES.has(cleaned.toLowerCase())) {
    return null
  }

  if (cleaned.length > 100) {
    cleaned = cleaned.substring(0, 100)
  }

  return cleaned
}
