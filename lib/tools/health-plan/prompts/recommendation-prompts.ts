/**
 * Prompts para Geração de Recomendação
 *
 * Prompts otimizados para GPT-4o gerar recomendações humanizadas
 *
 * Referência: PRD health-plan-agent-prd.md (RF-007)
 * Task Master: Task #9.2
 */

import type { ClientInfo } from "../schemas/client-info-schema"
import type {
  PlanCompatibilityAnalysis,
  CategorizedAlert
} from "../analyze-compatibility"

// =============================================================================
// PROMPT - Introdução Empática
// =============================================================================

/**
 * Cria prompt para gerar introdução empática
 */
export function createIntroPrompt(
  clientInfo: ClientInfo,
  totalPlansAnalyzed: number,
  topScore: number
): string {
  const dependentsText = clientInfo.dependents?.length
    ? `e ${clientInfo.dependents.length} dependente(s)`
    : ""

  const conditionsText = clientInfo.preExistingConditions?.length
    ? `com atenção especial para ${clientInfo.preExistingConditions.join(", ")}`
    : ""

  return `Você é um consultor empático de planos de saúde. Gere uma introdução acolhedora para uma recomendação personalizada.

PERFIL DO CLIENTE:
- Idade: ${clientInfo.age} anos
- Cidade: ${clientInfo.city}, ${clientInfo.state}
- Dependentes: ${clientInfo.dependents?.length || 0}
- Orçamento: R$ ${clientInfo.budget}/mês
${conditionsText ? `- Condições: ${conditionsText}` : ""}

ANÁLISE REALIZADA:
- Planos analisados: ${totalPlansAnalyzed}
- Melhor score encontrado: ${topScore}/100

Gere JSON com:
{
  "greeting": "Saudação personalizada e empática (max 100 chars)",
  "clientSummary": "Resumo do perfil do cliente mostrando que você entendeu as necessidades (max 200 chars)",
  "analysisHighlight": "Destaque da análise realizada de forma positiva (max 150 chars)"
}

DIRETRIZES:
- Tom: Empático, profissional e acolhedor
- Evite: Jargões técnicos sem explicação
- Mostre: Que entendeu as necessidades específicas do cliente
- Use: Linguagem clara e acessível`
}

// =============================================================================
// PROMPT - Recomendação Principal
// =============================================================================

/**
 * Cria prompt para gerar recomendação principal
 */
