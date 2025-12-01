/**
 * Health Plan Compatibility Analysis Tool
 *
 * Analisa a compatibilidade entre perfil do cliente e planos de saúde
 * usando GPT-4o para análise semântica profunda.
 *
 * Referência: PRD health-plan-agent-prd.md (RF-005)
 * Task Master: Task #7 (Desenvolver ferramenta analyzeCompatibility)
 */

import OpenAI from "openai"
import type { ClientInfo } from "./schemas/client-info-schema"
import type { HealthPlanSearchResult } from "./types"
import { getModelParams } from "./prompts/extraction-prompts"

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Severidade de um alerta (carência, exclusão, limitação)
 */
export type AlertSeverity = "high" | "medium" | "low"

/**
 * Tipo de alerta identificado na análise
 */
export type AlertType =
  | "carencia" // Período de carência
  | "exclusao" // Exclusão de cobertura
  | "limitacao" // Limitação de atendimentos/procedimentos
  | "restricao_regional" // Restrição de rede credenciada
  | "idade" // Restrição por idade
  | "pre_existente" // Limitação por condição pré-existente

/**
 * Alerta crítico identificado durante a análise
 */
export interface ExclusionAlert {
  type: AlertType
  severity: AlertSeverity
  title: string
  description: string
  affectedConditions?: string[] // Condições do cliente afetadas
  impactScore: number // 0-10, quanto maior pior o impacto
}

/**
 * Análise de elegibilidade para um plano
 */
export interface EligibilityAnalysis {
  isEligible: boolean
  confidence: number // 0-100
  reasons: string[]
  blockers?: string[] // Razões que impedem elegibilidade
  warnings?: string[] // Avisos que não impedem mas são importantes
}

/**
 * Avaliação de cobertura para uma condição específica
 */
export interface ConditionCoverageEvaluation {
  condition: string // Condição pré-existente
  isCovered: boolean
  coverageLevel: "full" | "partial" | "excluded" | "unclear"
  details: string
  relevantClauses?: string[] // Trechos relevantes dos documentos
  waitingPeriod?: number // Carência em dias, se aplicável
}

/**
 * Avaliação completa de coberturas para o perfil
 */
export interface CoverageEvaluation {
  overallAdequacy: number // 0-100
  conditionsCoverage: ConditionCoverageEvaluation[]
  generalCoverageHighlights: string[]
  missingCriticalCoverages?: string[]
}

/**
 * Score de compatibilidade detalhado
 */
export interface CompatibilityScore {
  overall: number // 0-100
  breakdown: {
    eligibility: number // 0-100 (peso 30%)
    coverage: number // 0-100 (peso 25%)
    budget: number // 0-100 (peso 20%)
    network: number // 0-100 (peso 15%)
    preferences: number // 0-100 (peso 10%)
  }
  calculation: string // Explicação do cálculo
}

/**
 * Análise completa de compatibilidade de um plano
 */
export interface PlanCompatibilityAnalysis {
  planId: string
  planName: string
  operadora?: string
  collectionId: string
  collectionName: string

  // Análises
  eligibility: EligibilityAnalysis
  coverage: CoverageEvaluation
  score: CompatibilityScore

  // Prós e contras
  pros: string[]
  cons: string[]

  // Alertas críticos
  alerts: ExclusionAlert[]

  // Justificativa humanizada
  reasoning: string

  // Recomendação de uso
  bestFor?: string // "Jovem saudável", "Família com crianças", etc.

  // Metadata
  analyzedAt: string
  confidence: number // 0-100, confiança na análise
}

/**
 * Badge de destaque para um plano
 */
export type PlanBadge =
  | "melhor-custo-beneficio" // Melhor relação score/preço
  | "mais-completo" // Maior cobertura
  | "mais-acessivel" // Menor preço
  | "recomendado" // Maior score overall

/**
 * Categoria de urgência para alertas
 */
export type AlertUrgency = "critico" | "importante" | "informativo"

/**
 * Alerta crítico categorizado
 */
export interface CategorizedAlert {
  planId: string
  planName: string
  alert: ExclusionAlert
  urgency: AlertUrgency
  category: string // "Carência", "Exclusão", "Limitação", etc.
}

/**
 * Sumário executivo do ranking
 */
export interface ExecutiveSummary {
  topPlan: {
    name: string
    score: number
    mainReason: string
  }
  alternatives: Array<{
    name: string
    score: number
    differentiator: string
  }>
  criticalAlerts: number
  averageScore: number
}

/**
 * Resultado consolidado da análise de compatibilidade (COMPLETO)
 */
export interface RankedAnalysis {
  clientProfile: ClientInfo
  rankedPlans: PlanCompatibilityAnalysis[]
  recommended: {
    main: PlanCompatibilityAnalysis
    alternatives: PlanCompatibilityAnalysis[]
  }
  badges: {
    [planId: string]: PlanBadge[]
  }
  criticalAlerts: {
    all: CategorizedAlert[]
    byUrgency: {
      critico: CategorizedAlert[]
      importante: CategorizedAlert[]
      informativo: CategorizedAlert[]
    }
    byPlan: {
      [planId: string]: CategorizedAlert[]
    }
  }
  executiveSummary: ExecutiveSummary
  budget: PlanCompatibilityAnalysis | null
  premium: PlanCompatibilityAnalysis | null
  executionTimeMs: number
  metadata: {
    totalPlansAnalyzed: number
    analysisVersion: string
    modelUsed: string
  }
}

/**
 * Resultado consolidado da análise de compatibilidade (LEGACY - manter compatibilidade)
 * @deprecated Use RankedAnalysis instead
 */
