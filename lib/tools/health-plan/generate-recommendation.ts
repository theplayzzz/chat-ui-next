/**
 * Health Plan Recommendation Generator
 *
 * Gera recomendações humanizadas de planos de saúde usando GPT-4o
 *
 * Referência: PRD health-plan-agent-prd.md (RF-007)
 * Task Master: Task #9
 */

import OpenAI from "openai"
import type { ClientInfo } from "./schemas/client-info-schema"
import type {
  RankedAnalysis,
  PlanCompatibilityAnalysis,
  CategorizedAlert
} from "./analyze-compatibility"
import type { ERPPriceResult, PriceBreakdown } from "./types"
import {
  MainRecommendationResponseSchema,
  AlternativesResponseSchema,
  AlertsFormattedResponseSchema,
  NextStepsResponseSchema,
  IntroResponseSchema,
  type GenerateRecommendationResult
} from "./schemas/recommendation-schemas"
import {
  createIntroPrompt,
  createMainRecommendationPrompt,
  createAlternativesPrompt,
  createAlertsFormattingPrompt,
  createNextStepsPrompt,
  RECOMMENDATION_SYSTEM_PROMPT,
  ALERTS_SYSTEM_PROMPT
} from "./prompts/recommendation-prompts"
import {
  formatCurrency,
  formatBadge,
  getScoreIcon,
  getAlertIcon,
  truncateText,
  addAllTermExplanations,
  type RecommendationIntro,
  type MainRecommendation,
  type AlternativesSection,
  type ComparisonTable,
  type AlertsSection,
  type NextStepsSection,
  type FormattedAlert,
  renderIntroMarkdown,
  renderMainRecommendationMarkdown,
  renderAlternativesMarkdown,
  renderComparisonTableMarkdown,
  renderAlertsMarkdown,
  renderNextStepsMarkdown
} from "./templates/recommendation-template"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Parâmetros para geração de recomendação
 */
export interface GenerateRecommendationParams {
  rankedAnalysis: RankedAnalysis
  erpPrices?: ERPPriceResult
  options?: {
    includeAlternatives?: boolean
    includeAlerts?: boolean
    includeNextSteps?: boolean
    explainTechnicalTerms?: boolean
  }
}

/**
 * Configuração do modelo GPT
 */
const GPT_CONFIG = {
  model: "gpt-4o" as const,
  temperature: 0.1, // Baixa para consistência
  maxTokens: 1500
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Encontra preço de um plano nos resultados do ERP
 */
function findPlanPrice(
  planId: string,
  prices?: PriceBreakdown[]
): number | undefined {
  if (!prices || prices.length === 0) return undefined
  // Por simplicidade, retorna o primeiro preço total
  // Em implementação real, faria match pelo planId
  const price = prices.find((_, index) => index === 0)
  return price?.total
}

/**
 * Cria cliente OpenAI
 */
function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada")
  }
  return new OpenAI({ apiKey })
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Gera introdução empática
 * @implements Subtask 9.2 (parte)
 */
