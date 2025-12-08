/**
 * RAG Evaluation - Avaliadores customizados para LangSmith
 *
 * Implementa 3 avaliadores para medir qualidade do sistema RAG:
 * - relevance: Docs retornados são relevantes ao perfil?
 * - groundedness: Resposta está fundamentada nos docs?
 * - retrieval_quality: Qualidade geral da busca
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6D.1
 */

import { Client } from "langsmith"
import { evaluate, type EvaluationResult } from "langsmith/evaluation"
import {
  getLangSmithClient,
  isLangSmithEnabled
} from "../../../monitoring/langsmith-config"
import type { PartialClientInfo, Dependent } from "../types"
import type { GradedDocument, SearchMetadata } from "../schemas/rag-schemas"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input para avaliação RAG
 */
export interface RAGEvaluationInput {
  /** Informações do cliente usadas na busca */
  clientInfo: PartialClientInfo
  /** Queries geradas */
  queries: string[]
  /** Documentos retornados com grading */
  documents: GradedDocument[]
  /** Metadados da busca */
  searchMetadata: SearchMetadata
  /** Resposta gerada (para groundedness) */
  response?: string
}

/**
 * Output de um avaliador
 */
export interface EvaluatorOutput {
  /** Chave identificadora do avaliador */
  key: string
  /** Score normalizado 0-1 */
  score: number
  /** Comentário explicativo */
  comment?: string
  /** Detalhes adicionais */
  metadata?: Record<string, unknown>
}

/**
 * Resultado agregado da avaliação RAG
 */
export interface RAGEvaluationResult {
  /** Score de relevância (0-1) */
  relevance: number
  /** Score de fundamentação (0-1) */
  groundedness: number
  /** Score de qualidade de retrieval (0-1) */
  retrievalQuality: number
  /** Score médio geral (0-1) */
  overallScore: number
  /** Detalhes por avaliador */
  details: {
    relevance: EvaluatorOutput
    groundedness: EvaluatorOutput
    retrievalQuality: EvaluatorOutput
  }
  /** Timestamp da avaliação */
  timestamp: string
}

/**
 * Caso de teste para evaluation
 */
export interface RAGTestCase {
  /** ID único do caso */
  id: string
  /** Descrição do caso */
  description: string
  /** Input do cliente */
  input: PartialClientInfo
  /** Comportamento esperado */
  expectedBehavior: string
  /** Mínimo de docs relevantes esperado */
  minRelevantDocs: number
  /** Categoria do caso (ex: "jovem", "familia", "idoso", "pec") */
  category?: string
  /** Tags para categorização */
  tags?: string[]
}

// =============================================================================
// EVALUATORS
// =============================================================================

/**
 * Avaliador de Relevância
 *
 * Mede se os documentos retornados são relevantes para o perfil do cliente.
 *
 * Critérios:
 * - Docs marcados como "relevant" pelo grading
 * - Cobertura de critérios do cliente (idade, cidade, orçamento, etc.)
 * - Penalidade por docs irrelevantes
 *
 * @param input - Dados da avaliação
 * @returns Score 0-1 com comentário
 */
export function relevanceEvaluator(input: RAGEvaluationInput): EvaluatorOutput {
  const { clientInfo, documents, searchMetadata } = input

  if (!documents || documents.length === 0) {
    return {
      key: "relevance",
      score: 0,
      comment: "Nenhum documento retornado",
      metadata: { totalDocs: 0, relevantDocs: 0 }
    }
  }

  // Contar docs relevantes
  const relevantDocs = documents.filter(
    doc => doc.isRelevant || doc.gradeResult?.score === "relevant"
  )
  const partiallyRelevantDocs = documents.filter(
    doc => doc.gradeResult?.score === "partially_relevant"
  )

  // Calcular cobertura de critérios do cliente
  const criteriaScore = calculateCriteriaCoverage(clientInfo, documents)

  // Score base: proporção de docs relevantes
  const relevanceRatio = relevantDocs.length / documents.length
  const partialRatio = (partiallyRelevantDocs.length * 0.5) / documents.length

  // Score final: 60% relevância direta + 30% parcial + 10% cobertura
  const score = Math.min(
    1,
    relevanceRatio * 0.6 + partialRatio * 0.3 + criteriaScore * 0.1
  )

  return {
    key: "relevance",
    score: Math.round(score * 100) / 100,
    comment: `${relevantDocs.length}/${documents.length} docs relevantes, cobertura ${Math.round(criteriaScore * 100)}%`,
    metadata: {
      totalDocs: documents.length,
      relevantDocs: relevantDocs.length,
      partiallyRelevantDocs: partiallyRelevantDocs.length,
      criteriaScore,
      fromMetadata: searchMetadata.relevantDocs
    }
  }
}

