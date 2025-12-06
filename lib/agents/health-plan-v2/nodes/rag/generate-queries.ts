/**
 * Generate Queries - Multi-Query RAG
 *
 * Gera 3-5 queries especializadas a partir dos dados do cliente
 * para busca diversificada de documentos.
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: RF-001, Fase 6A.4
 */

import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"

/**
 * Schema para validação das queries geradas
 */
export const GeneratedQueriesSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string().min(10).max(500),
        focus: z.enum([
          "profile", // Foco no perfil do cliente (idade, cidade)
          "coverage", // Foco em cobertura e benefícios
          "price", // Foco em preço e custo-benefício
          "dependents", // Foco em dependentes
          "conditions", // Foco em condições pré-existentes
          "general" // Busca geral
        ]),
        priority: z.number().min(1).max(5)
      })
    )
    .min(3)
    .max(5)
})

export type GeneratedQueries = z.infer<typeof GeneratedQueriesSchema>
export type QueryFocus = GeneratedQueries["queries"][0]["focus"]

/**
 * Interface para dados do cliente usados na geração de queries
 */
export interface ClientInfoForQueries {
  age?: number
  city?: string
  state?: string
  budget?: number
  dependents?: Array<{
    age?: number
    relationship?: string
  }>
  preExistingConditions?: string[]
  preferences?: string[]
}

/**
 * Prompt para geração de queries diversificadas
 */
const GENERATE_QUERIES_PROMPT = `Você é um especialista em planos de saúde no Brasil.

Dado o perfil do cliente abaixo, gere de 3 a 5 queries de busca diversificadas para encontrar planos de saúde relevantes.

**Regras:**
1. Cada query deve ter um foco diferente (profile, coverage, price, dependents, conditions, general)
2. Queries devem ser em português brasileiro
3. Priorize aspectos mais importantes do perfil (idade, condições, dependentes)
4. Queries devem ser específicas o suficiente para busca semântica
5. Evite queries genéricas demais

**Perfil do Cliente:**
{clientInfo}

**Formato de Resposta (JSON):**
{
  "queries": [
    {
      "query": "planos de saúde para pessoa de X anos em cidade Y com cobertura completa",
      "focus": "profile",
      "priority": 1
    },
    ...
  ]
}

Gere as queries agora:`

/**
 * Gera queries especializadas baseadas no perfil do cliente
 *
 * @param clientInfo - Dados do cliente para personalizar queries
 * @param model - Modelo LLM a usar (default: gpt-5-mini)
 * @returns Array de queries com foco e prioridade
 *
 * Nota: GPT-5 models usam reasoning_effort ao invés de temperature.
 * Ref: https://cookbook.openai.com/examples/gpt-5/gpt-5_new_params_and_tools
 */
export async function generateQueries(
  clientInfo: ClientInfoForQueries,
  model: string = "gpt-5-mini"
): Promise<GeneratedQueries> {
  // Configuração para modelos GPT-5 (não suportam temperature)
  // Chat Completions API usa reasoning_effort flat, não objeto aninhado
  const isGpt5Model = model.startsWith("gpt-5")

  const llm = new ChatOpenAI({
    modelName: model,
    timeout: 10000, // 10s timeout
    maxRetries: 2,
    // Tags para LangSmith
    tags: ["generate-queries", "health-plan-v2", "rag"],
    // GPT-5 usa reasoning_effort (Chat Completions API)
    // GPT-4 usa temperature
    ...(isGpt5Model
      ? {
          modelKwargs: {
            reasoning_effort: "low"
          }
        }
      : {
          temperature: 0.3
        })
  })

  // Formatar clientInfo para o prompt
  const clientInfoText = formatClientInfo(clientInfo)

  const prompt = GENERATE_QUERIES_PROMPT.replace("{clientInfo}", clientInfoText)

  try {
    const response = await llm.invoke(prompt)
    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content)

    // Extrair JSON da resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn(
        "[generateQueries] Não foi possível extrair JSON, usando fallback"
      )
      return generateFallbackQueries(clientInfo)
    }

    const parsed = JSON.parse(jsonMatch[0])
    const validated = GeneratedQueriesSchema.parse(parsed)

    console.log(
      `[generateQueries] Geradas ${validated.queries.length} queries com modelo ${model}`
    )

    return validated
  } catch (error) {
    console.error("[generateQueries] Erro ao gerar queries:", error)
    return generateFallbackQueries(clientInfo)
  }
}