export async function generateIntro(
  clientInfo: ClientInfo,
  totalPlansAnalyzed: number,
  topScore: number,
  openai: OpenAI
): Promise<RecommendationIntro> {
  const prompt = createIntroPrompt(clientInfo, totalPlansAnalyzed, topScore)

  try {
    const completion = await openai.chat.completions.create({
      model: GPT_CONFIG.model,
      messages: [
        { role: "system", content: RECOMMENDATION_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: GPT_CONFIG.temperature,
      max_tokens: 500,
      response_format: { type: "json_object" }
    })

    const responseText = completion.choices[0]?.message?.content
    if (!responseText) throw new Error("Resposta vazia")

    const parsed = IntroResponseSchema.parse(JSON.parse(responseText))

    return {
      greeting: parsed.greeting,
      clientSummary: parsed.clientSummary,
      analysisHighlight: parsed.analysisHighlight
    }
  } catch (error) {
    console.error("Erro ao gerar introdução:", error)

    // Fallback
    return {
      greeting: `Olá! Analisei cuidadosamente as opções de planos de saúde para você.`,
      clientSummary: `Com base no seu perfil de ${clientInfo.age} anos, em ${clientInfo.city}/${clientInfo.state}, com orçamento de ${formatCurrency(clientInfo.budget)}/mês, preparei uma recomendação personalizada.`,
      analysisHighlight: `Analisei ${totalPlansAnalyzed} planos e encontrei opções com até ${topScore}% de compatibilidade com seu perfil.`
    }
  }
}

/**
 * Gera recomendação principal com justificativa empática
 * @implements Subtask 9.2
 */
export async function generateMainRecommendation(
  clientInfo: ClientInfo,
  recommendedPlan: PlanCompatibilityAnalysis,
  monthlyPrice: number | undefined,
  openai: OpenAI
): Promise<MainRecommendation> {
  const prompt = createMainRecommendationPrompt(
    clientInfo,
    recommendedPlan,
    monthlyPrice
  )

  try {
    const completion = await openai.chat.completions.create({
      model: GPT_CONFIG.model,
      messages: [
        { role: "system", content: RECOMMENDATION_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: GPT_CONFIG.temperature,
      max_tokens: GPT_CONFIG.maxTokens,
      response_format: { type: "json_object" }
    })

    const responseText = completion.choices[0]?.message?.content
    if (!responseText) throw new Error("Resposta vazia")

    const parsed = MainRecommendationResponseSchema.parse(
      JSON.parse(responseText)
    )

    // Adiciona explicações de termos técnicos se necessário
    let justification = parsed.justification
    if (parsed.technicalTermsExplained) {
      justification = addAllTermExplanations(justification)
    }

    return {
      planName: parsed.planName,
      operadora: parsed.operadora,
      score: recommendedPlan.score.overall,
      monthlyPrice,
      justification,
      keyBenefits: parsed.keyBenefits,
      personalizedNote: parsed.personalizedNote
    }
  } catch (error) {
    console.error("Erro ao gerar recomendação principal:", error)

    // Fallback
    return {
      planName: recommendedPlan.planName,
      operadora: recommendedPlan.operadora,
      score: recommendedPlan.score.overall,
      monthlyPrice,
      justification:
        recommendedPlan.reasoning ||
        `Este plano alcançou ${recommendedPlan.score.overall}/100 de compatibilidade com seu perfil, apresentando a melhor combinação de cobertura, preço e rede credenciada.`,
      keyBenefits:
        recommendedPlan.pros.length > 0
          ? recommendedPlan.pros.slice(0, 4)
          : ["Boa compatibilidade com seu perfil"],
      personalizedNote:
        "Recomendamos avaliar os detalhes da cobertura antes de tomar sua decisão."
    }
  }
}

/**
 * Gera alternativas econômica e premium
 * @implements Subtask 9.3
 */
export async function generateAlternatives(
  clientInfo: ClientInfo,
  recommendedPlan: PlanCompatibilityAnalysis,
  budgetPlan: PlanCompatibilityAnalysis | null,
  premiumPlan: PlanCompatibilityAnalysis | null,
  prices?: {
    recommended?: number
    budget?: number
    premium?: number
  },
  openai?: OpenAI
): Promise<AlternativesSection> {
  // Verifica se há alternativas diferentes do recomendado
  const hasBudget = budgetPlan && budgetPlan.planId !== recommendedPlan.planId
  const hasPremium =
    premiumPlan && premiumPlan.planId !== recommendedPlan.planId

  if (!hasBudget && !hasPremium) {
    return {
      hasAlternatives: false,
      noAlternativesReason:
        "O plano recomendado é a melhor opção tanto em custo-benefício quanto em cobertura para seu perfil."
    }
  }

  // Se não temos OpenAI client, gera fallback
  if (!openai) {
    return generateAlternativesFallback(
      recommendedPlan,
      budgetPlan,
      premiumPlan,
      prices
    )
  }

  const prompt = createAlternativesPrompt(
    clientInfo,
    recommendedPlan,
    budgetPlan,
    premiumPlan,
    prices?.recommended,
    prices?.budget,
    prices?.premium
  )

  try {
    const completion = await openai.chat.completions.create({
      model: GPT_CONFIG.model,
      messages: [
        { role: "system", content: RECOMMENDATION_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: GPT_CONFIG.temperature,
      max_tokens: GPT_CONFIG.maxTokens,
      response_format: { type: "json_object" }
    })

    const responseText = completion.choices[0]?.message?.content
    if (!responseText) throw new Error("Resposta vazia")

    const parsed = AlternativesResponseSchema.parse(JSON.parse(responseText))

    const result: AlternativesSection = {
      hasAlternatives:
        parsed.hasBudgetAlternative || parsed.hasPremiumAlternative
    }

    if (parsed.budget && budgetPlan) {
      const savingsVsRecommended =
        prices?.recommended && prices?.budget
          ? prices.recommended - prices.budget
          : undefined

      result.budget = {
        planName: budgetPlan.planName,
        monthlyPrice: prices?.budget,
        score: budgetPlan.score.overall,
        savingsVsRecommended,
        tradeoffs: parsed.budget.tradeoffs,
        bestFor: parsed.budget.bestFor
      }
    }

    if (parsed.premium && premiumPlan) {
      const extraCostVsRecommended =
        prices?.recommended && prices?.premium
          ? prices.premium - prices.recommended
          : undefined

      result.premium = {
        planName: premiumPlan.planName,
        monthlyPrice: prices?.premium,
        score: premiumPlan.score.overall,
        extraCostVsRecommended,
        extraBenefits: parsed.premium.extraBenefits,
        bestFor: parsed.premium.bestFor
      }
    }

    if (!result.hasAlternatives && parsed.noAlternativesReason) {
      result.noAlternativesReason = parsed.noAlternativesReason
    }

    return result
  } catch (error) {
    console.error("Erro ao gerar alternativas:", error)
    return generateAlternativesFallback(
      recommendedPlan,
      budgetPlan,
      premiumPlan,
      prices
    )
  }
}

/**
 * Fallback para alternativas sem GPT
 */
function generateAlternativesFallback(
  recommendedPlan: PlanCompatibilityAnalysis,
  budgetPlan: PlanCompatibilityAnalysis | null,
  premiumPlan: PlanCompatibilityAnalysis | null,
  prices?: {
    recommended?: number
    budget?: number
    premium?: number
  }
): AlternativesSection {
  const result: AlternativesSection = {
    hasAlternatives: false
  }

  if (budgetPlan && budgetPlan.planId !== recommendedPlan.planId) {
    result.hasAlternatives = true
    result.budget = {
      planName: budgetPlan.planName,
      monthlyPrice: prices?.budget,
      score: budgetPlan.score.overall,
      savingsVsRecommended:
        prices?.recommended && prices?.budget
          ? prices.recommended - prices.budget
          : undefined,
      tradeoffs:
        budgetPlan.cons.length > 0
          ? budgetPlan.cons.slice(0, 3)
          : ["Pode ter cobertura mais limitada"],
      bestFor: "Quem prioriza economia no orçamento mensal"
    }
  }

  if (premiumPlan && premiumPlan.planId !== recommendedPlan.planId) {
    result.hasAlternatives = true
    result.premium = {
      planName: premiumPlan.planName,
      monthlyPrice: prices?.premium,
      score: premiumPlan.score.overall,
      extraCostVsRecommended:
        prices?.recommended && prices?.premium
          ? prices.premium - prices.recommended
          : undefined,
      extraBenefits:
        premiumPlan.pros.length > 0
          ? premiumPlan.pros.slice(0, 4)
          : ["Cobertura mais ampla"],
      bestFor: "Quem busca máxima cobertura e tranquilidade"
    }
  }

  if (!result.hasAlternatives) {
    result.noAlternativesReason =
      "O plano recomendado já é a melhor opção em todas as categorias."
  }

  return result
}

/**
 * Gera tabela comparativa dos top 3 planos
 * @implements Subtask 9.4
 */
export function generateComparisonTable(
  rankedPlans: PlanCompatibilityAnalysis[],
  badges: { [planId: string]: string[] },
  prices?: PriceBreakdown[]
): ComparisonTable {
  const top3 = rankedPlans.slice(0, 3)

  if (top3.length === 0) {
    return { rows: [] }
  }

  const rows = top3.map((plan, index) => {
    // Determina badge principal
    const planBadges = badges[plan.planId] || []
    let badgeText = ""
    if (planBadges.includes("recomendado")) {
      badgeText = "⭐"
    } else if (planBadges.includes("melhor-custo-beneficio")) {
      badgeText = "🏆"
    } else if (planBadges.includes("mais-completo")) {
      badgeText = "💎"
    } else if (planBadges.includes("mais-acessivel")) {
      badgeText = "💰"
    } else {
      badgeText = `#${index + 1}`
    }

    // Encontra preço (se disponível)
    const price = prices?.[index]?.total

    // Determina highlight principal
    let highlight = ""
    if (plan.pros.length > 0) {
      highlight = plan.pros[0]
    } else if (plan.score.breakdown.coverage >= 85) {
      highlight = "Excelente cobertura"
    } else if (plan.score.breakdown.budget >= 85) {
      highlight = "Ótimo custo-benefício"
    } else {
      highlight = `Score ${plan.score.overall}/100`
    }

    return {
      planName: plan.planName,
      badge: badgeText,
      score: plan.score.overall,
      monthlyPrice: price,
      coverageScore: plan.score.breakdown.coverage,
      networkScore: plan.score.breakdown.network,
      highlight: truncateText(highlight, 30)
    }
  })

  const footnotes: string[] = []
  if (!prices || prices.length === 0) {
    footnotes.push("Preços sujeitos a confirmação com a operadora")
  }

  return { rows, footnotes }
}

/**
 * Gera seção de alertas formatados
 * @implements Subtask 9.5
 */
export async function generateAlertsSection(
  clientInfo: ClientInfo,
  alerts: CategorizedAlert[],
  recommendedPlanName: string,
  openai?: OpenAI
): Promise<AlertsSection> {
  if (alerts.length === 0) {
    return {
      hasCriticalAlerts: false,
      critical: [],
      important: [],
      informative: []
    }
  }

  // Se não temos OpenAI client, gera fallback
  if (!openai) {
    return generateAlertsFallback(alerts)
  }

  const prompt = createAlertsFormattingPrompt(
    clientInfo,
    alerts,
    recommendedPlanName
  )

  try {
    const completion = await openai.chat.completions.create({
      model: GPT_CONFIG.model,
      messages: [
        { role: "system", content: ALERTS_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: GPT_CONFIG.temperature,
      max_tokens: GPT_CONFIG.maxTokens,
      response_format: { type: "json_object" }
    })

    const responseText = completion.choices[0]?.message?.content
    if (!responseText) throw new Error("Resposta vazia")

    const parsed = AlertsFormattedResponseSchema.parse(JSON.parse(responseText))

    const critical: FormattedAlert[] = []
    const important: FormattedAlert[] = []
    const informative: FormattedAlert[] = []

    for (const alert of parsed.alerts) {
      const formatted: FormattedAlert = {
        icon: getAlertIcon(alert.urgency),
        title: alert.title,
        description: alert.description,
        impact: alert.impact
      }

      switch (alert.urgency) {
        case "critico":
          critical.push(formatted)
          break
        case "importante":
          important.push(formatted)
          break
        default:
          informative.push(formatted)
      }
    }

    return {
      hasCriticalAlerts: parsed.hasCriticalAlerts,
      critical,
      important,
      informative,
      summary: parsed.summary
    }
  } catch (error) {
    console.error("Erro ao gerar alertas:", error)
    return generateAlertsFallback(alerts)
  }
}

/**
 * Fallback para alertas sem GPT
 */
function generateAlertsFallback(alerts: CategorizedAlert[]): AlertsSection {
  const critical: FormattedAlert[] = []
  const important: FormattedAlert[] = []
  const informative: FormattedAlert[] = []

  for (const alert of alerts) {
    const formatted: FormattedAlert = {
      icon: getAlertIcon(alert.urgency),
      title: alert.alert.title,
      description: alert.alert.description,
      impact: alert.alert.affectedConditions?.join(", ") || "Verificar detalhes"
    }

    switch (alert.urgency) {
      case "critico":
        critical.push(formatted)
        break
      case "importante":
        important.push(formatted)
        break
      default:
        informative.push(formatted)
    }
  }

  return {
    hasCriticalAlerts: critical.length > 0,
    critical,
    important,
    informative,
    summary:
      critical.length > 0
        ? `Atenção: ${critical.length} alerta(s) crítico(s) identificado(s).`
        : undefined
  }
}

/**
 * Gera seção de próximos passos
 * @implements Subtask 9.5
 */
export async function generateNextSteps(
  clientInfo: ClientInfo,
  recommendedPlanName: string,
  operadora?: string,
  openai?: OpenAI
): Promise<NextStepsSection> {
  // Se não temos OpenAI client, gera fallback
  if (!openai) {
    return generateNextStepsFallback(clientInfo)
  }

  const prompt = createNextStepsPrompt(
    clientInfo,
    recommendedPlanName,
    operadora
  )

  try {
    const completion = await openai.chat.completions.create({
      model: GPT_CONFIG.model,
      messages: [
        { role: "system", content: RECOMMENDATION_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: GPT_CONFIG.temperature,
      max_tokens: GPT_CONFIG.maxTokens,
      response_format: { type: "json_object" }
    })

    const responseText = completion.choices[0]?.message?.content
    if (!responseText) throw new Error("Resposta vazia")

    const parsed = NextStepsResponseSchema.parse(JSON.parse(responseText))

    return {
      steps: parsed.steps.map((s, idx) => ({
        step: s.step ?? idx + 1,
        action: s.action,
        description: s.description,
        timeline: s.timeline
      })),
      requiredDocuments: parsed.requiredDocuments,
      estimatedTimeline: parsed.estimatedTimeline,
      contactInfo: parsed.additionalNotes
    }
  } catch (error) {
    console.error("Erro ao gerar próximos passos:", error)
    return generateNextStepsFallback(clientInfo)
  }
}

/**
 * Fallback para próximos passos sem GPT
 */
function generateNextStepsFallback(clientInfo: ClientInfo): NextStepsSection {
  const hasDependents = (clientInfo.dependents?.length || 0) > 0
  const hasConditions = (clientInfo.preExistingConditions?.length || 0) > 0

  const steps = [
    {
      step: 1,
      action: "Revise a recomendação",
      description:
        "Analise os detalhes do plano recomendado e das alternativas apresentadas",
      timeline: "Imediato"
    },
    {
      step: 2,
      action: "Reúna os documentos",
      description:
        "Separe os documentos necessários para contratação listados abaixo",
      timeline: "1-2 dias"
    },
    {
      step: 3,
      action: "Entre em contato",
      description:
        "Fale com um corretor autorizado ou diretamente com a operadora",
      timeline: "2-3 dias"
    },
    {
      step: 4,
      action: "Faça a proposta",
      description:
        "Preencha a proposta de adesão e aguarde análise da operadora",
      timeline: "3-5 dias"
    },
    {
      step: 5,
      action: "Ativação do plano",
      description: "Após aprovação, receba seu cartão e comece a usar o plano",
      timeline: "5-10 dias úteis"
    }
  ]

  const requiredDocuments = [
    "RG ou CNH do titular",
    "CPF do titular",
    "Comprovante de residência recente"
  ]

  if (hasDependents) {
    requiredDocuments.push("Documentos dos dependentes (RG/Certidão)")
    requiredDocuments.push(
      "Comprovante de vínculo (certidão casamento/nascimento)"
    )
  }

  if (hasConditions) {
    requiredDocuments.push("Declaração de saúde preenchida")
    requiredDocuments.push(
      "Laudos médicos das condições declaradas (se houver)"
    )
  }

  return {
    steps,
    requiredDocuments,
    estimatedTimeline:
      "O processo completo geralmente leva de 7 a 15 dias úteis, desde a proposta até a ativação do plano.",
    contactInfo:
      "Em caso de dúvidas, entre em contato com nosso suporte ou consulte um corretor autorizado."
  }
}

// =============================================================================
// MAIN ORCHESTRATOR
// =============================================================================

/**
 * Gera recomendação completa
 * Orquestra todas as seções e retorna documento Markdown
 *
 * @implements Subtask 9.5 (função principal)
 */
export async function generateRecommendation(
  params: GenerateRecommendationParams
): Promise<GenerateRecommendationResult> {
  const startTime = Date.now()

  console.log(
    "[generate-recommendation] ========================================"
  )
  console.log("[generate-recommendation] ✨ generateRecommendation called")

  const {
    rankedAnalysis,
    erpPrices,
    options = {
      includeAlternatives: true,
      includeAlerts: true,
      includeNextSteps: true,
      explainTechnicalTerms: true
    }
  } = params

  console.log("[generate-recommendation] 📋 Params:", {
    rankedPlansCount: rankedAnalysis?.rankedPlans?.length || 0,
    hasERPPrices: !!erpPrices?.success,
    includeAlternatives: options.includeAlternatives,
    includeAlerts: options.includeAlerts,
    includeNextSteps: options.includeNextSteps
  })

  try {
    // Inicializa cliente OpenAI
    console.log("[generate-recommendation] 🔧 Creating OpenAI client...")
    const openai = createOpenAIClient()

    // Extrai dados principais
    const { clientProfile, rankedPlans, recommended, badges, criticalAlerts } =
      rankedAnalysis
    const recommendedPlan = recommended.main
    const budgetPlan = rankedAnalysis.budget
    const premiumPlan = rankedAnalysis.premium

    // Extrai preços se disponíveis
    const prices = erpPrices?.prices
    const recommendedPrice = prices?.[0]?.total
    const budgetPrice = prices?.[1]?.total
    const premiumPrice = prices?.[2]?.total

    // 1. Gera introdução
    const intro = await generateIntro(
      clientProfile,
      rankedAnalysis.metadata.totalPlansAnalyzed,
      recommendedPlan.score.overall,
      openai
    )

    // 2. Gera recomendação principal
    const mainRecommendation = await generateMainRecommendation(
      clientProfile,
      recommendedPlan,
      recommendedPrice,
      openai
    )

    // 3. Gera alternativas (se solicitado)
    let alternatives: AlternativesSection = { hasAlternatives: false }
    if (options.includeAlternatives) {
      alternatives = await generateAlternatives(
        clientProfile,
        recommendedPlan,
        budgetPlan,
        premiumPlan,
        {
          recommended: recommendedPrice,
          budget: budgetPrice,
          premium: premiumPrice
        },
        openai
      )
    }

    // 4. Gera tabela comparativa
    const comparisonTable = generateComparisonTable(rankedPlans, badges, prices)

    // 5. Gera alertas (se solicitado)
    let alerts: AlertsSection = {
      hasCriticalAlerts: false,
      critical: [],
      important: [],
      informative: []
    }
    if (options.includeAlerts) {
      // Filtra alertas do plano recomendado
      const recommendedAlerts =
        criticalAlerts.byPlan[recommendedPlan.planId] || []
      alerts = await generateAlertsSection(
        clientProfile,
        recommendedAlerts,
        recommendedPlan.planName,
        openai
      )
    }

    // 6. Gera próximos passos (se solicitado)
    let nextSteps: NextStepsSection = {
      steps: [],
      requiredDocuments: [],
      estimatedTimeline: ""
    }
    if (options.includeNextSteps) {
      nextSteps = await generateNextSteps(
        clientProfile,
        recommendedPlan.planName,
        recommendedPlan.operadora,
        openai
      )
    }

    // 7. Renderiza seções em Markdown
    const introMarkdown = renderIntroMarkdown(intro)
    const mainRecMarkdown = renderMainRecommendationMarkdown(mainRecommendation)
    const alternativesMarkdown = options.includeAlternatives
      ? renderAlternativesMarkdown(alternatives)
      : ""
    const tableMarkdown = renderComparisonTableMarkdown(comparisonTable)
    const alertsMarkdown = options.includeAlerts
      ? renderAlertsMarkdown(alerts)
      : ""
    const nextStepsMarkdown = options.includeNextSteps
      ? renderNextStepsMarkdown(nextSteps)
      : ""

    // 8. Monta documento completo
    const sections = [
      introMarkdown,
      mainRecMarkdown,
      alternativesMarkdown,
      tableMarkdown,
      alertsMarkdown,
      nextStepsMarkdown
    ].filter(s => s.length > 0)

    let fullMarkdown = sections.join("\n---\n\n")

    // Adiciona termos técnicos explicados se solicitado
    if (options.explainTechnicalTerms) {
      fullMarkdown = addAllTermExplanations(fullMarkdown)
    }

    // Footer
    const generatedAt = new Date().toISOString()
    fullMarkdown += `\n\n---\n\n*Análise gerada em ${new Date(generatedAt).toLocaleDateString("pt-BR")} | Versão 1.0.0*\n`

    const executionTimeMs = Date.now() - startTime

    console.log("[generate-recommendation] ✅ Recommendation generated:", {
      executionTimeMs,
      markdownLength: fullMarkdown.length,
      sectionsCount: sections.length,
      hasCriticalAlerts: alerts.hasCriticalAlerts
    })

    return {
      success: true,
      markdown: fullMarkdown,
      sections: {
        intro: introMarkdown,
        mainRecommendation: mainRecMarkdown,
        alternatives: alternativesMarkdown,
        comparisonTable: tableMarkdown,
        alerts: alertsMarkdown,
        nextSteps: nextStepsMarkdown
      },
      structuredAlerts: alerts,
      metadata: {
        generatedAt,
        version: "1.0.0",
        modelUsed: GPT_CONFIG.model,
        executionTimeMs
      }
    }
  } catch (error) {
    const executionTimeMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error("[generate-recommendation] ❌ Error:", error)

    return {
      success: false,
      markdown: "",
      sections: {
        intro: "",
        mainRecommendation: "",
        alternatives: "",
        comparisonTable: "",
        alerts: "",
        nextSteps: ""
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        version: "1.0.0",
        modelUsed: GPT_CONFIG.model,
        executionTimeMs
      },
      error: `Erro ao gerar recomendação: ${errorMessage}`
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Types re-export
  type RecommendationIntro,
  type MainRecommendation,
  type AlternativesSection,
  type ComparisonTable,
  type AlertsSection,
  type NextStepsSection,
  type GenerateRecommendationResult
}