export interface AnalysisResult {
  clientProfile: ClientInfo
  analyzedPlans: PlanCompatibilityAnalysis[]
  ranking: {
    recommended: PlanCompatibilityAnalysis // Melhor opção
    alternatives: PlanCompatibilityAnalysis[] // Top 2-3
    budget: PlanCompatibilityAnalysis | null // Opção mais econômica
    premium: PlanCompatibilityAnalysis | null // Opção mais completa
  }
  executionTimeMs: number
  metadata: {
    totalPlansAnalyzed: number
    analysisVersion: string
    modelUsed: string
  }
}

/**
 * Documento de plano de saúde enriquecido para análise
 */
export interface HealthPlanDocument {
  planId: string
  planName: string
  operadora?: string
  collectionId: string
  collectionName: string

  // Conteúdo dos documentos
  documents: HealthPlanSearchResult[]

  // Metadata opcional
  metadata?: {
    lastUpdated?: string
    documentVersion?: string
    totalChunks?: number
  }
}

/**
 * Parâmetros para análise de compatibilidade
 */
export interface AnalyzeCompatibilityParams {
  clientInfo: ClientInfo
  plans: HealthPlanDocument[]
  options?: {
    topK?: number // Quantos planos retornar no ranking (default: 3)
    includeAlternatives?: boolean // Incluir opções budget/premium
    detailedReasoning?: boolean // Gerar justificativas mais detalhadas
    maxConcurrency?: number // Máximo de análises paralelas (default: 5)
    timeoutMs?: number // Timeout por plano (default: 10000)
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Pesos para cálculo do score de compatibilidade
 */
export const SCORE_WEIGHTS = {
  eligibility: 0.3, // 30%
  coverage: 0.25, // 25%
  budget: 0.2, // 20%
  network: 0.15, // 15%
  preferences: 0.1 // 10%
} as const

/**
 * Limites de configuração
 */
export const LIMITS = {
  MAX_PLANS_PER_ANALYSIS: 10,
  MAX_CONCURRENT_ANALYSES: 5,
  DEFAULT_TIMEOUT_MS: 10000,
  DEFAULT_TOP_K: 3
} as const

/**
 * Versão do schema de análise
 */
export const ANALYSIS_VERSION = "1.0.0"

/**
 * Modelo default para análise de compatibilidade
 */
export const DEFAULT_ANALYSIS_MODEL = "gpt-5-mini"

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calcula score de elegibilidade (0-100)
 * Baseado na análise de elegibilidade retornada pelo GPT-4o
 */
export function calculateEligibilityScore(
  eligibility: EligibilityAnalysis
): number {
  if (!eligibility.isEligible) {
    return 0
  }

  // Score base pela confiança
  let score = eligibility.confidence

  // Penaliza por warnings
  if (eligibility.warnings && eligibility.warnings.length > 0) {
    const penalty = Math.min(eligibility.warnings.length * 5, 20)
    score -= penalty
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * Calcula score de cobertura (0-100)
 * Baseado na adequação da cobertura para o perfil do cliente
 */
export function calculateCoverageScore(coverage: CoverageEvaluation): number {
  // Score base pela adequação geral
  let score = coverage.overallAdequacy

  // Bônus se todas as condições pré-existentes estão cobertas
  if (coverage.conditionsCoverage.length > 0) {
    const fullyCovered = coverage.conditionsCoverage.filter(
      c => c.coverageLevel === "full"
    ).length
    const partiallyCovered = coverage.conditionsCoverage.filter(
      c => c.coverageLevel === "partial"
    ).length
    const total = coverage.conditionsCoverage.length

    const coverageRatio = (fullyCovered + partiallyCovered * 0.5) / total
    score = score * 0.6 + coverageRatio * 100 * 0.4
  }

  // Penaliza por coberturas críticas faltantes
  if (
    coverage.missingCriticalCoverages &&
    coverage.missingCriticalCoverages.length > 0
  ) {
    const penalty = coverage.missingCriticalCoverages.length * 15
    score -= penalty
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * Calcula score de orçamento (0-100)
 * Compara preço estimado do plano com orçamento do cliente
 *
 * @param planPrice Preço mensal estimado do plano (em R$)
 * @param clientBudget Orçamento mensal do cliente (em R$)
 * @param familySize Número de pessoas (titular + dependentes)
 */
export function calculateBudgetScore(
  planPrice: number | null,
  clientBudget: number,
  familySize: number
): number {
  // Se não temos preço, assumimos score médio
  if (!planPrice || planPrice === 0) {
    return 50
  }

  const budgetPerPerson = clientBudget / familySize
  const pricePerPerson = planPrice / familySize

  // Calcula ratio (quanto do orçamento será usado)
  const ratio = pricePerPerson / budgetPerPerson

  // Scoring baseado no ratio
  if (ratio <= 0.7) {
    // Preço muito abaixo do orçamento: excelente (90-100)
    return Math.round(90 + (0.7 - ratio) * 50)
  } else if (ratio <= 0.9) {
    // Preço bem abaixo do orçamento: ótimo (80-90)
    return Math.round(80 + (0.9 - ratio) * 50)
  } else if (ratio <= 1.0) {
    // Preço dentro do orçamento: bom (70-80)
    return Math.round(70 + (1.0 - ratio) * 100)
  } else if (ratio <= 1.1) {
    // Preço ligeiramente acima: razoável (50-70)
    return Math.round(50 + (1.1 - ratio) * 200)
  } else if (ratio <= 1.3) {
    // Preço acima do orçamento: ruim (20-50)
    return Math.round(20 + (1.3 - ratio) * 150)
  } else {
    // Preço muito acima: péssimo (0-20)
    return Math.max(0, Math.round(20 - (ratio - 1.3) * 50))
  }
}

/**
 * Calcula score de rede credenciada (0-100)
 * Baseado na disponibilidade de rede na região do cliente
 *
 * @param clientCity Cidade do cliente
 * @param clientState Estado do cliente
 * @param planDocuments Documentos do plano com informações de rede
 */
export function calculateNetworkScore(
  clientCity: string,
  clientState: string,
  planDocuments: HealthPlanSearchResult[]
): number {
  // Procura por menções da cidade/estado nos documentos
  const cityMentions = planDocuments.filter(doc =>
    doc.content.toLowerCase().includes(clientCity.toLowerCase())
  ).length

  const stateMentions = planDocuments.filter(doc =>
    doc.content.toLowerCase().includes(clientState.toUpperCase())
  ).length

  // Palavras-chave de cobertura regional
  const regionalKeywords = [
    "nacional",
    "abrangência nacional",
    "todo o brasil",
    "todas as cidades",
    "cobertura em todo",
    "rede em todo"
  ]

  const hasNationalCoverage = planDocuments.some(doc =>
    regionalKeywords.some(keyword =>
      doc.content.toLowerCase().includes(keyword)
    )
  )

  // Scoring
  let score = 50 // Base score

  if (hasNationalCoverage) {
    score = 90
  } else if (cityMentions > 0) {
    score = 85 + Math.min(cityMentions * 3, 15) // 85-100
  } else if (stateMentions > 0) {
    score = 70 + Math.min(stateMentions * 5, 15) // 70-85
  }

  return Math.min(100, Math.round(score))
}

/**
 * Calcula score de preferências (0-100)
 * Baseado em quão bem o plano atende às preferências do cliente
 */
export function calculatePreferencesScore(
  clientPreferences: ClientInfo["preferences"],
  planDocuments: HealthPlanSearchResult[]
): number {
  // Se não há preferências, score neutro
  if (!clientPreferences) {
    return 50
  }

  let score = 50
  let matchedPreferences = 0
  let totalPreferences = 0

  // Preferência por tipo de rede
  if (clientPreferences.networkType) {
    totalPreferences++
    const keywords =
      clientPreferences.networkType === "broad"
        ? ["ampla", "abrangente", "extensa", "livre escolha"]
        : ["restrita", "limitada", "específica"]

    const hasMatch = planDocuments.some(doc =>
      keywords.some(keyword => doc.content.toLowerCase().includes(keyword))
    )

    if (hasMatch) {
      matchedPreferences++
      score += 15
    }
  }

  // Preferência por coparticipação
  if (clientPreferences.coParticipation !== undefined) {
    totalPreferences++
    const wantsCoParticipation = clientPreferences.coParticipation

    const hasCoParticipation = planDocuments.some(
      doc =>
        doc.content.toLowerCase().includes("coparticipação") ||
        doc.content.toLowerCase().includes("co-participação")
    )

    if (hasCoParticipation === wantsCoParticipation) {
      matchedPreferences++
      score += 20
    } else {
      score -= 10
    }
  }

  // Preferência por hospitais específicos
  if (
    clientPreferences.specificHospitals &&
    clientPreferences.specificHospitals.length > 0
  ) {
    totalPreferences++
    const matchedHospitals = clientPreferences.specificHospitals.filter(
      hospital =>
        planDocuments.some(doc =>
          doc.content.toLowerCase().includes(hospital.toLowerCase())
        )
    )

    if (matchedHospitals.length > 0) {
      matchedPreferences++
      const matchRatio =
        matchedHospitals.length / clientPreferences.specificHospitals.length
      score += matchRatio * 25
    } else {
      score -= 15
    }
  }

  // Se não há preferências específicas, retorna score neutro
  if (totalPreferences === 0) {
    return 50
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * Calcula score de compatibilidade completo baseado nos componentes
 */
export function calculateCompatibilityScore(
  eligibility: number,
  coverage: number,
  budget: number,
  network: number,
  preferences: number
): CompatibilityScore {
  const breakdown = {
    eligibility,
    coverage,
    budget,
    network,
    preferences
  }

  const overall = Math.round(
    eligibility * SCORE_WEIGHTS.eligibility +
      coverage * SCORE_WEIGHTS.coverage +
      budget * SCORE_WEIGHTS.budget +
      network * SCORE_WEIGHTS.network +
      preferences * SCORE_WEIGHTS.preferences
  )

  const calculation = `
Score calculado: ${overall}/100
- Elegibilidade (30%): ${eligibility} × 0.3 = ${(eligibility * SCORE_WEIGHTS.eligibility).toFixed(1)}
- Cobertura (25%): ${coverage} × 0.25 = ${(coverage * SCORE_WEIGHTS.coverage).toFixed(1)}
- Orçamento (20%): ${budget} × 0.2 = ${(budget * SCORE_WEIGHTS.budget).toFixed(1)}
- Rede Credenciada (15%): ${network} × 0.15 = ${(network * SCORE_WEIGHTS.network).toFixed(1)}
- Preferências (10%): ${preferences} × 0.1 = ${(preferences * SCORE_WEIGHTS.preferences).toFixed(1)}
  `.trim()

  return {
    overall,
    breakdown,
    calculation
  }
}

/**
 * Calcula todos os scores de uma vez
 * Função auxiliar para simplificar o processo de scoring
 */
export function calculateAllScores(params: {
  eligibility: EligibilityAnalysis
  coverage: CoverageEvaluation
  planPrice: number | null
  clientInfo: ClientInfo
  planDocuments: HealthPlanSearchResult[]
}): CompatibilityScore {
  const familySize = 1 + (params.clientInfo.dependents?.length || 0)

  const scores = {
    eligibility: calculateEligibilityScore(params.eligibility),
    coverage: calculateCoverageScore(params.coverage),
    budget: calculateBudgetScore(
      params.planPrice,
      params.clientInfo.budget,
      familySize
    ),
    network: calculateNetworkScore(
      params.clientInfo.city,
      params.clientInfo.state,
      params.planDocuments
    ),
    preferences: calculatePreferencesScore(
      params.clientInfo.preferences,
      params.planDocuments
    )
  }

  return calculateCompatibilityScore(
    scores.eligibility,
    scores.coverage,
    scores.budget,
    scores.network,
    scores.preferences
  )
}

/**
 * Ordena planos por score de compatibilidade
 */
export function rankPlansByCompatibility(
  plans: PlanCompatibilityAnalysis[]
): PlanCompatibilityAnalysis[] {
  return [...plans].sort((a, b) => {
    // Primeiro por score overall
    if (b.score.overall !== a.score.overall) {
      return b.score.overall - a.score.overall
    }

    // Empate: desempata por cobertura
    if (b.coverage.overallAdequacy !== a.coverage.overallAdequacy) {
      return b.coverage.overallAdequacy - a.coverage.overallAdequacy
    }

    // Empate: desempata por confiança
    return b.confidence - a.confidence
  })
}

/**
 * Identifica opção budget e premium do ranking
 */
export function identifyBudgetAndPremium(plans: PlanCompatibilityAnalysis[]): {
  budget: PlanCompatibilityAnalysis | null
  premium: PlanCompatibilityAnalysis | null
} {
  if (plans.length === 0) {
    return { budget: null, premium: null }
  }

  // Budget: maior score com score.breakdown.budget >= 80
  const budgetOptions = plans.filter(p => p.score.breakdown.budget >= 80)
  const budget = budgetOptions.length > 0 ? budgetOptions[0] : null

  // Premium: maior score com score.breakdown.coverage >= 90
  const premiumOptions = plans.filter(p => p.score.breakdown.coverage >= 90)
  const premium = premiumOptions.length > 0 ? premiumOptions[0] : null

  return { budget, premium }
}

/**
 * Categoriza alertas de todos os planos por urgência e tipo
 *
 * @param plans - Planos analisados com alertas
 * @returns Alertas categorizados por urgência e tipo
 */
export function categorizeAlerts(
  plans: PlanCompatibilityAnalysis[]
): CategorizedAlert[] {
  const categorized: CategorizedAlert[] = []

  // Mapear tipo de alerta para categoria legível
  const typeToCategory: Record<string, string> = {
    carencia: "Carência",
    exclusao: "Exclusão",
    limitacao: "Limitação",
    restricao_regional: "Restrição Regional",
    idade: "Restrição de Idade",
    pre_existente: "Pré-Existente"
  }

  for (const plan of plans) {
    if (!plan.alerts || plan.alerts.length === 0) {
      continue
    }

    for (const alert of plan.alerts) {
      // Determinar urgência baseada em severity e impactScore
      let urgency: AlertUrgency = "informativo"

      if (alert.severity === "high" || alert.impactScore >= 8) {
        urgency = "critico"
      } else if (alert.severity === "medium" || alert.impactScore >= 5) {
        urgency = "importante"
      }

      // Aumentar urgência se afetar condições pré-existentes
      if (
        alert.affectedConditions &&
        alert.affectedConditions.length > 0 &&
        urgency === "importante"
      ) {
        urgency = "critico"
      }

      categorized.push({
        planId: plan.planId,
        planName: plan.planName,
        alert,
        urgency,
        category: typeToCategory[alert.type] || "Outro"
      })
    }
  }

  return categorized
}

/**
 * Gera badges para cada plano baseado em suas características
 *
 * @param plans - Planos analisados (já ordenados por score)
 * @returns Mapa de planId para badges atribuídos
 */
export function generateBadges(plans: PlanCompatibilityAnalysis[]): {
  [planId: string]: PlanBadge[]
} {
  const badges: { [planId: string]: PlanBadge[] } = {}

  if (plans.length === 0) {
    return badges
  }

  // Inicializar badges vazios para todos os planos
  for (const plan of plans) {
    badges[plan.planId] = []
  }

  // 1. Recomendado: maior score overall
  const topPlan = plans[0]
  badges[topPlan.planId].push("recomendado")

  // 2. Mais completo: maior score de cobertura
  const mostComplete = [...plans].sort(
    (a, b) => b.score.breakdown.coverage - a.score.breakdown.coverage
  )[0]
  if (mostComplete && !badges[mostComplete.planId].includes("mais-completo")) {
    badges[mostComplete.planId].push("mais-completo")
  }

  // 3. Mais acessível e melhor custo-benefício: apenas se houver preços
  // Nota: Atualmente planPrice é sempre null (aguardando Task #8)
  // Quando Task #8 for implementado, descomentar este bloco:
  /*
  const plansWithPrice = plans.filter(p => p.planPrice && p.planPrice > 0)

  if (plansWithPrice.length > 0) {
    // Mais acessível: menor preço
    const cheapest = [...plansWithPrice].sort((a, b) =>
      (a.planPrice || 0) - (b.planPrice || 0)
    )[0]
    if (cheapest && !badges[cheapest.planId].includes("mais-acessivel")) {
      badges[cheapest.planId].push("mais-acessivel")
    }

    // Melhor custo-benefício: melhor relação score/preço
    const bestValue = [...plansWithPrice].sort((a, b) => {
      const ratioA = a.score.overall / (a.planPrice || 1)
      const ratioB = b.score.overall / (b.planPrice || 1)
      return ratioB - ratioA
    })[0]
    if (bestValue && !badges[bestValue.planId].includes("melhor-custo-beneficio")) {
      badges[bestValue.planId].push("melhor-custo-beneficio")
    }
  }
  */

  return badges
}

/**
 * Gera sumário executivo do ranking
 *
 * @param rankedPlans - Planos ordenados por score
 * @param criticalAlerts - Alertas categorizados
 * @returns Sumário executivo com top 3 e estatísticas
 */
export function generateExecutiveSummary(
  rankedPlans: PlanCompatibilityAnalysis[],
  criticalAlerts: CategorizedAlert[]
): ExecutiveSummary {
  if (rankedPlans.length === 0) {
    return {
      topPlan: {
        name: "Nenhum plano encontrado",
        score: 0,
        mainReason: "Nenhum plano foi analisado"
      },
      alternatives: [],
      criticalAlerts: 0,
      averageScore: 0
    }
  }

  const top = rankedPlans[0]

  // Extrair principal razão do top plan (primeiro pro ou reasoning resumido)
  let mainReason = top.reasoning
  if (top.pros.length > 0) {
    mainReason = top.pros[0]
  }
  // Limitar tamanho da razão principal
  if (mainReason.length > 120) {
    mainReason = mainReason.substring(0, 117) + "..."
  }

  // Top 2-3 alternativas
  const alternatives = rankedPlans.slice(1, 4).map(plan => {
    // Encontrar principal diferenciador
    let differentiator = ""

    // Verificar qual dimensão do score é mais forte
    const breakdown = plan.score.breakdown
    if (breakdown.coverage >= 85) {
      differentiator = "Excelente cobertura"
    } else if (breakdown.budget >= 85) {
      differentiator = "Ótimo custo-benefício"
    } else if (breakdown.eligibility >= 90) {
      differentiator = "Alta elegibilidade"
    } else if (breakdown.network >= 80) {
      differentiator = "Ampla rede credenciada"
    } else if (plan.pros.length > 0) {
      differentiator = plan.pros[0]
      if (differentiator.length > 60) {
        differentiator = differentiator.substring(0, 57) + "..."
      }
    } else {
      differentiator = `Score ${plan.score.overall}/100`
    }

    return {
      name: plan.planName,
      score: plan.score.overall,
      differentiator
    }
  })

  // Contar alertas críticos
  const criticalCount = criticalAlerts.filter(
    a => a.urgency === "critico"
  ).length

  // Calcular score médio
  const averageScore = Math.round(
    rankedPlans.reduce((sum, p) => sum + p.score.overall, 0) /
      rankedPlans.length
  )

  return {
    topPlan: {
      name: top.planName,
      score: top.score.overall,
      mainReason
    },
    alternatives,
    criticalAlerts: criticalCount,
    averageScore
  }
}

/**
 * Gera ranking completo com alertas categorizados, badges e sumário executivo
 * Esta é a função principal que orquestra toda a geração do ranking
 *
 * @param plans - Planos já analisados individualmente
 * @param clientInfo - Informações do cliente
 * @param executionTimeMs - Tempo total de execução
 * @param model - Modelo usado na análise (opcional)
 * @returns RankedAnalysis completo com todas as agregações
 */
export function generateRanking(
  plans: PlanCompatibilityAnalysis[],
  clientInfo: ClientInfo,
  executionTimeMs: number,
  model?: string
): RankedAnalysis {
  const modelUsed = model || DEFAULT_ANALYSIS_MODEL
  // 1. Ordenar planos por score de compatibilidade
  const rankedPlans = rankPlansByCompatibility(plans)

  // 2. Categorizar alertas
  const categorizedAlerts = categorizeAlerts(rankedPlans)

  // 3. Gerar badges
  const badges = generateBadges(rankedPlans)

  // 4. Gerar sumário executivo
  const executiveSummary = generateExecutiveSummary(
    rankedPlans,
    categorizedAlerts
  )

  // 5. Identificar opções budget e premium
  const { budget, premium } = identifyBudgetAndPremium(rankedPlans)

  // 6. Organizar alertas por urgência
  const alertsByUrgency = {
    critico: categorizedAlerts.filter(a => a.urgency === "critico"),
    importante: categorizedAlerts.filter(a => a.urgency === "importante"),
    informativo: categorizedAlerts.filter(a => a.urgency === "informativo")
  }

  // 7. Organizar alertas por plano
  const alertsByPlan: { [planId: string]: CategorizedAlert[] } = {}
  for (const alert of categorizedAlerts) {
    if (!alertsByPlan[alert.planId]) {
      alertsByPlan[alert.planId] = []
    }
    alertsByPlan[alert.planId].push(alert)
  }

  // 8. Retornar análise completa
  return {
    clientProfile: clientInfo,
    rankedPlans,
    recommended: {
      main: rankedPlans[0],
      alternatives: rankedPlans.slice(1, 4)
    },
    badges,
    criticalAlerts: {
      all: categorizedAlerts,
      byUrgency: alertsByUrgency,
      byPlan: alertsByPlan
    },
    executiveSummary,
    budget,
    premium,
    executionTimeMs,
    metadata: {
      totalPlansAnalyzed: rankedPlans.length,
      analysisVersion: "1.0.0",
      modelUsed
    }
  }
}

/**
 * Valida parâmetros de análise
 */
export function validateAnalysisParams(params: AnalyzeCompatibilityParams): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!params.clientInfo) {
    errors.push("clientInfo é obrigatório")
  }

  if (!params.plans || !Array.isArray(params.plans)) {
    errors.push("plans deve ser um array")
  } else if (params.plans.length === 0) {
    errors.push("plans não pode estar vazio")
  } else if (params.plans.length > LIMITS.MAX_PLANS_PER_ANALYSIS) {
    errors.push(`Máximo de ${LIMITS.MAX_PLANS_PER_ANALYSIS} planos por análise`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// =============================================================================
// MAIN FUNCTIONS (To be implemented in subsequent subtasks)
// =============================================================================

/**
 * Analisa elegibilidade do cliente para um plano
 * @implements Subtask 7.3
 */
export async function analyzeEligibility(
  clientInfo: ClientInfo,
  planDocuments: HealthPlanSearchResult[],
  openaiClient: OpenAI,
  model?: string
): Promise<EligibilityAnalysis> {
  const modelToUse = model || DEFAULT_ANALYSIS_MODEL
  const { createEligibilityAnalysisPrompt } = await import(
    "./prompts/compatibility-prompts"
  )
  const { EligibilityAnalysisResponseSchema } = await import(
    "./schemas/compatibility-schemas"
  )

  // Combina os documentos em texto único
  const combinedDocuments = planDocuments
    .map((doc, i) => `[Documento ${i + 1}]\n${doc.content}`)
    .join("\n\n")

  // Gera o prompt
  const prompt = createEligibilityAnalysisPrompt(clientInfo, combinedDocuments)

  try {
    // Chama modelo com response_format: json_object
    const completion = await openaiClient.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em análise de planos de saúde. Retorne sempre JSON válido conforme solicitado."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      ...getModelParams(modelToUse, { temperature: 0.2, maxTokens: 2000 }),
      response_format: { type: "json_object" }
    })

    const responseText = completion.choices[0]?.message?.content
    if (!responseText) {
      throw new Error("Resposta vazia do GPT-4o")
    }

    // Parse e valida JSON
    const responseJson = JSON.parse(responseText)
    const validated = EligibilityAnalysisResponseSchema.parse(responseJson)

    // Converte para o formato esperado
    return {
      isEligible: validated.isEligible,
      confidence: validated.confidence,
      reasons: validated.reasons,
      blockers: validated.blockers || undefined,
      warnings: validated.warnings || undefined
    }
  } catch (error) {
    console.error("Erro na análise de elegibilidade:", error)

    // Fallback em caso de erro
    return {
      isEligible: true, // Assumimos elegível por padrão
      confidence: 50, // Baixa confiança
      reasons: [
        "Análise automática indisponível. Verifique os documentos do plano manualmente."
      ],
      warnings: [
        "Não foi possível analisar completamente os critérios de elegibilidade."
      ]
    }
  }
}

/**
 * Avalia coberturas do plano para o perfil do cliente
 * @implements Subtask 7.4
 */
export async function evaluateCoverages(
  clientInfo: ClientInfo,
  planDocuments: HealthPlanSearchResult[],
  openaiClient: OpenAI,
  model?: string
): Promise<CoverageEvaluation> {
  const modelToUse = model || DEFAULT_ANALYSIS_MODEL
  const { createCoverageEvaluationPrompt } = await import(
    "./prompts/compatibility-prompts"
  )
  const { CoverageEvaluationResponseSchema } = await import(
    "./schemas/compatibility-schemas"
  )

  const combinedDocuments = planDocuments
    .map((doc, i) => `[Documento ${i + 1}]\n${doc.content}`)
    .join("\n\n")

  const prompt = createCoverageEvaluationPrompt(clientInfo, combinedDocuments)

  try {
    const completion = await openaiClient.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em análise de coberturas de planos de saúde. Retorne sempre JSON válido conforme solicitado."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      ...getModelParams(modelToUse, { temperature: 0.2, maxTokens: 3000 }),
      response_format: { type: "json_object" }
    })

    const responseText = completion.choices[0]?.message?.content
    if (!responseText) {
      throw new Error("Resposta vazia do modelo")
    }

    const responseJson = JSON.parse(responseText)
    const validated = CoverageEvaluationResponseSchema.parse(responseJson)

    return {
      overallAdequacy: validated.overallAdequacy,
      conditionsCoverage: validated.conditionsCoverage.map(c => ({
        condition: c.condition,
        isCovered: c.isCovered,
        coverageLevel: c.coverageLevel,
        details: c.details,
        relevantClauses: c.relevantClauses || undefined,
        waitingPeriod: c.waitingPeriod || undefined
      })),
      generalCoverageHighlights: validated.generalCoverageHighlights,
      missingCriticalCoverages: validated.missingCriticalCoverages || undefined
    }
  } catch (error) {
    console.error("Erro na avaliação de coberturas:", error)

    // Fallback
    return {
      overallAdequacy: 50,
      conditionsCoverage:
        clientInfo.preExistingConditions?.map(condition => ({
          condition,
          isCovered: true,
          coverageLevel: "unclear" as const,
          details:
            "Não foi possível avaliar a cobertura automaticamente. Consulte os documentos do plano."
        })) || [],
      generalCoverageHighlights: [
        "Análise automática indisponível. Verifique os documentos do plano."
      ]
    }
  }
}

/**
 * Detecta exclusões e limitações importantes
 * @implements Subtask 7.5
 */
export async function detectExclusionsAndLimitations(
  clientInfo: ClientInfo,
  planDocuments: HealthPlanSearchResult[],
  openaiClient: OpenAI,
  model?: string
): Promise<ExclusionAlert[]> {
  const modelToUse = model || DEFAULT_ANALYSIS_MODEL
  const { createExclusionsDetectionPrompt } = await import(
    "./prompts/compatibility-prompts"
  )
  const { ExclusionAlertsResponseSchema } = await import(
    "./schemas/compatibility-schemas"
  )

  const combinedDocuments = planDocuments
    .map((doc, i) => `[Documento ${i + 1}]\n${doc.content}`)
    .join("\n\n")

  const prompt = createExclusionsDetectionPrompt(clientInfo, combinedDocuments)

  try {
    const completion = await openaiClient.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em análise de contratos de planos de saúde. Retorne sempre JSON válido conforme solicitado."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      ...getModelParams(modelToUse, { temperature: 0.2, maxTokens: 2500 }),
      response_format: { type: "json_object" }
    })

    const responseText = completion.choices[0]?.message?.content
    if (!responseText) {
      return [] // Nenhum alerta
    }

    // O GPT-4o pode retornar {"alerts": [...]} ou diretamente [...]
    let responseJson = JSON.parse(responseText)

    // Se retornou objeto com chave "alerts", extrai o array
    if (responseJson.alerts && Array.isArray(responseJson.alerts)) {
      responseJson = responseJson.alerts
    }

    // Se não é array, tenta converter
    if (!Array.isArray(responseJson)) {
      return []
    }

    const validated = ExclusionAlertsResponseSchema.parse(responseJson)

    return validated.map(alert => ({
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      affectedConditions: alert.affectedConditions || undefined,
      impactScore: alert.impactScore
    }))
  } catch (error) {
    console.error("Erro na detecção de exclusões:", error)
    return [] // Retorna vazio em caso de erro
  }
}

/**
 * Gera justificativa detalhada para o score
 * @implements Subtask 7.7
 */
export async function generateDetailedReasoning(
  clientInfo: ClientInfo,
  analysis: Omit<PlanCompatibilityAnalysis, "reasoning">,
  openaiClient: OpenAI,
  model?: string
): Promise<string> {
  const modelToUse = model || DEFAULT_ANALYSIS_MODEL
  const { createDetailedReasoningPrompt } = await import(
    "./prompts/compatibility-prompts"
  )

  const alertDescriptions = analysis.alerts.map(a => a.description)

  const prompt = createDetailedReasoningPrompt(
    clientInfo,
    analysis.planName,
    analysis.score.overall,
    analysis.pros,
    analysis.cons,
    alertDescriptions
  )

  try {
    const completion = await openaiClient.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em planos de saúde. Escreva justificativas empáticas e humanizadas."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      ...getModelParams(modelToUse, { temperature: 0.5, maxTokens: 500 })
    })

    const reasoning = completion.choices[0]?.message?.content?.trim()

    if (!reasoning) {
      throw new Error("Resposta vazia do GPT-4o")
    }

    return reasoning
  } catch (error) {
    console.error("Erro na geração de justificativa:", error)

    // Fallback genérico
    return `Este plano alcançou ${analysis.score.overall}/100 de compatibilidade com seu perfil. ${
      analysis.score.overall >= 70
        ? "Apresenta boa adequação às suas necessidades."
        : "Há algumas limitações importantes a considerar."
    } Recomendamos avaliar os detalhes da cobertura antes de tomar uma decisão.`
  }
}

/**
 * Analisa compatibilidade de um único plano
 * Função auxiliar para o processamento em lote
 */
async function analyzeSinglePlan(
  plan: HealthPlanDocument,
  clientInfo: ClientInfo,
  openaiClient: OpenAI,
  options?: {
    detailedReasoning?: boolean
    timeoutMs?: number
    model?: string
  }
): Promise<PlanCompatibilityAnalysis> {
  const modelToUse = options?.model || DEFAULT_ANALYSIS_MODEL
  const startTime = Date.now()

  try {
    // 1. Análise de elegibilidade
    const eligibility = await analyzeEligibility(
      clientInfo,
      plan.documents,
      openaiClient,
      modelToUse
    )

    // 2. Avaliação de coberturas
    const coverage = await evaluateCoverages(
      clientInfo,
      plan.documents,
      openaiClient,
      modelToUse
    )

    // 3. Detecção de exclusões
    const alerts = await detectExclusionsAndLimitations(
      clientInfo,
      plan.documents,
      openaiClient,
      modelToUse
    )

    // 4. Cálculo de scores
    const score = calculateAllScores({
      eligibility,
      coverage,
      planPrice: null, // Será preenchido pela integração com ERP (Task #8)
      clientInfo,
      planDocuments: plan.documents
    })

    // 5. Gerar prós e contras
    const pros: string[] = []
    const cons: string[] = []

    // Prós baseados nos scores
    if (score.breakdown.eligibility >= 80) {
      pros.push("Sem restrições de elegibilidade")
    }
    if (score.breakdown.coverage >= 80) {
      pros.push("Excelente cobertura para seu perfil")
    }
    if (score.breakdown.budget >= 70) {
      pros.push("Bom custo-benefício")
    }
    if (score.breakdown.network >= 80) {
      pros.push("Boa disponibilidade na sua região")
    }

    // Contras baseados em scores baixos e alertas
    if (score.breakdown.eligibility < 50) {
      cons.push("Possíveis restrições de elegibilidade")
    }
    if (score.breakdown.coverage < 60) {
      cons.push("Cobertura limitada para seu perfil")
    }
    if (alerts.some(a => a.severity === "high")) {
      cons.push("Contém exclusões ou limitações importantes")
    }
    if (
      coverage.missingCriticalCoverages &&
      coverage.missingCriticalCoverages.length > 0
    ) {
      cons.push(`Não cobre: ${coverage.missingCriticalCoverages.join(", ")}`)
    }

    // Adiciona highlights de cobertura como prós
    coverage.generalCoverageHighlights.slice(0, 2).forEach(highlight => {
      if (!pros.includes(highlight)) {
        pros.push(highlight)
      }
    })

    // 6. Calcular confiança
    const confidence = Math.round(
      (eligibility.confidence + (coverage.overallAdequacy > 0 ? 80 : 50)) / 2
    )

    // 7. Criar análise preliminar
    const preliminaryAnalysis: Omit<PlanCompatibilityAnalysis, "reasoning"> = {
      planId: plan.planId,
      planName: plan.planName,
      operadora: plan.operadora,
      collectionId: plan.collectionId,
      collectionName: plan.collectionName,
      eligibility,
      coverage,
      score,
      pros,
      cons,
      alerts,
      analyzedAt: new Date().toISOString(),
      confidence
    }

    // 8. Gerar justificativa detalhada (se solicitado)
    let reasoning: string
    if (options?.detailedReasoning) {
      reasoning = await generateDetailedReasoning(
        clientInfo,
        preliminaryAnalysis,
        openaiClient,
        modelToUse
      )
    } else {
      // Justificativa simples
      reasoning = `Score de ${score.overall}/100. ${
        score.overall >= 70
          ? "Boa opção para seu perfil."
          : "Avalie os detalhes antes de decidir."
      }`
    }

    return {
      ...preliminaryAnalysis,
      reasoning
    }
  } catch (error) {
    console.error(`Erro ao analisar plano ${plan.planId}:`, error)

    // Retorna análise com erro
    return {
      planId: plan.planId,
      planName: plan.planName,
      operadora: plan.operadora,
      collectionId: plan.collectionId,
      collectionName: plan.collectionName,
      eligibility: {
        isEligible: true,
        confidence: 0,
        reasons: ["Erro na análise automática"],
        warnings: ["Não foi possível analisar este plano completamente"]
      },
      coverage: {
        overallAdequacy: 0,
        conditionsCoverage: [],
        generalCoverageHighlights: ["Análise indisponível"]
      },
      score: calculateCompatibilityScore(0, 0, 0, 0, 0),
      pros: [],
      cons: ["Análise automática falhou"],
      alerts: [],
      reasoning:
        "Não foi possível analisar este plano. Consulte os documentos manualmente.",
      analyzedAt: new Date().toISOString(),
      confidence: 0
    }
  }
}

/**
 * Analisa compatibilidade de múltiplos planos em lote
 * @implements Subtask 7.6
 */
export async function analyzePlansBatch(
  params: AnalyzeCompatibilityParams,
  openaiClient: OpenAI,
  model?: string
): Promise<RankedAnalysis> {
  const modelToUse = model || DEFAULT_ANALYSIS_MODEL
  const startTime = Date.now()

  // Limita concorrência para não sobrecarregar a API
  const maxConcurrency = Math.min(
    params.options?.maxConcurrency || LIMITS.MAX_CONCURRENT_ANALYSES,
    LIMITS.MAX_CONCURRENT_ANALYSES
  )

  const timeoutMs = params.options?.timeoutMs || LIMITS.DEFAULT_TIMEOUT_MS

  // Processa planos em lotes paralelos
  const analyzedPlans: PlanCompatibilityAnalysis[] = []

  for (let i = 0; i < params.plans.length; i += maxConcurrency) {
    const batch = params.plans.slice(i, i + maxConcurrency)

    // Analisa cada plano do lote em paralelo com timeout
    const batchPromises = batch.map(plan =>
      Promise.race([
        analyzeSinglePlan(plan, params.clientInfo, openaiClient, {
          detailedReasoning: params.options?.detailedReasoning ?? true,
          timeoutMs,
          model: modelToUse
        }),
        new Promise<PlanCompatibilityAnalysis>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout ao analisar ${plan.planName}`)),
            timeoutMs
          )
        )
      ]).catch(error => {
        console.error(`Erro no plano ${plan.planName}:`, error)
        // Retorna análise vazia em caso de timeout/erro
        return {
          planId: plan.planId,
          planName: plan.planName,
          operadora: plan.operadora,
          collectionId: plan.collectionId,
          collectionName: plan.collectionName,
          eligibility: {
            isEligible: true,
            confidence: 0,
            reasons: ["Timeout na análise"]
          },
          coverage: {
            overallAdequacy: 0,
            conditionsCoverage: [],
            generalCoverageHighlights: []
          },
          score: calculateCompatibilityScore(0, 0, 0, 0, 0),
          pros: [],
          cons: ["Análise não completada"],
          alerts: [],
          reasoning: "Tempo limite excedido na análise.",
          analyzedAt: new Date().toISOString(),
          confidence: 0
        } as PlanCompatibilityAnalysis
      })
    )

    const batchResults = await Promise.all(batchPromises)
    analyzedPlans.push(...batchResults)
  }

  // Remove planos com confiança zero (falharam)
  const validPlans = analyzedPlans.filter(p => p.confidence > 0)

  const executionTimeMs = Date.now() - startTime

  // Usa a função generateRanking para criar o ranking completo
  // com alertas categorizados, badges e sumário executivo
  return generateRanking(
    validPlans,
    params.clientInfo,
    executionTimeMs,
    modelToUse
  )
}

/**
 * Função principal de análise de compatibilidade
 * @implements Subtask 7.8 (ranking e alertas)
 */
export async function analyzeCompatibility(
  params: AnalyzeCompatibilityParams,
  openaiApiKey: string,
  model?: string
): Promise<RankedAnalysis> {
  const modelToUse = model || DEFAULT_ANALYSIS_MODEL
  const startTime = Date.now()

  console.log(
    "[analyze-compatibility] ========================================"
  )
  console.log("[analyze-compatibility] 📊 analyzeCompatibility called")
  console.log("[analyze-compatibility] 📋 Params:", {
    plansCount: params.plans?.length || 0,
    clientAge: params.clientInfo?.age,
    hasPreExistingConditions:
      !!params.clientInfo?.preExistingConditions?.length,
    topK: params.options?.topK || 5
  })

  // Validar parâmetros
  const validation = validateAnalysisParams(params)
  if (!validation.valid) {
    console.error(
      "[analyze-compatibility] ❌ Validation failed:",
      validation.errors
    )
    throw new Error(`Parâmetros inválidos: ${validation.errors.join(", ")}`)
  }

  console.log("[analyze-compatibility] ✅ Parameters validated")

  // Inicializar cliente OpenAI
  const openaiClient = new OpenAI({ apiKey: openaiApiKey })

  // Executar análise em lote
  console.log("[analyze-compatibility] 🔄 Starting batch analysis...")
  console.log("[analyze-compatibility] 🤖 Using model:", modelToUse)
  const result = await analyzePlansBatch(params, openaiClient, modelToUse)

  const executionTime = Date.now() - startTime
  console.log("[analyze-compatibility] ✅ Analysis complete:", {
    executionTimeMs: executionTime,
    rankedPlansCount: result.rankedPlans?.length || 0,
    topPlanScore: result.rankedPlans?.[0]?.score?.overall,
    topPlanName: result.rankedPlans?.[0]?.planName,
    alertsCount: result.criticalAlerts?.all?.length || 0
  })

  return result
}