/**
 * Formata os dados do cliente para o prompt
 */
function formatClientInfo(info: ClientInfoForQueries): string {
  const parts: string[] = []

  if (info.age !== undefined) {
    parts.push(`- Idade: ${info.age} anos`)
  }

  if (info.city || info.state) {
    parts.push(
      `- Localização: ${info.city || ""}${info.city && info.state ? ", " : ""}${info.state || ""}`
    )
  }

  if (info.budget !== undefined) {
    parts.push(`- Orçamento: até R$ ${info.budget.toLocaleString("pt-BR")}/mês`)
  }

  if (info.dependents && info.dependents.length > 0) {
    const depsText = info.dependents
      .map(d => {
        const parts = []
        if (d.relationship) parts.push(d.relationship)
        if (d.age !== undefined) parts.push(`${d.age} anos`)
        return parts.join(", ")
      })
      .join("; ")
    parts.push(`- Dependentes: ${depsText}`)
  }

  if (info.preExistingConditions && info.preExistingConditions.length > 0) {
    parts.push(
      `- Condições pré-existentes: ${info.preExistingConditions.join(", ")}`
    )
  }

  if (info.preferences && info.preferences.length > 0) {
    parts.push(`- Preferências: ${info.preferences.join(", ")}`)
  }

  return parts.length > 0 ? parts.join("\n") : "Nenhuma informação disponível"
}

/**
 * Gera queries de fallback quando LLM falha
 */
function generateFallbackQueries(
  clientInfo: ClientInfoForQueries
): GeneratedQueries {
  const queries: GeneratedQueries["queries"] = []

  // Query 1: Perfil básico
  const profileParts: string[] = ["plano de saúde"]
  if (clientInfo.age !== undefined) {
    profileParts.push(`para pessoa de ${clientInfo.age} anos`)
  }
  if (clientInfo.city) {
    profileParts.push(`em ${clientInfo.city}`)
  }

  queries.push({
    query: profileParts.join(" "),
    focus: "profile",
    priority: 1
  })

  // Query 2: Cobertura
  queries.push({
    query: "cobertura plano de saúde consultas exames internação",
    focus: "coverage",
    priority: 2
  })

  // Query 3: Preço (se tem orçamento)
  if (clientInfo.budget !== undefined) {
    queries.push({
      query: `plano de saúde até ${clientInfo.budget} reais mensais custo benefício`,
      focus: "price",
      priority: 3
    })
  }

  // Query 4: Dependentes (se tem)
  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const hasChildren = clientInfo.dependents.some(
      d => d.age !== undefined && d.age < 18
    )
    queries.push({
      query: hasChildren
        ? "plano de saúde familiar com cobertura para crianças pediatria"
        : "plano de saúde familiar casal cobertura completa",
      focus: "dependents",
      priority: 3
    })
  }

  // Query 5: Condições (se tem)
  if (
    clientInfo.preExistingConditions &&
    clientInfo.preExistingConditions.length > 0
  ) {
    queries.push({
      query: `plano de saúde ${clientInfo.preExistingConditions.join(" ")} cobertura tratamento`,
      focus: "conditions",
      priority: 2
    })
  }

  // Garantir mínimo de 3 queries
  while (queries.length < 3) {
    queries.push({
      query: "melhores planos de saúde Brasil cobertura ampla rede credenciada",
      focus: "general",
      priority: 5
    })
  }

  return { queries: queries.slice(0, 5) }
}

/**
 * Extrai apenas as strings de query para uso direto na busca
 */
export function extractQueryStrings(generated: GeneratedQueries): string[] {
  return generated.queries
    .sort((a, b) => a.priority - b.priority)
    .map(q => q.query)
}
