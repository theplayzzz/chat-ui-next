/**
 * Tests for filter-by-budget.ts
 *
 * Testa o filtro de compatibilidade matemática por preço.
 */

import { describe, it, expect } from "vitest"
import {
  getAgeBand,
  getAgeBandName,
  extractPricesFromContent,
  filterByBudget,
  countCompatiblePlans,
  type PlanPricing
} from "../filter-by-budget"
import type { FusedDocument } from "../result-fusion"

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestDocument = (
  id: string,
  content: string,
  operator?: string
): FusedDocument => ({
  id,
  content,
  score: 0.8,
  metadata: { operator }
})

// Conteúdo de exemplo com tabela de preços
const SAMPLE_TABLE_CONTENT = `
# Tabela de Preços - Nexus Sudeste Total (NST)

| Categoria | Faixa 1 (0-18) | Faixa 2 (19-38) | Faixa 3 (39-59) | Faixa 4 (60-75) | Faixa 5 (76+) |
|-----------|----------------|-----------------|-----------------|-----------------|---------------|
| **Local Essencial** | R$ 150,00 | R$ 180,00 | R$ 280,00 | R$ 450,00 | R$ 680,00 |
| **Regional Plus** | R$ 250,00 | R$ 300,00 | R$ 450,00 | R$ 700,00 | R$ 1.050,00 |
| **Executivo Nacional** | R$ 600,00 | R$ 750,00 | R$ 1.100,00 | R$ 1.800,00 | R$ 2.700,00 |

Cobertura: Regional SP
`

const SAMPLE_SIMPLE_TABLE = `
# Planos MGA Platinum Access

| **A** | Essential Care | R$ 200,00 |
| **B** | Premium Select | R$ 450,00 |
| **C** | Executive Gold | R$ 800,00 |

Cobertura nacional.
`

const GENERAL_INFO_CONTENT = `
# Como escolher um plano de saúde

Ao escolher um plano de saúde, considere:
- Cobertura geográfica
- Rede credenciada
- Carência
- Coparticipação

Consulte sempre a ANS.
`

// =============================================================================
// Tests: getAgeBand
// =============================================================================

describe("getAgeBand", () => {
  it("should return band 1 for ages 0-18", () => {
    expect(getAgeBand(0)).toBe(1)
    expect(getAgeBand(10)).toBe(1)
    expect(getAgeBand(18)).toBe(1)
  })

  it("should return band 2 for ages 19-38", () => {
    expect(getAgeBand(19)).toBe(2)
    expect(getAgeBand(25)).toBe(2)
    expect(getAgeBand(38)).toBe(2)
  })

  it("should return band 3 for ages 39-59", () => {
    expect(getAgeBand(39)).toBe(3)
    expect(getAgeBand(50)).toBe(3)
    expect(getAgeBand(59)).toBe(3)
  })

  it("should return band 4 for ages 60-75", () => {
    expect(getAgeBand(60)).toBe(4)
    expect(getAgeBand(68)).toBe(4)
    expect(getAgeBand(75)).toBe(4)
  })

  it("should return band 5 for ages 76+", () => {
    expect(getAgeBand(76)).toBe(5)
    expect(getAgeBand(85)).toBe(5)
    expect(getAgeBand(100)).toBe(5)
  })
})

describe("getAgeBandName", () => {
  it("should return correct names for all bands", () => {
    expect(getAgeBandName(1)).toBe("0-18 anos")
    expect(getAgeBandName(2)).toBe("19-38 anos")
    expect(getAgeBandName(3)).toBe("39-59 anos")
    expect(getAgeBandName(4)).toBe("60-75 anos")
    expect(getAgeBandName(5)).toBe("76+ anos")
  })

  it("should return 'desconhecida' for invalid band", () => {
    expect(getAgeBandName(0)).toBe("desconhecida")
    expect(getAgeBandName(6)).toBe("desconhecida")
  })
})

// =============================================================================
// Tests: extractPricesFromContent
// =============================================================================

describe("extractPricesFromContent", () => {
  it("should extract prices from full table format", () => {
    const prices = extractPricesFromContent(SAMPLE_TABLE_CONTENT)

    expect(prices.length).toBeGreaterThan(0)

    const localEssencial = prices.find(p =>
      p.planName.toLowerCase().includes("local essencial")
    )
    expect(localEssencial).toBeDefined()
    expect(localEssencial?.pricesByAgeBand.band1).toBe(150)
    expect(localEssencial?.pricesByAgeBand.band2).toBe(180)
    expect(localEssencial?.pricesByAgeBand.band3).toBe(280)
  })

  it("should detect operator from content", () => {
    const prices = extractPricesFromContent(SAMPLE_TABLE_CONTENT)

    if (prices.length > 0) {
      expect(prices[0].operator).toContain("Nexus")
    }
  })

  it("should extract prices from simple table format", () => {
    const prices = extractPricesFromContent(SAMPLE_SIMPLE_TABLE)

    expect(prices.length).toBeGreaterThan(0)

    const essentialCare = prices.find(p =>
      p.planName.toLowerCase().includes("essential")
    )
    // Preço base vai para band2
    expect(essentialCare?.pricesByAgeBand.band2).toBe(200)
  })

  it("should return empty array for content without prices", () => {
    const prices = extractPricesFromContent(GENERAL_INFO_CONTENT)
    expect(prices).toEqual([])
  })

  it("should handle various price formats", () => {
    const content = `
    | Plano A | R$ 100,00 | R$ 200,00 | R$ 300,00 | R$ 400,00 | R$ 500,00 |
    | Plano B | R$150,00 | R$250,00 | R$350,00 | R$450,00 | R$550,00 |
    `
    const prices = extractPricesFromContent(content)

    expect(prices.length).toBe(2)
  })
})