export function createMainRecommendationPrompt(
  clientInfo: ClientInfo,
  recommendedPlan: PlanCompatibilityAnalysis,
  monthlyPrice?: number
): string {
  const dependentsInfo = clientInfo.dependents?.length
    ? clientInfo.dependents
        .map(d => `${d.relationship} (${d.age} anos)`)
        .join(", ")
    : "Nenhum"

  const conditionsInfo = clientInfo.preExistingConditions?.length
    ? clientInfo.preExistingConditions.join(", ")
    : "Nenhuma declarada"

  const prefsInfo = clientInfo.preferences
    ? `
- Tipo de rede: ${clientInfo.preferences.networkType === "broad" ? "Ampla" : "Restrita"}
- Coparticipação: ${clientInfo.preferences.coParticipation ? "Aceita" : "Prefere não ter"}
${clientInfo.preferences.specificHospitals?.length ? `- Hospitais desejados: ${clientInfo.preferences.specificHospitals.join(", ")}` : ""}`
    : "Não especificadas"

  return `Você é um especialista em planos de saúde. Gere uma recomendação humanizada e empática.

PERFIL DO CLIENTE:
- Idade: ${clientInfo.age} anos
- Localização: ${clientInfo.city}, ${clientInfo.state}
- Orçamento: R$ ${clientInfo.budget}/mês
- Dependentes: ${dependentsInfo}
- Condições pré-existentes: ${conditionsInfo}
- Preferências: ${prefsInfo}

PLANO RECOMENDADO:
- Nome: ${recommendedPlan.planName}
- Operadora: ${recommendedPlan.operadora || "Não informada"}
- Score: ${recommendedPlan.score.overall}/100
${monthlyPrice ? `- Valor mensal: R$ ${monthlyPrice.toFixed(2)}` : ""}
- Prós: ${recommendedPlan.pros.join("; ")}
- Contras: ${recommendedPlan.cons.join("; ")}
- Raciocínio original: ${recommendedPlan.reasoning}

SCORES DETALHADOS:
- Elegibilidade: ${recommendedPlan.score.breakdown.eligibility}/100
- Cobertura: ${recommendedPlan.score.breakdown.coverage}/100
- Orçamento: ${recommendedPlan.score.breakdown.budget}/100
- Rede: ${recommendedPlan.score.breakdown.network}/100
- Preferências: ${recommendedPlan.score.breakdown.preferences}/100

Gere JSON com:
{
  "planName": "Nome do plano",
  "operadora": "Nome da operadora (opcional)",
  "justification": "Justificativa humanizada explicando POR QUE este plano é ideal para ESTE cliente especificamente (50-500 chars). Mencione aspectos do perfil do cliente.",
  "keyBenefits": ["Benefício 1 personalizado", "Benefício 2", "Benefício 3"] (2-5 itens),
  "personalizedNote": "Nota empática personalizada para o cliente (max 200 chars)",
  "technicalTermsExplained": [{"term": "carência", "explanation": "período de espera..."}] (opcional)
}

DIRETRIZES:
- SEMPRE relacione os benefícios com o perfil específico do cliente
- Se há condições pré-existentes, explique como o plano as cobre
- Se há dependentes crianças, destaque benefícios pediátricos
- Use linguagem empática e acessível
- Explique termos técnicos entre parênteses quando necessário
- A justificativa deve ser PESSOAL e ESPECÍFICA, não genérica`
}

// =============================================================================
// PROMPT - Alternativas
// =============================================================================

/**
 * Cria prompt para gerar alternativas
 */