/**
 * Avaliador de Fundamentação (Groundedness)
 *
 * Mede se a resposta gerada está fundamentada nos documentos retornados.
 *
 * Critérios:
 * - Informações na resposta podem ser rastreadas aos docs
 * - Não há "alucinações" (informações inventadas)
 * - Citações/referências corretas
 *
 * @param input - Dados da avaliação
 * @returns Score 0-1 com comentário
 */
export function groundednessEvaluator(
  input: RAGEvaluationInput
): EvaluatorOutput {
  const { documents, response } = input

  // Se não há resposta, não pode avaliar groundedness
  if (!response) {
    return {
      key: "groundedness",
      score: 0.5,
      comment: "Resposta não fornecida para avaliação de groundedness",
      metadata: { hasResponse: false }
    }
  }

  if (!documents || documents.length === 0) {
    return {
      key: "groundedness",
      score: 0,
      comment: "Sem documentos para fundamentar resposta",
      metadata: { hasDocuments: false }
    }
  }

  // Extrair termos chave dos documentos
  const docTerms = extractKeyTermsFromDocs(documents)

  // Extrair termos chave da resposta
  const responseTerms = extractKeyTermsFromResponse(response)

  // Calcular overlap
  const overlapScore = calculateTermOverlap(docTerms, responseTerms)

  // Verificar menções de operadoras/planos
  const operatorMentions = checkOperatorMentions(documents, response)

  // Score final: 70% overlap de termos + 30% menções corretas
  const score = overlapScore * 0.7 + operatorMentions * 0.3

  return {
    key: "groundedness",
    score: Math.round(score * 100) / 100,
    comment: `Overlap de termos: ${Math.round(overlapScore * 100)}%, menções corretas: ${Math.round(operatorMentions * 100)}%`,
    metadata: {
      docTermsCount: docTerms.size,
      responseTermsCount: responseTerms.size,
      overlapScore,
      operatorMentions
    }
  }
}

/**
 * Avaliador de Qualidade de Retrieval
 *
 * Mede a qualidade geral do processo de busca.
 *
 * Critérios:
 * - Quantidade de docs relevantes (target >= 5)
 * - Taxa de rewrites (target < 30%)
 * - Diversidade de operadoras/planos
 * - Latência (implícita nos metadados)
 *
 * @param input - Dados da avaliação
 * @returns Score 0-1 com comentário
 */
