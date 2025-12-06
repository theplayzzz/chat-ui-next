/**
 * Filter By Budget - Filtro de Compatibilidade Matemática
 *
 * Filtra documentos RAG baseado em compatibilidade real de preço × faixa etária.
 * Extrai preços do conteúdo textual e verifica se cabe no orçamento do cliente.
 *
 * PRD: Complemento ao RF-005 (grading semântico) com filtro matemático
 */

import type { FusedDocument } from "./result-fusion"
import type { ClientInfoForQueries } from "./generate-queries"

// =============================================================================
// Types
// =============================================================================

export interface PlanPricing {
  planName: string
  operator: string
  category?: string
  pricesByAgeBand: {
    band1?: number // 0-18
    band2?: number // 19-38
    band3?: number // 39-59
    band4?: number // 60-75
    band5?: number // 76+
  }
}

export interface FilterByBudgetResult {
  compatibleDocs: FusedDocument[]
  incompatibleDocs: FusedDocument[]
  stats: {
    total: number
    compatible: number
    incompatible: number
    noPriceInfo: number
  }
}

// =============================================================================
// Age Band Determination
// =============================================================================

/**
 * Determina a faixa etária baseada na idade
 * Faixas ANS padrão:
 * - Faixa 1: 0-18 anos
 * - Faixa 2: 19-38 anos (ou 19-23, 24-28, 29-33, 34-38 detalhado)
 * - Faixa 3: 39-59 anos (ou 39-43, 44-48, 49-53, 54-58 detalhado)
 * - Faixa 4: 60-75 anos (ou 59+ simplificado)
 * - Faixa 5: 76+ anos
 */
export function getAgeBand(age: number): number {
  if (age <= 18) return 1
  if (age <= 38) return 2
  if (age <= 59) return 3
  if (age <= 75) return 4
  return 5
}

/**
 * Retorna o nome da faixa etária para logs
 */
export function getAgeBandName(band: number): string {
  const names: Record<number, string> = {
    1: "0-18 anos",
    2: "19-38 anos",
    3: "39-59 anos",
    4: "60-75 anos",
    5: "76+ anos"
  }
  return names[band] || "desconhecida"
}

// =============================================================================
// Price Extraction from Content
// =============================================================================

/**
 * Extrai preços de tabelas em formato Markdown do conteúdo
 *
 * Padrões reconhecidos:
 * - "R$ 180,00" ou "R$180,00"
 * - "Faixa 2: 19-38 anos" com preço associado
 * - Tabelas com colunas de faixas etárias
 */
export function extractPricesFromContent(content: string): PlanPricing[] {
  const plans: PlanPricing[] = []

  // Padrão 1: Tabelas de preços por faixa etária
  // | Categoria | Faixa 1 (0-18) | Faixa 2 (19-38) | ...
  const tableRowPattern =
    /\|\s*\*?\*?([^|]+?)\*?\*?\s*\|\s*R?\$?\s*([\d.,]+)\s*\|\s*\*?\*?R?\$?\s*([\d.,]+)\*?\*?\s*\|\s*R?\$?\s*([\d.,]+)\s*\|\s*R?\$?\s*([\d.,]+)\s*\|\s*R?\$?\s*([\d.,]+)\s*\|/gi

  let match
  while ((match = tableRowPattern.exec(content)) !== null) {
    const planName = match[1].trim().replace(/\*+/g, "")

    // Ignorar headers
    if (
      planName.toLowerCase().includes("categoria") ||
      planName.toLowerCase().includes("nível") ||
      planName.toLowerCase().includes("faixa")
    ) {
      continue
    }

    const pricing: PlanPricing = {
      planName,
      operator: detectOperator(content),
      pricesByAgeBand: {
        band1: parsePrice(match[2]),
        band2: parsePrice(match[3]),
        band3: parsePrice(match[4]),
        band4: parsePrice(match[5]),
        band5: parsePrice(match[6])
      }
    }

    if (hasValidPrices(pricing)) {
      plans.push(pricing)
    }
  }

  // Padrão 2: Tabela base simples
  // | **A** | Local Essencial | R$ 180,00 |
  const baseTablePattern =
    /\|\s*\*?\*?([A-E\d])\*?\*?\s*\|\s*([^|]+?)\s*\|\s*R?\$?\s*([\d.,]+)\s*\|/gi

  while ((match = baseTablePattern.exec(content)) !== null) {
    const category = match[1].trim()
    const planName = match[2].trim()
    const basePrice = parsePrice(match[3])

    if (basePrice && basePrice > 0) {
      // Verificar se já não foi extraído
      const exists = plans.some(
        p => p.planName.toLowerCase() === planName.toLowerCase()
      )
      if (!exists) {
        plans.push({
          planName,
          operator: detectOperator(content),
          category,
          pricesByAgeBand: {
            band2: basePrice // Preço base é geralmente Faixa 2
          }
        })
      }
    }
  }

  return plans
}

/**
 * Detecta a operadora do conteúdo
 */
