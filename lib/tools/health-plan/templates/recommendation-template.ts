/**
 * Template de Recomendação Humanizada
 *
 * Define estruturas e formatadores para recomendações de planos de saúde
 *
 * Referência: PRD health-plan-agent-prd.md (RF-007)
 * Task Master: Task #9.1
 */

// =============================================================================
// INTERFACES - Seções da Recomendação
// =============================================================================

/**
 * Introdução empática da recomendação
 */
export interface RecommendationIntro {
  greeting: string
  clientSummary: string
  analysisHighlight: string
}

/**
 * Recomendação principal com justificativa
 */
export interface MainRecommendation {
  planName: string
  operadora?: string
  score: number
  monthlyPrice?: number
  justification: string
  keyBenefits: string[]
  personalizedNote: string
}

/**
 * Seção de alternativas (econômica/premium)
 */
export interface AlternativesSection {
  hasAlternatives: boolean
  budget?: {
    planName: string
    monthlyPrice?: number
    score: number
    savingsVsRecommended?: number
    tradeoffs: string[]
    bestFor: string
  }
  premium?: {
    planName: string
    monthlyPrice?: number
    score: number
    extraCostVsRecommended?: number
    extraBenefits: string[]
    bestFor: string
  }
  noAlternativesReason?: string
}

/**
 * Linha da tabela comparativa
 */
export interface ComparisonTableRow {
  planName: string
  badge: string
  score: number
  monthlyPrice?: number
  coverageScore: number
  networkScore: number
  highlight: string
}

/**
 * Tabela comparativa top 3
 */
export interface ComparisonTable {
  rows: ComparisonTableRow[]
  footnotes?: string[]
}

/**
 * Alerta individual formatado
 */
export interface FormattedAlert {
  icon: string
  title: string
  description: string
  impact: string
}

/**
 * Seção de alertas importantes
 */
export interface AlertsSection {
  hasCriticalAlerts: boolean
  critical: FormattedAlert[]
  important: FormattedAlert[]
  informative: FormattedAlert[]
  summary?: string
}

/**
 * Item de próximo passo
 */
export interface NextStepItem {
  step: number
  action: string
  description: string
  timeline?: string
}

/**
 * Seção de próximos passos
 */
export interface NextStepsSection {
  steps: NextStepItem[]
  requiredDocuments: string[]
  estimatedTimeline: string
  contactInfo?: string
}

/**
 * Estrutura completa da recomendação
 */
export interface RecommendationDocument {
  intro: RecommendationIntro
  mainRecommendation: MainRecommendation
  alternatives: AlternativesSection
  comparisonTable: ComparisonTable
  alerts: AlertsSection
  nextSteps: NextStepsSection
  metadata: {
    generatedAt: string
    version: string
    modelUsed: string
  }
}

// =============================================================================
// FORMATADORES - Helpers de Formatação
// =============================================================================

/**
 * Formata valor monetário em Real brasileiro
 * @param value - Valor numérico
 * @returns String formatada (ex: "R$ 1.234,56")
 */
export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "Sob consulta"
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

/**
 * Formata data no formato brasileiro
 * @param date - Data (string ISO ou Date)
 * @returns String formatada (ex: "24/11/2025")
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d)
}

/**
 * Formata percentual
 * @param value - Valor decimal (0-1) ou inteiro (0-100)
 * @param decimals - Casas decimais (default: 0)
 * @returns String formatada (ex: "85%")
 */
export function formatPercentage(value: number, decimals: number = 0): string {
  // Se valor é decimal (0-1), converte para percentual
  const percentage = value <= 1 ? value * 100 : value

  return `${percentage.toFixed(decimals)}%`
}

/**
 * Formata score como barra visual
 * @param score - Score de 0 a 100
 * @returns String com representação visual
 */
export function formatScoreBar(score: number): string {
  const filled = Math.round(score / 10)
  const empty = 10 - filled

  return "█".repeat(filled) + "░".repeat(empty) + ` ${score}/100`
}

/**
 * Retorna ícone baseado no score
 * @param score - Score de 0 a 100
 * @returns Emoji representativo
 */