export function retrievalQualityEvaluator(
  input: RAGEvaluationInput
): EvaluatorOutput {
  const { documents, searchMetadata, queries } = input

  // Componente 1: Quantidade de docs relevantes (target >= 5)
  const relevantCount = searchMetadata.relevantDocs ?? 0
  const quantityScore = Math.min(1, relevantCount / 5)

  // Componente 2: Taxa de rewrites (target < 30%, max 2)
  const rewriteRate = (searchMetadata.rewriteCount ?? 0) / 2
  const rewriteScore = 1 - rewriteRate * 0.5 // Penalidade suave por rewrites

  // Componente 3: Diversidade de operadoras
  const diversityScore = calculateOperatorDiversity(documents)

  // Componente 4: Eficiência das queries
  const queryEfficiency = queries.length >= 3 ? 1 : queries.length / 3

  // Score final: 40% quantidade + 20% rewrites + 25% diversidade + 15% queries
  const score =
    quantityScore * 0.4 +
    rewriteScore * 0.2 +
    diversityScore * 0.25 +
    queryEfficiency * 0.15

  // Penalidade se atingiu limite de resultados
  const finalScore = searchMetadata.limitedResults ? score * 0.8 : score

  return {
    key: "retrieval_quality",
    score: Math.round(Math.min(1, finalScore) * 100) / 100,
    comment: `Relevantes: ${relevantCount}/5, Rewrites: ${searchMetadata.rewriteCount}/2, Diversidade: ${Math.round(diversityScore * 100)}%`,
    metadata: {
      relevantCount,
      rewriteCount: searchMetadata.rewriteCount,
      queryCount: queries.length,
      diversityScore,
      limitedResults: searchMetadata.limitedResults
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calcula cobertura de critérios do cliente nos documentos
 */
function calculateCriteriaCoverage(
  clientInfo: PartialClientInfo,
  documents: GradedDocument[]
): number {
  let criteriaMet = 0
  let totalCriteria = 0

  const allContent = documents.map(d => d.content.toLowerCase()).join(" ")

  // Verificar critérios
  if (clientInfo.city) {
    totalCriteria++
    if (
      allContent.includes(clientInfo.city.toLowerCase()) ||
      allContent.includes("nacional")
    ) {
      criteriaMet++
    }
  }

  if (clientInfo.age) {
    totalCriteria++
    // Verificar se menciona faixa etária ou idade
    const ageBand = getAgeBandLabel(clientInfo.age)
    if (
      allContent.includes(ageBand) ||
      allContent.includes("todas as idades")
    ) {
      criteriaMet++
    }
  }

  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    totalCriteria++
    if (
      allContent.includes("familiar") ||
      allContent.includes("dependente") ||
      allContent.includes("família")
    ) {
      criteriaMet++
    }
  }

  if (clientInfo.healthConditions && clientInfo.healthConditions.length > 0) {
    totalCriteria++
    const hasConditionCoverage = clientInfo.healthConditions.some(
      condition =>
        allContent.includes(condition.toLowerCase()) ||
        allContent.includes("pré-existente") ||
        allContent.includes("carência")
    )
    if (hasConditionCoverage) criteriaMet++
  }

  return totalCriteria > 0 ? criteriaMet / totalCriteria : 0.5
}

/**
 * Extrai termos chave dos documentos
 */
function extractKeyTermsFromDocs(documents: GradedDocument[]): Set<string> {
  const terms = new Set<string>()

  documents.forEach(doc => {
    // Extrair operadora
    if (doc.metadata?.operator) {
      terms.add(doc.metadata.operator.toLowerCase())
    }

    // Extrair termos do conteúdo (simplificado)
    const content = doc.content.toLowerCase()
    const words = content.match(/\b[a-záéíóúãõâêîôûç]{4,}\b/g) || []
    words.slice(0, 50).forEach((w: string) => terms.add(w))
  })

  return terms
}

/**
 * Extrai termos chave da resposta
 */
function extractKeyTermsFromResponse(response: string): Set<string> {
  const terms = new Set<string>()
  const content = response.toLowerCase()
  const words = content.match(/\b[a-záéíóúãõâêîôûç]{4,}\b/g) || []
  words.forEach(w => terms.add(w))
  return terms
}

/**
 * Calcula overlap entre termos
 */
function calculateTermOverlap(
  docTerms: Set<string>,
  responseTerms: Set<string>
): number {
  if (responseTerms.size === 0) return 0

  let overlap = 0
  responseTerms.forEach(term => {
    if (docTerms.has(term)) overlap++
  })

  return overlap / responseTerms.size
}

/**
 * Verifica menções corretas de operadoras na resposta
 */
function checkOperatorMentions(
  documents: GradedDocument[],
  response: string
): number {
  const operators = new Set<string>()
  documents.forEach(doc => {
    if (doc.metadata?.operator) {
      operators.add(doc.metadata.operator.toLowerCase())
    }
  })

  if (operators.size === 0) return 0.5

  const responseLower = response.toLowerCase()
  let mentioned = 0
  operators.forEach(op => {
    if (responseLower.includes(op)) mentioned++
  })

  return mentioned / operators.size
}

/**
 * Calcula diversidade de operadoras nos documentos
 */
function calculateOperatorDiversity(documents: GradedDocument[]): number {
  const operators = new Set<string>()
  documents.forEach(doc => {
    if (doc.metadata?.operator) {
      operators.add(doc.metadata.operator)
    }
  })

  // Target: 3+ operadoras diferentes
  return Math.min(1, operators.size / 3)
}

/**
 * Retorna label da faixa etária ANS
 */
function getAgeBandLabel(age: number): string {
  if (age <= 18) return "0-18"
  if (age <= 38) return "19-38"
  if (age <= 59) return "39-59"
  if (age <= 75) return "60-75"
  return "76+"
}

// =============================================================================
// MAIN EVALUATION FUNCTION
// =============================================================================

/**
 * Executa avaliação completa RAG
 *
 * Roda os 3 avaliadores e agrega resultados.
 *
 * @param input - Dados da avaliação
 * @returns Resultado agregado com scores
 */
export function evaluateRAG(input: RAGEvaluationInput): RAGEvaluationResult {
  const relevanceResult = relevanceEvaluator(input)
  const groundednessResult = groundednessEvaluator(input)
  const retrievalResult = retrievalQualityEvaluator(input)

  // Calcular score geral (média ponderada)
  const overallScore =
    relevanceResult.score * 0.4 +
    groundednessResult.score * 0.3 +
    retrievalResult.score * 0.3

  return {
    relevance: relevanceResult.score,
    groundedness: groundednessResult.score,
    retrievalQuality: retrievalResult.score,
    overallScore: Math.round(overallScore * 100) / 100,
    details: {
      relevance: relevanceResult,
      groundedness: groundednessResult,
      retrievalQuality: retrievalResult
    },
    timestamp: new Date().toISOString()
  }
}

// =============================================================================
// LANGSMITH INTEGRATION
// =============================================================================

/**
 * Cria avaliadores no formato LangSmith
 *
 * @returns Array de funções avaliadoras para LangSmith evaluate()
 */
export function createLangSmithEvaluators() {
  return [
    // Relevance evaluator
    async ({
      input,
      output
    }: {
      input: RAGEvaluationInput
      output?: unknown
    }) => {
      const result = relevanceEvaluator(input)
      return {
        key: result.key,
        score: result.score,
        comment: result.comment
      }
    },

    // Groundedness evaluator
    async ({
      input,
      output
    }: {
      input: RAGEvaluationInput
      output?: unknown
    }) => {
      const result = groundednessEvaluator(input)
      return {
        key: result.key,
        score: result.score,
        comment: result.comment
      }
    },

    // Retrieval quality evaluator
    async ({
      input,
      output
    }: {
      input: RAGEvaluationInput
      output?: unknown
    }) => {
      const result = retrievalQualityEvaluator(input)
      return {
        key: result.key,
        score: result.score,
        comment: result.comment
      }
    }
  ]
}

/**
 * Executa evaluation via LangSmith
 *
 * @param datasetName - Nome do dataset no LangSmith
 * @param targetFunction - Função a ser avaliada
 * @param experimentPrefix - Prefixo para o experimento
 * @returns Resultados da avaliação
 */
export async function runLangSmithEvaluation(
  datasetName: string,
  targetFunction: (input: PartialClientInfo) => Promise<RAGEvaluationInput>,
  experimentPrefix: string = "rag-evaluation"
): Promise<EvaluationResult[]> {
  if (!isLangSmithEnabled()) {
    console.warn("[rag-evaluation] LangSmith não está habilitado")
    return []
  }

  const client = getLangSmithClient()

  if (!client) {
    console.error("[rag-evaluation] Falha ao criar cliente LangSmith")
    return []
  }

  // Verificar se dataset existe
  try {
    await client.readDataset({ datasetName })
  } catch {
    console.error(`[rag-evaluation] Dataset "${datasetName}" não encontrado`)
    return []
  }

  // Executar avaliação
  // Note: Using 'any' cast due to complex generic types in LangSmith SDK
  const results = await evaluate(targetFunction as any, {
    data: datasetName,
    evaluators: createLangSmithEvaluators() as any,
    experimentPrefix,
    client,
    maxConcurrency: 2
  })

  return results as unknown as EvaluationResult[]
}

// =============================================================================
// METRICS EXPORT
// =============================================================================

/**
 * Formata resultado para métricas
 */
export function formatMetrics(result: RAGEvaluationResult): {
  labels: Record<string, string>
  values: Record<string, number>
} {
  return {
    labels: {
      timestamp: result.timestamp
    },
    values: {
      rag_relevance_score: result.relevance,
      rag_groundedness_score: result.groundedness,
      rag_retrieval_quality_score: result.retrievalQuality,
      rag_overall_score: result.overallScore
    }
  }
}

/**
 * Exporta métricas agregadas de múltiplas avaliações
 */
export function aggregateMetrics(results: RAGEvaluationResult[]): {
  count: number
  avgRelevance: number
  avgGroundedness: number
  avgRetrievalQuality: number
  avgOverall: number
  minOverall: number
  maxOverall: number
  belowThreshold: number // count of results with overall < 0.6
} {
  if (results.length === 0) {
    return {
      count: 0,
      avgRelevance: 0,
      avgGroundedness: 0,
      avgRetrievalQuality: 0,
      avgOverall: 0,
      minOverall: 0,
      maxOverall: 0,
      belowThreshold: 0
    }
  }

  const sum = results.reduce(
    (acc, r) => ({
      relevance: acc.relevance + r.relevance,
      groundedness: acc.groundedness + r.groundedness,
      retrievalQuality: acc.retrievalQuality + r.retrievalQuality,
      overall: acc.overall + r.overallScore
    }),
    { relevance: 0, groundedness: 0, retrievalQuality: 0, overall: 0 }
  )

  const overallScores = results.map(r => r.overallScore)

  return {
    count: results.length,
    avgRelevance: Math.round((sum.relevance / results.length) * 100) / 100,
    avgGroundedness:
      Math.round((sum.groundedness / results.length) * 100) / 100,
    avgRetrievalQuality:
      Math.round((sum.retrievalQuality / results.length) * 100) / 100,
    avgOverall: Math.round((sum.overall / results.length) * 100) / 100,
    minOverall: Math.min(...overallScores),
    maxOverall: Math.max(...overallScores),
    belowThreshold: results.filter(r => r.overallScore < 0.6).length
  }
}