function detectOperator(content: string): string {
  if (content.includes("NEXUS") || content.includes("NST")) {
    return "Nexus Sudeste Total"
  }
  if (content.includes("PLATINUM") || content.includes("MGA")) {
    return "MGA Platinum Access"
  }
  if (content.includes("Einstein")) {
    return "Einstein"
  }
  return "Desconhecida"
}

/**
 * Converte string de preço para número
 */
function parsePrice(priceStr: string | undefined): number | undefined {
  if (!priceStr) return undefined

  // Remove R$, espaços e converte vírgula para ponto
  const cleaned = priceStr
    .replace(/R\$\s*/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "") // Remove pontos de milhar
    .replace(",", ".") // Vírgula decimal para ponto

  const value = parseFloat(cleaned)
  return isNaN(value) ? undefined : value
}

/**
 * Verifica se o pricing tem pelo menos um preço válido
 */
function hasValidPrices(pricing: PlanPricing): boolean {
  const prices = pricing.pricesByAgeBand
  return !!(
    prices.band1 ||
    prices.band2 ||
    prices.band3 ||
    prices.band4 ||
    prices.band5
  )
}

// =============================================================================
// Main Filter Function
// =============================================================================

/**
 * Filtra documentos por compatibilidade de orçamento
 *
 * @param documents - Documentos do RAG (após grading)
 * @param clientInfo - Dados do cliente incluindo idade e orçamento
 * @returns Documentos filtrados por compatibilidade
 */
export function filterByBudget(
  documents: FusedDocument[],
  clientInfo: ClientInfoForQueries
): FilterByBudgetResult {
  const { age, budget } = clientInfo

  // Se não temos idade ou orçamento, retornar todos
  if (age === undefined || budget === undefined) {
    console.log(
      "[filterByBudget] Sem idade ou orçamento - retornando todos os documentos"
    )
    return {
      compatibleDocs: documents,
      incompatibleDocs: [],
      stats: {
        total: documents.length,
        compatible: documents.length,
        incompatible: 0,
        noPriceInfo: 0
      }
    }
  }

  const ageBand = getAgeBand(age)
  console.log(
    `[filterByBudget] Filtrando para idade ${age} (${getAgeBandName(ageBand)}), orçamento R$${budget}`
  )

  const compatibleDocs: FusedDocument[] = []
  const incompatibleDocs: FusedDocument[] = []
  let noPriceInfo = 0

  for (const doc of documents) {
    const prices = extractPricesFromContent(doc.content)

    if (prices.length === 0) {
      // Documento sem informação de preço - manter (pode ser info geral)
      noPriceInfo++
      compatibleDocs.push(doc)
      continue
    }

    // Verificar se algum plano no documento é compatível
    let hasCompatiblePlan = false
    const compatiblePlans: string[] = []

    for (const plan of prices) {
      const priceForBand = getPriceForAgeBand(plan, ageBand)

      if (priceForBand !== undefined && priceForBand <= budget) {
        hasCompatiblePlan = true
        compatiblePlans.push(`${plan.planName}: R$${priceForBand}`)
      }
    }

    if (hasCompatiblePlan) {
      // Documento compatível - mantém no resultado
      // Log dos planos compatíveis encontrados neste documento
      console.log(
        `[filterByBudget] Doc compatível: ${compatiblePlans.join(", ")}`
      )
      compatibleDocs.push(doc)
    } else {
      incompatibleDocs.push(doc)
    }
  }

  console.log(
    `[filterByBudget] Resultado: ${compatibleDocs.length} compatíveis, ${incompatibleDocs.length} incompatíveis, ${noPriceInfo} sem preço`
  )

  return {
    compatibleDocs,
    incompatibleDocs,
    stats: {
      total: documents.length,
      compatible: compatibleDocs.length,
      incompatible: incompatibleDocs.length,
      noPriceInfo
    }
  }
}

/**
 * Obtém o preço para uma faixa etária específica
 */
function getPriceForAgeBand(
  plan: PlanPricing,
  ageBand: number
): number | undefined {
  const prices = plan.pricesByAgeBand

  switch (ageBand) {
    case 1:
      return prices.band1
    case 2:
      return prices.band2
    case 3:
      return prices.band3
    case 4:
      return prices.band4
    case 5:
      return prices.band5
    default:
      return prices.band2 // Fallback para faixa 2
  }
}

/**
 * Conta planos compatíveis em uma lista de documentos
 */
export function countCompatiblePlans(
  documents: FusedDocument[],
  age: number,
  budget: number
): number {
  const ageBand = getAgeBand(age)
  const allPlans = new Set<string>()

  for (const doc of documents) {
    const prices = extractPricesFromContent(doc.content)

    for (const plan of prices) {
      const priceForBand = getPriceForAgeBand(plan, ageBand)

      if (priceForBand !== undefined && priceForBand <= budget) {
        allPlans.add(plan.planName.toLowerCase())
      }
    }
  }

  return allPlans.size
}