// =============================================================================
// Tests: filterByBudget
// =============================================================================

describe("filterByBudget", () => {
  it("should return all docs when age or budget not provided", () => {
    const docs = [
      createTestDocument("1", SAMPLE_TABLE_CONTENT),
      createTestDocument("2", GENERAL_INFO_CONTENT)
    ]

    const result = filterByBudget(docs, { name: "João" })

    expect(result.compatibleDocs.length).toBe(2)
    expect(result.incompatibleDocs.length).toBe(0)
  })

  it("should filter docs by budget compatibility", () => {
    const docs = [
      createTestDocument("1", SAMPLE_TABLE_CONTENT, "NST"), // Has plans from R$180
      createTestDocument("2", GENERAL_INFO_CONTENT) // No price info
    ]

    // Cliente jovem (30 anos = band 2) com orçamento R$200
    const result = filterByBudget(docs, {
      name: "João",
      age: 30,
      budget: 200
    })

    // Documento com tabela deve ser compatível (Local Essencial = R$180 <= R$200)
    expect(result.compatibleDocs.length).toBe(2)
    expect(result.stats.noPriceInfo).toBe(1) // Documento de info geral
  })

  it("should filter out expensive plans for low budget", () => {
    const docs = [createTestDocument("1", SAMPLE_TABLE_CONTENT, "NST")]

    // Cliente com orçamento muito baixo (R$100)
    const result = filterByBudget(docs, {
      name: "Maria",
      age: 30,
      budget: 100
    })

    // Nenhum plano cabe no orçamento (mínimo é R$180)
    expect(result.incompatibleDocs.length).toBe(1)
  })

  it("should consider age band when filtering", () => {
    const docs = [createTestDocument("1", SAMPLE_TABLE_CONTENT, "NST")]

    // Cliente idoso (65 anos = band 4) com orçamento R$500
    const result = filterByBudget(docs, {
      name: "José",
      age: 65,
      budget: 500
    })

    // Local Essencial band 4 = R$450 <= R$500 (compatível)
    expect(result.compatibleDocs.length).toBe(1)
  })

  it("should return correct stats", () => {
    const docs = [
      createTestDocument("1", SAMPLE_TABLE_CONTENT),
      createTestDocument("2", GENERAL_INFO_CONTENT),
      createTestDocument(
        "3",
        "| Plano Caro | R$ 5000 | R$ 6000 | R$ 7000 | R$ 8000 | R$ 10000 |"
      )
    ]

    const result = filterByBudget(docs, {
      name: "Ana",
      age: 30,
      budget: 300
    })

    expect(result.stats.total).toBe(3)
    expect(result.stats.noPriceInfo).toBe(1)
  })
})

// =============================================================================
// Tests: countCompatiblePlans
// =============================================================================

describe("countCompatiblePlans", () => {
  it("should count unique compatible plans", () => {
    const docs = [createTestDocument("1", SAMPLE_TABLE_CONTENT)]

    // Budget R$200, age 30 (band 2)
    // Local Essencial = R$180 ✓
    // Regional Plus = R$300 ✗
    // Executivo = R$750 ✗
    const count = countCompatiblePlans(docs, 30, 200)

    expect(count).toBeGreaterThanOrEqual(1)
  })

  it("should return 0 when no plans fit budget", () => {
    const docs = [createTestDocument("1", SAMPLE_TABLE_CONTENT)]

    const count = countCompatiblePlans(docs, 30, 50) // Muito baixo

    expect(count).toBe(0)
  })

  it("should count all plans when budget is high", () => {
    const docs = [createTestDocument("1", SAMPLE_TABLE_CONTENT)]

    const count = countCompatiblePlans(docs, 30, 1000) // Alto

    expect(count).toBeGreaterThanOrEqual(2) // Pelo menos 2 planos
  })

  it("should not double count plans from multiple docs", () => {
    const docs = [
      createTestDocument("1", SAMPLE_TABLE_CONTENT),
      createTestDocument("2", SAMPLE_TABLE_CONTENT) // Mesmo conteúdo
    ]

    const count = countCompatiblePlans(docs, 30, 1000)

    // Não deve duplicar
    expect(count).toBeLessThanOrEqual(5)
  })
})

// =============================================================================
// Tests: Edge Cases
// =============================================================================

describe("Edge Cases", () => {
  it("should handle empty documents array", () => {
    const result = filterByBudget([], { name: "Test", age: 30, budget: 500 })

    expect(result.compatibleDocs).toEqual([])
    expect(result.incompatibleDocs).toEqual([])
    expect(result.stats.total).toBe(0)
  })

  it("should handle documents with malformed price tables", () => {
    const doc = createTestDocument(
      "1",
      "| This | Is | Not | A | Price | Table |"
    )
    const result = filterByBudget([doc], {
      name: "Test",
      age: 30,
      budget: 500
    })

    // Should treat as no price info and keep the doc
    expect(result.compatibleDocs.length).toBe(1)
    expect(result.stats.noPriceInfo).toBe(1)
  })

  it("should handle very young clients (band 1)", () => {
    const docs = [createTestDocument("1", SAMPLE_TABLE_CONTENT)]

    const result = filterByBudget(docs, {
      name: "Bebê",
      age: 5,
      budget: 200
    })

    // Band 1 prices are usually lower
    expect(result.compatibleDocs.length).toBe(1)
  })

  it("should handle very old clients (band 5)", () => {
    const docs = [createTestDocument("1", SAMPLE_TABLE_CONTENT)]

    const result = filterByBudget(docs, {
      name: "Idoso",
      age: 80,
      budget: 700
    })

    // Band 5 (76+): Local Essencial = R$680 <= R$700 ✓
    expect(result.compatibleDocs.length).toBe(1)
  })
})