export function createAlternativesPrompt(
  clientInfo: ClientInfo,
  recommendedPlan: PlanCompatibilityAnalysis,
  budgetPlan: PlanCompatibilityAnalysis | null,
  premiumPlan: PlanCompatibilityAnalysis | null,
  recommendedPrice?: number,
  budgetPrice?: number,
  premiumPrice?: number
): string {
  let budgetSection = "OPÇÃO ECONÔMICA: Não identificada"
  let premiumSection = "OPÇÃO PREMIUM: Não identificada"

  if (budgetPlan && budgetPlan.planId !== recommendedPlan.planId) {
    const savings =
      recommendedPrice && budgetPrice
        ? recommendedPrice - budgetPrice
        : undefined
    budgetSection = `OPÇÃO ECONÔMICA:
- Nome: ${budgetPlan.planName}
- Score: ${budgetPlan.score.overall}/100
${budgetPrice ? `- Valor: R$ ${budgetPrice.toFixed(2)}/mês` : ""}
${savings ? `- Economia vs recomendado: R$ ${savings.toFixed(2)}/mês` : ""}
- Score orçamento: ${budgetPlan.score.breakdown.budget}/100
- Score cobertura: ${budgetPlan.score.breakdown.coverage}/100
- Prós: ${budgetPlan.pros.slice(0, 3).join("; ")}
- Contras: ${budgetPlan.cons.slice(0, 2).join("; ")}`
  }

  if (premiumPlan && premiumPlan.planId !== recommendedPlan.planId) {
    const extraCost =
      recommendedPrice && premiumPrice
        ? premiumPrice - recommendedPrice
        : undefined
    premiumSection = `OPÇÃO PREMIUM:
- Nome: ${premiumPlan.planName}
- Score: ${premiumPlan.score.overall}/100
${premiumPrice ? `- Valor: R$ ${premiumPrice.toFixed(2)}/mês` : ""}
${extraCost ? `- Custo extra vs recomendado: R$ ${extraCost.toFixed(2)}/mês` : ""}
- Score cobertura: ${premiumPlan.score.breakdown.coverage}/100
- Score elegibilidade: ${premiumPlan.score.breakdown.eligibility}/100
- Prós: ${premiumPlan.pros.slice(0, 3).join("; ")}
- Contras: ${premiumPlan.cons.slice(0, 2).join("; ")}`
  }

  return `Você é um consultor de planos de saúde. Gere descrições das alternativas ao plano recomendado.

PLANO RECOMENDADO (para comparação):
- Nome: ${recommendedPlan.planName}
- Score: ${recommendedPlan.score.overall}/100
${recommendedPrice ? `- Valor: R$ ${recommendedPrice.toFixed(2)}/mês` : ""}

${budgetSection}

${premiumSection}

PERFIL DO CLIENTE:
- Orçamento: R$ ${clientInfo.budget}/mês
- Condições: ${clientInfo.preExistingConditions?.join(", ") || "Nenhuma"}

Gere JSON com:
{
  "hasBudgetAlternative": boolean,
  "budget": {
    "planName": "Nome",
    "reasonForBudget": "Por que é mais econômico (max 100 chars)",
    "tradeoffs": ["O que você abre mão 1", "Tradeoff 2"] (1-3 itens),
    "bestFor": "Perfil ideal para esta opção (max 80 chars)",
    "comparisonSummary": "Resumo comparando com recomendado (max 150 chars)"
  } (ou null se não houver),
  "hasPremiumAlternative": boolean,
  "premium": {
    "planName": "Nome",
    "reasonForPremium": "Por que é mais completo (max 100 chars)",
    "extraBenefits": ["Benefício extra 1", "Benefício 2"] (1-4 itens),
    "bestFor": "Perfil ideal para esta opção (max 80 chars)",
    "comparisonSummary": "Resumo comparando com recomendado (max 150 chars)"
  } (ou null se não houver),
  "noAlternativesReason": "Razão se não houver alternativas significativas"
}

DIRETRIZES:
- Se budget === recommended, não inclua alternativa econômica
- Se premium === recommended, não inclua alternativa premium
- Seja honesto sobre os tradeoffs
- Destaque para qual perfil cada opção é mais adequada`
}

// =============================================================================
// PROMPT - Alertas Formatados
// =============================================================================

/**
 * Cria prompt para formatar alertas para o cliente
 */
export function createAlertsFormattingPrompt(
  clientInfo: ClientInfo,
  alerts: CategorizedAlert[],
  recommendedPlanName: string
): string {
  if (alerts.length === 0) {
    return `Gere JSON indicando que não há alertas críticos:
{
  "hasCriticalAlerts": false,
  "alerts": [],
  "summary": "Boa notícia! Não identificamos pontos críticos de atenção para seu perfil."
}`
  }

  const alertsList = alerts
    .map(
      a =>
        `- [${a.urgency.toUpperCase()}] ${a.category}: ${a.alert.title} - ${a.alert.description}`
    )
    .join("\n")

  return `Você é um consultor de planos de saúde. Reformate os alertas técnicos em linguagem clara para o cliente.

PERFIL DO CLIENTE:
- Idade: ${clientInfo.age} anos
- Condições: ${clientInfo.preExistingConditions?.join(", ") || "Nenhuma"}
- Plano recomendado: ${recommendedPlanName}

ALERTAS IDENTIFICADOS:
${alertsList}

Gere JSON com:
{
  "hasCriticalAlerts": boolean,
  "alerts": [
    {
      "title": "Título claro e direto (max 60 chars)",
      "description": "Descrição em linguagem acessível (max 200 chars)",
      "impact": "Impacto específico no perfil deste cliente (max 100 chars)",
      "urgency": "critico" | "importante" | "informativo"
    }
  ],
  "summary": "Resumo geral dos alertas (max 200 chars)"
}

DIRETRIZES:
- Transforme jargões técnicos em linguagem clara
- Explique o IMPACTO real para este cliente específico
- Se for sobre carência, explique o que significa
- Seja direto mas não alarmista
- Priorize alertas que afetam condições pré-existentes do cliente`
}