export function getScoreIcon(score: number): string {
  if (score >= 80) return "✅"
  if (score >= 60) return "🟢"
  if (score >= 40) return "🟡"
  return "🔴"
}

/**
 * Retorna badge formatado para plano
 * @param badge - Tipo de badge
 * @returns String com emoji e texto
 */
export function formatBadge(badge: string): {
  icon: string
  text: string
  full: string
} {
  const badges: Record<string, { icon: string; text: string }> = {
    recomendado: { icon: "⭐", text: "Recomendado" },
    "melhor-custo-beneficio": { icon: "🏆", text: "Melhor Custo-Benefício" },
    "mais-completo": { icon: "💎", text: "Mais Completo" },
    "mais-acessivel": { icon: "💰", text: "Mais Acessível" }
  }

  const badgeInfo = badges[badge] || { icon: "📋", text: badge }
  return {
    ...badgeInfo,
    full: `${badgeInfo.icon} ${badgeInfo.text}`
  }
}

/**
 * Retorna ícone de urgência para alertas
 * @param urgency - Nível de urgência
 * @returns Emoji representativo
 */
export function getAlertIcon(
  urgency: "critico" | "importante" | "informativo"
): string {
  const icons = {
    critico: "🚨",
    importante: "⚠️",
    informativo: "ℹ️"
  }
  return icons[urgency]
}

/**
 * Formata número de dias em período legível
 * @param days - Número de dias
 * @returns String formatada (ex: "6 meses", "1 ano")
 */
export function formatWaitingPeriod(days: number): string {
  if (days === 0) return "Sem carência"
  if (days < 30) return `${days} dias`
  if (days < 365) {
    const months = Math.round(days / 30)
    return months === 1 ? "1 mês" : `${months} meses`
  }
  const years = Math.round(days / 365)
  return years === 1 ? "1 ano" : `${years} anos`
}

/**
 * Trunca texto com reticências
 * @param text - Texto original
 * @param maxLength - Comprimento máximo
 * @returns Texto truncado
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + "..."
}

// =============================================================================
// RENDERIZADORES - Conversão para Markdown
// =============================================================================

/**
 * Renderiza introdução em Markdown
 */
export function renderIntroMarkdown(intro: RecommendationIntro): string {
  return `${intro.greeting}

${intro.clientSummary}

${intro.analysisHighlight}
`
}

/**
 * Renderiza recomendação principal em Markdown
 */
export function renderMainRecommendationMarkdown(
  rec: MainRecommendation
): string {
  const priceText = rec.monthlyPrice
    ? `\n**Valor mensal:** ${formatCurrency(rec.monthlyPrice)}`
    : ""

  const benefitsList = rec.keyBenefits.map(benefit => `- ${benefit}`).join("\n")

  return `## ⭐ Recomendação Principal

### ${rec.planName}${rec.operadora ? ` - ${rec.operadora}` : ""}

**Score de compatibilidade:** ${formatScoreBar(rec.score)}${priceText}

${rec.justification}

**Principais benefícios para você:**
${benefitsList}

> ${rec.personalizedNote}
`
}

/**
 * Renderiza alternativas em Markdown
 */
export function renderAlternativesMarkdown(alt: AlternativesSection): string {
  if (!alt.hasAlternatives) {
    return `## 🔄 Alternativas

${alt.noAlternativesReason || "Não encontramos alternativas significativamente diferentes para seu perfil."}
`
  }

  let markdown = "## 🔄 Alternativas\n\n"

  if (alt.budget) {
    const savingsText = alt.budget.savingsVsRecommended
      ? ` (economia de ${formatCurrency(alt.budget.savingsVsRecommended)}/mês)`
      : ""

    markdown += `### 💰 Opção Econômica: ${alt.budget.planName}

**Score:** ${alt.budget.score}/100${alt.budget.monthlyPrice ? ` | **Valor:** ${formatCurrency(alt.budget.monthlyPrice)}${savingsText}` : ""}

**Considerações:**
${alt.budget.tradeoffs.map(t => `- ${t}`).join("\n")}

> *Ideal para:* ${alt.budget.bestFor}

`
  }

  if (alt.premium) {
    const extraCostText = alt.premium.extraCostVsRecommended
      ? ` (+${formatCurrency(alt.premium.extraCostVsRecommended)}/mês)`
      : ""

    markdown += `### 💎 Opção Premium: ${alt.premium.planName}

**Score:** ${alt.premium.score}/100${alt.premium.monthlyPrice ? ` | **Valor:** ${formatCurrency(alt.premium.monthlyPrice)}${extraCostText}` : ""}

**Benefícios extras:**
${alt.premium.extraBenefits.map(b => `- ${b}`).join("\n")}

> *Ideal para:* ${alt.premium.bestFor}

`
  }

  return markdown
}

