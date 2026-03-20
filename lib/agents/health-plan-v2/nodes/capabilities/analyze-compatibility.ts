/**
 * Capacidade: analyzeCompatibility
 *
 * Analisa compatibilidade dos planos encontrados e gera estrutura RankedAnalysis.
 * Recebe ragAnalysisContext (texto) e converte para compatibilityAnalysis (estruturado).
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-005
 *
 * FASE 7: Implementação completa com GPT-5-mini
 *
 * NOTA: NÃO usa lib/tools/health-plan/analyze-compatibility.ts (v1)
 * porque usa tipos incompatíveis (HealthPlanSearchResult vs IdentifiedPlan)
 */

import { AIMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import type { HealthPlanState } from "../../state/state-annotation"
import type { CompatibilityAnalysis, RankedAnalysis } from "../../types"
import { humanizeResponse } from "./humanize-response"

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Schema Zod para validação da resposta do LLM
 */
const CompatibilityAnalysisSchema = z.object({
  planId: z.string().describe("ID único do plano"),
  planName: z.string().describe("Nome do plano"),
  score: z
    .number()
    .min(0)
    .max(100)
    .describe("Score de compatibilidade (0-100)"),
  pros: z
    .array(z.string())
    .describe("Pontos positivos do plano para o cliente"),
  cons: z.array(z.string()).describe("Pontos negativos ou alertas do plano"),
  compatibility: z
    .enum(["alta", "media", "baixa"])
    .describe("Nível de compatibilidade geral"),
  recommendation: z
    .string()
    .nullable()
    .describe("Recomendação específica para este plano")
})

const RankedAnalysisResponseSchema = z.object({
  analyses: z
    .array(CompatibilityAnalysisSchema)
    .describe("Lista de análises ordenadas por score"),
  topRecommendation: z
    .string()
    .describe("Resumo da recomendação principal em 1-2 frases"),
  reasoning: z
    .string()
    .describe("Raciocínio por trás do ranking e recomendação")
})

// =============================================================================
// PROMPTS
// =============================================================================

const ANALYZE_COMPATIBILITY_SYSTEM_PROMPT = `Você é um especialista em planos de saúde. Analise os planos disponíveis e gere um ranking de compatibilidade para o cliente.

## Sua Tarefa
1. Analisar cada plano mencionado no contexto
2. Calcular score de compatibilidade (0-100) baseado no perfil do cliente
3. Identificar prós e contras de cada plano
4. Rankear os planos do mais ao menos compatível
5. Gerar recomendação principal

## Critérios de Score
- 90-100: Alta compatibilidade - atende todos os requisitos
- 70-89: Média-alta - atende a maioria, algumas ressalvas
- 50-69: Média - atende requisitos básicos, trade-offs significativos
- 30-49: Baixa - pode não atender necessidades importantes
- 0-29: Incompatível - não recomendado

## Fatores a Considerar
- Idade do titular e dependentes
- Orçamento informado
- Localização (cobertura regional)
- Condições de saúde pré-existentes
- Necessidades específicas mencionadas na conversa
- Carências e restrições do plano
- Rede credenciada
- Coparticipação

## Formato de Resposta
Retorne um JSON válido seguindo o schema fornecido.`

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Analisa compatibilidade dos planos com o perfil do cliente
 *
 * Converte ragAnalysisContext (texto) em compatibilityAnalysis (estruturado)
 * usando GPT-5-mini para análise semântica.
 */
export async function analyzeCompatibility(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const startTime = Date.now()
  console.log(
    "[analyzeCompatibility] Iniciando análise de compatibilidade com GPT-5-mini..."
  )

  // Verificar pré-requisitos
  const hasSearchResults =
    Array.isArray(state.searchResults) && state.searchResults.length > 0
  const hasRagContext = Boolean(state.ragAnalysisContext?.trim())

  if (!hasSearchResults && !hasRagContext) {
    const rawResponse =
      "Primeiro preciso buscar planos para analisar. " +
      "Pode me fornecer mais informações sobre seu perfil?"

    console.log("[analyzeCompatibility] Sem dados para analisar")

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
    // Construir contexto do cliente
    const clientContext = buildClientContext(state.clientInfo || {})

    // Usar ragAnalysisContext se disponível, senão construir do searchResults
    const plansContext = hasRagContext
      ? state.ragAnalysisContext!
      : buildPlansContextFromSearchResults(state.searchResults || [])

    // Verificar se temos contexto suficiente
    if (!plansContext || plansContext.length < 50) {
      const rawResponse =
        "As informações sobre os planos estão incompletas. " +
        "Vou tentar buscar mais detalhes."

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

    // Configurar GPT-5-mini
    // IMPORTANTE: GPT-5 APENAS suporta temperature=1
    const llm = new ChatOpenAI({
      modelName: "gpt-5-mini",
      temperature: 1,
      timeout: 30000,
      maxRetries: 2,
      modelKwargs: {
        max_completion_tokens: 2048,
        reasoning_effort: "low" // low para velocidade
      }
    })

    // Construir prompt
    const userPrompt = `## Perfil do Cliente
${clientContext}

## Planos Encontrados (Análise RAG)
${plansContext}

## Instruções
Analise a compatibilidade de cada plano com o perfil do cliente.
Retorne um JSON válido com o ranking e análise detalhada.`

    console.log(
      `[analyzeCompatibility] Enviando ${plansContext.length} chars para GPT-5-mini...`
    )

    // Chamar LLM com structured output
    const structuredLLM = llm.withStructuredOutput(
      RankedAnalysisResponseSchema,
      {
        name: "analyze_compatibility"
      }
    )

    const result = await structuredLLM.invoke([
      { role: "system", content: ANALYZE_COMPATIBILITY_SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ])

    const executionTimeMs = Date.now() - startTime

    // Construir RankedAnalysis
    const rankedAnalysis: RankedAnalysis = {
      analyses: result.analyses.map(a => ({
        planId: a.planId,
        score: a.score,
        pros: a.pros,
        cons: a.cons,
        compatibility: a.compatibility,
        recommendation: a.recommendation
      })),
      topRecommendation: result.topRecommendation,
      reasoning: result.reasoning,
      timestamp: new Date().toISOString()
    }

    // Ordenar por score
    rankedAnalysis.analyses.sort((a, b) => b.score - a.score)

    // Gerar resposta resumida
    const topPlans = rankedAnalysis.analyses.slice(0, 3)
    const rawResponse = generateAnalysisResponse(topPlans, rankedAnalysis)

    console.log(
      `[analyzeCompatibility] Análise concluída: ${rankedAnalysis.analyses.length} planos analisados em ${executionTimeMs}ms`
    )

    const humanized = await humanizeResponse({
      rawResponse,
      state,
      messageType: "analysis_result"
    })

    return {
      compatibilityAnalysis: rankedAnalysis,
      analysisVersion: (state.analysisVersion || 0) + 1,
      currentResponse: humanized.response,
      messages: [new AIMessage(humanized.response)]
    }
  } catch (error) {
    console.error("[analyzeCompatibility] Erro na análise:", error)

    const rawError =
      "Houve um problema ao analisar os planos. " +
      "Vou tentar de outra forma. O que mais gostaria de saber sobre os planos?"

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
          capability: "analyzeCompatibility",
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
 * Constrói contexto de planos a partir de searchResults (fallback)
 */
function buildPlansContextFromSearchResults(searchResults: any[]): string {
  if (!searchResults || searchResults.length === 0) {
    return "Nenhum plano encontrado"
  }

  return searchResults
    .map((plan, index) => {
      const lines = [`### Plano ${index + 1}: ${plan.nome_plano || "Sem nome"}`]

      if (plan.operadora) lines.push(`- Operadora: ${plan.operadora}`)
      if (plan.tipo) lines.push(`- Tipo: ${plan.tipo}`)
      if (plan.abrangencia) lines.push(`- Abrangência: ${plan.abrangencia}`)
      if (plan.preco_base) lines.push(`- Preço base: R$${plan.preco_base}`)
      if (plan.coparticipacao !== undefined) {
        lines.push(`- Coparticipação: ${plan.coparticipacao ? "sim" : "não"}`)
      }

      if (plan.metadata) {
        if (plan.metadata.relevance) {
          lines.push(`- Relevância: ${plan.metadata.relevance}`)
        }
        if (plan.metadata.summary) {
          lines.push(`- Resumo: ${plan.metadata.summary}`)
        }
      }

      return lines.join("\n")
    })
    .join("\n\n")
}

/**
 * Gera resposta humanizada do resumo da análise
 */
function generateAnalysisResponse(
  topPlans: CompatibilityAnalysis[],
  analysis: RankedAnalysis
): string {
  if (topPlans.length === 0) {
    return (
      "Não consegui analisar nenhum plano em detalhes. " +
      "Você pode me dar mais informações sobre suas necessidades?"
    )
  }

  const intro = `Analisei ${analysis.analyses.length} planos e aqui está o ranking de compatibilidade:`

  const ranking = topPlans
    .map((plan, index) => {
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"
      const compat =
        plan.compatibility === "alta"
          ? "Alta"
          : plan.compatibility === "media"
            ? "Média"
            : "Baixa"
      return `${medal} **${plan.planId}** - Score: ${plan.score}/100 (${compat})`
    })
    .join("\n")

  const topRec = analysis.topRecommendation
    ? `\n\n**Recomendação:** ${analysis.topRecommendation}`
    : ""

  return `${intro}\n\n${ranking}${topRec}\n\nQuer que eu detalhe algum plano específico ou gere uma recomendação completa?`
}
