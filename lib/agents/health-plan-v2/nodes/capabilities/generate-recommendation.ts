/**
 * Capacidade: generateRecommendation
 *
 * Gera recomendação humanizada de planos usando GPT-5-mini.
 * Recebe compatibilityAnalysis (estruturado) e gera resposta LLM completa.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-007, Fase 7
 *
 * FASE 7: Implementação completa com GPT-5-mini
 *
 * NOTA: NÃO usa lib/tools/health-plan/generate-recommendation.ts (v1)
 * porque usa tipos incompatíveis (RankedAnalysis v1 vs v2)
 */

import { AIMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import type { HealthPlanState } from "../../state/state-annotation"
import type { GenerateRecommendationResult, RankedAnalysis } from "../../types"
import { humanizeResponse } from "./humanize-response"

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Schema Zod para validação da resposta do LLM
 */
const RecommendationResponseSchema = z.object({
  markdown: z
    .string()
    .describe(
      "Recomendação completa em markdown com introdução, top 3, tabela comparativa e próximos passos"
    ),
  topPlanId: z.string().describe("ID do plano mais recomendado"),
  alternativeIds: z
    .array(z.string())
    .describe("IDs dos planos alternativos (2º e 3º lugar)"),
  highlights: z
    .array(z.string())
    .describe("Principais destaques positivos da recomendação"),
  warnings: z
    .array(z.string())
    .describe("Alertas ou pontos de atenção importantes"),
  nextSteps: z
    .array(z.string())
    .describe("Próximos passos sugeridos para o cliente")
})

// =============================================================================
// PROMPTS
// =============================================================================

const GENERATE_RECOMMENDATION_SYSTEM_PROMPT = `Você é um consultor especializado em planos de saúde. Gere uma recomendação personalizada e humanizada para o cliente.

## Sua Tarefa
1. Criar introdução contextual sobre o perfil do cliente
2. Apresentar top 3 planos recomendados com justificativas
3. Gerar tabela comparativa markdown
4. Listar próximos passos claros

## Formato do Markdown

### Estrutura Obrigatória:
1. **Introdução** (2-3 frases sobre o perfil e necessidades)
2. **Top 3 Planos Recomendados** (cada um com nome, operadora, preço, e justificativa em 2 frases)
3. **Tabela Comparativa** (markdown table com: Plano | Preço | Cobertura | Compatibilidade)
4. **Destaques** (bullets com principais vantagens)
5. **Pontos de Atenção** (bullets com alertas importantes)
6. **Próximos Passos** (checklist markdown com ações sugeridas)

## Tom de Voz
- Profissional mas acessível
- Evite jargões técnicos não explicados
- Use emojis moderadamente (🏥 ✅ ⚠️ 📋)
- Seja direto mas completo

## Formato de Resposta
Retorne um JSON válido seguindo o schema fornecido.`

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Gera recomendação humanizada de planos de saúde
 *
 * Recebe compatibilityAnalysis (estruturado) e gera resposta LLM completa
 * usando GPT-5-mini para resposta humanizada.
 */
export async function generateRecommendation(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const startTime = Date.now()
  console.log(
    "[generateRecommendation] Gerando recomendação humanizada com GPT-5-mini..."
  )

  // Verificar pré-requisitos
  const hasAnalysis =
    state.compatibilityAnalysis !== null &&
    state.compatibilityAnalysis !== undefined
  const hasSearchResults =
    Array.isArray(state.searchResults) && state.searchResults.length > 0

  if (!hasAnalysis) {
    const rawResponse = hasSearchResults
      ? "Vou analisar os planos encontrados antes de gerar uma recomendação completa."
      : "Para gerar uma recomendação, primeiro preciso buscar e analisar os planos disponíveis para seu perfil."

    console.log(
      "[generateRecommendation] Sem análise de compatibilidade disponível"
    )

    const humanized = await humanizeResponse({
      rawResponse,
      state,
      messageType: "search_status"
    })

    return {
      currentResponse: humanized.response,
      messages: [new AIMessage(humanized.response)]
    }
  }

  try {
    const analysis = state.compatibilityAnalysis!

    // Construir contexto do cliente
    const clientContext = buildClientContext(state.clientInfo || {})

    // Construir contexto da análise
    const analysisContext = buildAnalysisContext(analysis)

    // Verificar se temos análises para recomendar
    if (analysis.analyses.length === 0) {
      const rawResponse =
        "Não tenho planos analisados para gerar uma recomendação. " +
        "Vamos tentar buscar mais opções?"

      const humanized = await humanizeResponse({
        rawResponse,
        state,
        messageType: "error"
      })

      return {
        currentResponse: humanized.response,
        messages: [new AIMessage(humanized.response)]
      }
    }

    // Configurar GPT-5-mini
    // IMPORTANTE: GPT-5 APENAS suporta temperature=1
    const llm = new ChatOpenAI({
      modelName: "gpt-5.1-mini",
      temperature: 1,
      timeout: 45000, // Mais tempo para resposta longa
      maxRetries: 2,
      maxCompletionTokens: 4096,
      modelKwargs: {
        reasoning_effort: "low" // low para velocidade
      }
    })

    // Construir prompt
    const userPrompt = `## Perfil do Cliente
${clientContext}

## Análise de Compatibilidade
${analysisContext}

## Instruções
Gere uma recomendação personalizada e humanizada para este cliente.
Inclua: introdução, top 3 planos, tabela comparativa markdown, destaques, alertas e próximos passos.
Retorne um JSON válido com o markdown completo e metadados.`

    console.log(
      `[generateRecommendation] Enviando ${analysis.analyses.length} planos analisados para GPT-5-mini...`
    )

    // Chamar LLM com structured output
    const structuredLLM = llm.withStructuredOutput(
      RecommendationResponseSchema,
      {
        name: "generate_recommendation"
      }
    )

    const result = await structuredLLM.invoke([
      { role: "system", content: GENERATE_RECOMMENDATION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ])

    const executionTimeMs = Date.now() - startTime

    // Construir GenerateRecommendationResult
    const recommendation: GenerateRecommendationResult = {
      markdown: result.markdown,
      topPlanId: result.topPlanId,
      alternativeIds: result.alternativeIds,
      highlights: result.highlights,
      warnings: result.warnings,
      nextSteps: result.nextSteps,
      version: (state.recommendationVersion || 0) + 1,
      timestamp: new Date().toISOString()
    }

    console.log(
      `[generateRecommendation] Recomendação gerada em ${executionTimeMs}ms`
    )

    return {
      recommendation,
      recommendationVersion: recommendation.version,
      currentResponse: result.markdown,
      messages: [new AIMessage(result.markdown)]
    }
  } catch (error) {
    console.error("[generateRecommendation] Erro ao gerar recomendação:", error)

    // Fallback: gerar recomendação simples sem LLM, depois humanizar
    const rawFallback = generateFallbackRecommendation(
      state.compatibilityAnalysis,
      state.clientInfo || {}
    )

    const humanized = await humanizeResponse({
      rawResponse: rawFallback,
      state,
      messageType: "recommendation"
    })

    return {
      currentResponse: humanized.response,
      messages: [new AIMessage(humanized.response)],
      errors: [
        {
          capability: "generateRecommendation",
          message: error instanceof Error ? error.message : "Erro desconhecido",
          timestamp: new Date().toISOString()
        }
      ]
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Constrói contexto do cliente para o prompt
 */
function buildClientContext(clientInfo: Record<string, any>): string {
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
    parts.push(`- Orçamento: até R$${clientInfo.budget}/mês`)
  }

  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const deps = clientInfo.dependents
      .map((d: any) => {
        const age =
          d.age !== undefined ? `${d.age} anos` : "idade não informada"
        const rel = d.relationship || "dependente"
        return `${rel} (${age})`
      })
      .join(", ")
    parts.push(`- Dependentes: ${deps}`)
  }

  if (clientInfo.healthConditions && clientInfo.healthConditions.length > 0) {
    parts.push(
      `- Condições de saúde: ${clientInfo.healthConditions.join(", ")}`
    )
  }

  if (clientInfo.preferences && clientInfo.preferences.length > 0) {
    parts.push(`- Preferências: ${clientInfo.preferences.join(", ")}`)
  }

  if (clientInfo.acceptsCoparticipation !== undefined) {
    parts.push(
      `- Coparticipação: ${clientInfo.acceptsCoparticipation ? "aceita" : "não aceita"}`
    )
  }

  // Empresarial / PME - beneficiários
  if (clientInfo.companyName) {
    parts.push(`- Empresa: ${clientInfo.companyName}`)
  }
  if (clientInfo.contractType) {
    parts.push(`- Tipo de contratação: ${clientInfo.contractType}`)
  }
  if (clientInfo.beneficiaries && clientInfo.beneficiaries.length > 0) {
    parts.push(
      `- Total de beneficiários: ${clientInfo.beneficiaries.length} funcionários`
    )
    for (let i = 0; i < clientInfo.beneficiaries.length; i++) {
      const ben = clientInfo.beneficiaries[i]
      const benName = ben.name || `Funcionário ${i + 1}`
      const benAge =
        ben.age !== undefined ? `${ben.age} anos` : "idade não informada"
      let benLine = `  ${i + 1}. ${benName} (${benAge})`
      if (ben.healthConditions && ben.healthConditions.length > 0) {
        benLine += ` - Condições: ${ben.healthConditions.join(", ")}`
      }
      if (ben.dependents && ben.dependents.length > 0) {
        const depsSummary = ben.dependents
          .map(
            (d: any) =>
              `${d.relationship || "dep"} ${d.age !== undefined ? d.age + "a" : ""}${d.healthConditions?.length ? " (" + d.healthConditions.join(", ") + ")" : ""}`
          )
          .join(", ")
        benLine += ` + deps: [${depsSummary}]`
      }
      parts.push(benLine)
    }
  }

  return parts.length > 0
    ? parts.join("\n")
    : "Perfil não especificado detalhadamente"
}

/**
 * Constrói contexto da análise de compatibilidade para o prompt
 */
function buildAnalysisContext(analysis: RankedAnalysis): string {
  const parts: string[] = []

  parts.push(`### Resumo Geral`)
  parts.push(`- Total de planos analisados: ${analysis.analyses.length}`)
  parts.push(`- Raciocínio: ${analysis.reasoning}`)
  parts.push(`- Recomendação principal: ${analysis.topRecommendation}`)

  parts.push(`\n### Detalhamento por Plano`)

  // Top 5 planos
  const topPlans = analysis.analyses.slice(0, 5)
  for (const plan of topPlans) {
    parts.push(`\n**${plan.planId}** (Score: ${plan.score}/100)`)
    parts.push(`- Compatibilidade: ${plan.compatibility}`)
    parts.push(`- Prós: ${plan.pros.join("; ")}`)
    parts.push(`- Contras: ${plan.cons.join("; ")}`)
    if (plan.recommendation) {
      parts.push(`- Nota: ${plan.recommendation}`)
    }
  }

  return parts.join("\n")
}

/**
 * Gera recomendação de fallback quando LLM falha
 */
function generateFallbackRecommendation(
  analysis: RankedAnalysis | null,
  clientInfo: Record<string, any>
): string {
  if (!analysis || analysis.analyses.length === 0) {
    return (
      "Desculpe, não consegui gerar uma recomendação completa no momento. " +
      "Posso ajudá-lo de outra forma?"
    )
  }

  const topPlans = analysis.analyses.slice(0, 3)
  const profileParts: string[] = []

  if (clientInfo.age) profileParts.push(`${clientInfo.age} anos`)
  if (clientInfo.city || clientInfo.state) {
    profileParts.push(clientInfo.city || clientInfo.state)
  }
  if (clientInfo.budget)
    profileParts.push(`orçamento de R$${clientInfo.budget}`)

  const profileSummary =
    profileParts.length > 0 ? profileParts.join(", ") : "seu perfil"

  let markdown = `## 🏥 Recomendação de Planos\n\n`
  markdown += `Com base em ${profileSummary}, aqui estão as melhores opções:\n\n`

  topPlans.forEach((plan, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"
    const compat =
      plan.compatibility === "alta"
        ? "Alta"
        : plan.compatibility === "media"
          ? "Média"
          : "Baixa"

    markdown += `${medal} **${plan.planId}**\n`
    markdown += `- Score: ${plan.score}/100 (${compat})\n`
    markdown += `- ✅ ${plan.pros[0] || "Bom custo-benefício"}\n`
    if (plan.cons[0]) {
      markdown += `- ⚠️ ${plan.cons[0]}\n`
    }
    markdown += `\n`
  })

  markdown += `\n### 📋 Próximos Passos\n`
  markdown += `- [ ] Solicitar cotação detalhada\n`
  markdown += `- [ ] Verificar rede credenciada na sua região\n`
  markdown += `- [ ] Comparar carências entre os planos\n`

  return markdown
}