/**
 * Renderiza tabela comparativa em Markdown
 */
export function renderComparisonTableMarkdown(table: ComparisonTable): string {
  if (table.rows.length === 0) {
    return ""
  }

  let markdown = `## 📊 Comparativo dos Melhores Planos

| Plano | Score | Valor Mensal | Cobertura | Rede | Destaque |
|-------|:-----:|-------------:|:---------:|:----:|----------|
`

  for (const row of table.rows) {
    const priceCell = row.monthlyPrice
      ? formatCurrency(row.monthlyPrice)
      : "Sob consulta"

    markdown += `| ${row.badge} ${truncateText(row.planName, 25)} | ${row.score}/100 | ${priceCell} | ${getScoreIcon(row.coverageScore)} ${row.coverageScore}% | ${getScoreIcon(row.networkScore)} ${row.networkScore}% | ${truncateText(row.highlight, 30)} |\n`
  }

  if (table.footnotes && table.footnotes.length > 0) {
    markdown += "\n"
    table.footnotes.forEach((note, i) => {
      markdown += `*${i + 1}. ${note}*\n`
    })
  }

  return markdown + "\n"
}

/**
 * Renderiza alertas em Markdown
 */
export function renderAlertsMarkdown(alerts: AlertsSection): string {
  if (
    !alerts.hasCriticalAlerts &&
    alerts.critical.length === 0 &&
    alerts.important.length === 0
  ) {
    return `## 📋 Alertas e Observações

${getAlertIcon("informativo")} **Ótimas notícias!** Não identificamos alertas críticos para seu perfil nos planos analisados.

${alerts.informative.length > 0 ? alerts.informative.map(a => `- ${a.icon} ${a.description}`).join("\n") : ""}
`
  }

  let markdown = "## 🚨 Alertas Importantes\n\n"

  if (alerts.summary) {
    markdown += `${alerts.summary}\n\n`
  }

  if (alerts.critical.length > 0) {
    markdown += "### Atenção Imediata Necessária\n\n"
    for (const alert of alerts.critical) {
      markdown += `**${alert.icon} ${alert.title}**\n${alert.description}\n*Impacto:* ${alert.impact}\n\n`
    }
  }

  if (alerts.important.length > 0) {
    markdown += "### Pontos de Atenção\n\n"
    for (const alert of alerts.important) {
      markdown += `**${alert.icon} ${alert.title}**\n${alert.description}\n\n`
    }
  }

  if (alerts.informative.length > 0) {
    markdown += "### Informações Adicionais\n\n"
    for (const alert of alerts.informative) {
      markdown += `- ${alert.icon} ${alert.description}\n`
    }
    markdown += "\n"
  }

  return markdown
}

/**
 * Renderiza próximos passos em Markdown
 */
export function renderNextStepsMarkdown(nextSteps: NextStepsSection): string {
  let markdown = "## ✅ Próximos Passos\n\n"

  // Checklist de ações
  markdown += "### O que fazer agora:\n\n"
  for (const step of nextSteps.steps) {
    markdown += `**${step.step}. ${step.action}**\n`
    markdown += `   ${step.description}`
    if (step.timeline) {
      markdown += ` *(${step.timeline})*`
    }
    markdown += "\n\n"
  }

  // Documentos necessários
  if (nextSteps.requiredDocuments.length > 0) {
    markdown += "### 📄 Documentos Necessários\n\n"
    for (const doc of nextSteps.requiredDocuments) {
      markdown += `- [ ] ${doc}\n`
    }
    markdown += "\n"
  }

  // Timeline
  markdown += `### ⏱️ Prazo Estimado\n\n${nextSteps.estimatedTimeline}\n`

  // Contato
  if (nextSteps.contactInfo) {
    markdown += `\n### 📞 Precisa de Ajuda?\n\n${nextSteps.contactInfo}\n`
  }

  return markdown
}