// =============================================================================
// PROMPT - Próximos Passos
// =============================================================================

/**
 * Cria prompt para gerar próximos passos
 */
export function createNextStepsPrompt(
  clientInfo: ClientInfo,
  recommendedPlanName: string,
  operadora?: string
): string {
  const hasDependents = (clientInfo.dependents?.length || 0) > 0
  const hasConditions = (clientInfo.preExistingConditions?.length || 0) > 0

  return `Você é um consultor de planos de saúde. Gere os próximos passos personalizados para o cliente.

CONTEXTO:
- Plano escolhido: ${recommendedPlanName}
- Operadora: ${operadora || "A definir"}
- Cliente: ${clientInfo.age} anos, ${clientInfo.city}/${clientInfo.state}
- Tem dependentes: ${hasDependents ? "Sim" : "Não"}
- Tem condições pré-existentes: ${hasConditions ? "Sim" : "Não"}

Gere JSON com:
{
  "steps": [
    {
      "step": 1,
      "action": "Ação clara e objetiva (max 50 chars)",
      "description": "Detalhamento do que fazer (max 150 chars)",
      "timeline": "Prazo sugerido (ex: 'Imediato', '1-2 dias')"
    }
  ] (3-6 passos),
  "requiredDocuments": [
    "Documento 1 necessário",
    "Documento 2"
  ] (2-8 itens),
  "estimatedTimeline": "Timeline geral do processo (max 100 chars)",
  "additionalNotes": "Notas adicionais relevantes (max 200 chars, opcional)"
}

DOCUMENTOS TÍPICOS:
- RG e CPF do titular
- Comprovante de residência
- Carteira de trabalho (se empresarial)
${hasDependents ? "- Documentos dos dependentes (certidão nascimento/casamento)" : ""}
${hasConditions ? "- Declaração de saúde / Laudos médicos" : ""}

DIRETRIZES:
- Passos devem ser ACIONÁVEIS e ESPECÍFICOS
- Inclua prazos realistas
- Se há condições pré-existentes, inclua passo sobre declaração de saúde
- Se há dependentes, inclua documentação necessária
- Timeline típico: 7-15 dias úteis para ativação`
}

// =============================================================================
// SYSTEM PROMPTS
// =============================================================================

/**
 * System prompt para geração de recomendações
 */
export const RECOMMENDATION_SYSTEM_PROMPT = `Você é um consultor especializado em planos de saúde no Brasil, com vasta experiência em ajudar pessoas a encontrar o plano ideal para suas necessidades.

SUAS CARACTERÍSTICAS:
- Empático e acolhedor
- Profissional mas acessível
- Explica termos técnicos de forma clara
- Sempre considera o contexto específico do cliente
- Honesto sobre limitações e trade-offs

REGRAS:
1. SEMPRE retorne JSON válido conforme solicitado
2. NUNCA use linguagem técnica sem explicação
3. SEMPRE personalize baseado no perfil do cliente
4. Seja direto mas não frio
5. Destaque benefícios relevantes para ESTE cliente
6. Mencione riscos de forma clara mas não alarmista

TERMOS A EXPLICAR (se usar):
- Carência: período de espera antes de usar o plano
- Coparticipação: valor pago por procedimento além da mensalidade
- DCP: Doenças e Condições Pré-existentes
- CPP: Cobertura Parcial Provisória
- Rede credenciada: hospitais/médicos que atendem pelo plano`

/**
 * System prompt para formatação de alertas
 */
export const ALERTS_SYSTEM_PROMPT = `Você é um especialista em comunicação de riscos em planos de saúde.

Sua função é transformar alertas técnicos em mensagens claras e acionáveis para clientes leigos.

REGRAS:
1. Seja direto mas não alarmista
2. Explique o impacto REAL no dia a dia
3. Use linguagem simples
4. Sempre retorne JSON válido`