/**
 * Renderiza documento completo de recomendação em Markdown
 */
export function renderFullRecommendationMarkdown(
  doc: RecommendationDocument
): string {
  const sections = [
    renderIntroMarkdown(doc.intro),
    renderMainRecommendationMarkdown(doc.mainRecommendation),
    renderAlternativesMarkdown(doc.alternatives),
    renderComparisonTableMarkdown(doc.comparisonTable),
    renderAlertsMarkdown(doc.alerts),
    renderNextStepsMarkdown(doc.nextSteps)
  ]

  let markdown = sections.join("\n---\n\n")

  // Footer com metadata
  markdown += `\n---\n\n*Análise gerada em ${formatDate(doc.metadata.generatedAt)} | Versão ${doc.metadata.version}*\n`

  return markdown
}

// =============================================================================
// GLOSSÁRIO - Termos Técnicos
// =============================================================================

/**
 * Glossário de termos técnicos de planos de saúde
 */
export const HEALTH_PLAN_GLOSSARY: Record<
  string,
  { term: string; explanation: string }
> = {
  carencia: {
    term: "carência",
    explanation:
      "período de espera obrigatório antes de poder usar determinados serviços do plano"
  },
  coparticipacao: {
    term: "coparticipação",
    explanation: "valor que você paga por cada procedimento além da mensalidade"
  },
  cobertura: {
    term: "cobertura",
    explanation: "conjunto de procedimentos e serviços incluídos no plano"
  },
  rede_credenciada: {
    term: "rede credenciada",
    explanation:
      "hospitais, clínicas e profissionais que atendem pelo plano sem custo extra"
  },
  exclusao: {
    term: "exclusão",
    explanation: "procedimentos ou condições não cobertos pelo plano"
  },
  dcp: {
    term: "DCP (Doenças e Condições Pré-existentes)",
    explanation:
      "condições de saúde que você já tinha antes de contratar o plano"
  },
  cpp: {
    term: "CPP (Cobertura Parcial Provisória)",
    explanation: "período em que algumas coberturas ficam limitadas para DCPs"
  },
  reembolso: {
    term: "reembolso",
    explanation:
      "valor devolvido pelo plano quando você paga um procedimento fora da rede credenciada"
  },
  ans: {
    term: "ANS (Agência Nacional de Saúde Suplementar)",
    explanation: "órgão do governo que regula os planos de saúde no Brasil"
  },
  rol: {
    term: "rol de procedimentos",
    explanation:
      "lista mínima de procedimentos que todo plano é obrigado a cobrir por lei"
  }
}

/**
 * Adiciona explicação a um termo técnico no texto
 * @param text - Texto original
 * @param term - Termo a explicar
 * @returns Texto com explicação entre parênteses
 */
export function addTermExplanation(text: string, term: string): string {
  const glossaryEntry = HEALTH_PLAN_GLOSSARY[term.toLowerCase()]
  if (!glossaryEntry) return text

  const regex = new RegExp(`\\b${glossaryEntry.term}\\b`, "gi")
  return text.replace(
    regex,
    `${glossaryEntry.term} (${glossaryEntry.explanation})`
  )
}

/**
 * Adiciona todas as explicações de termos técnicos encontrados no texto
 * @param text - Texto original
 * @returns Texto com explicações adicionadas
 */
export function addAllTermExplanations(text: string): string {
  let result = text
  const addedTerms = new Set<string>()

  for (const [key, entry] of Object.entries(HEALTH_PLAN_GLOSSARY)) {
    const regex = new RegExp(`\\b${entry.term}\\b`, "gi")
    if (regex.test(result) && !addedTerms.has(key)) {
      // Adiciona explicação apenas na primeira ocorrência
      result = result.replace(regex, (match, offset) => {
        if (!addedTerms.has(key)) {
          addedTerms.add(key)
          return `${match} (${entry.explanation})`
        }
        return match
      })
    }
  }

  return result
}
