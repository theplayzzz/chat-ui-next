/**
 * Testes para generate-queries.ts
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Fase 6A.4: > 10 casos de teste
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  generateQueries,
  extractQueryStrings,
  GeneratedQueriesSchema,
  type ClientInfoForQueries,
  type GeneratedQueries
} from "../generate-queries"

// Mock do ChatOpenAI usando vi.hoisted para que a classe seja definida antes do mock
const { MockChatOpenAI } = vi.hoisted(() => {
  return {
    MockChatOpenAI: class {
      async invoke() {
        return {
          content: JSON.stringify({
            queries: [
              {
                query: "plano de saúde para pessoa de 35 anos em São Paulo",
                focus: "profile",
                priority: 1
              },
              {
                query: "cobertura completa consultas exames internação",
                focus: "coverage",
                priority: 2
              },
              {
                query: "plano de saúde familiar com dependentes crianças",
                focus: "dependents",
                priority: 3
              }
            ]
          })
        }
      }
    }
  }
})

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: MockChatOpenAI
}))

describe("generateQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Teste 1: Perfil básico com idade e cidade
  it("should generate queries for basic profile with age and city", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 35,
      city: "São Paulo",
      state: "SP"
    }

    const result = await generateQueries(clientInfo)

    expect(result.queries).toBeDefined()
    expect(result.queries.length).toBeGreaterThanOrEqual(3)
    expect(result.queries.length).toBeLessThanOrEqual(5)
  })

  // Teste 2: Perfil com orçamento
  it("should generate queries considering budget", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 45,
      budget: 800
    }

    const result = await generateQueries(clientInfo)

    expect(result.queries).toBeDefined()
    expect(
      result.queries.some(q => q.focus === "profile" || q.focus === "price")
    ).toBe(true)
  })

  // Teste 3: Perfil com dependentes
  it("should generate queries for profile with dependents", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 40,
      dependents: [
        { age: 10, relationship: "filho" },
        { age: 38, relationship: "esposa" }
      ]
    }

    const result = await generateQueries(clientInfo)

    expect(result.queries).toBeDefined()
    expect(result.queries.length).toBeGreaterThanOrEqual(3)
  })

  // Teste 4: Perfil com condições pré-existentes
  it("should generate queries for profile with pre-existing conditions", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 55,
      preExistingConditions: ["diabetes", "hipertensão"]
    }

    const result = await generateQueries(clientInfo)

    expect(result.queries).toBeDefined()
    expect(result.queries.length).toBeGreaterThanOrEqual(3)
  })

  // Teste 5: Perfil vazio (fallback)
  it("should generate fallback queries for empty profile", async () => {
    const clientInfo: ClientInfoForQueries = {}

    const result = await generateQueries(clientInfo)

    expect(result.queries).toBeDefined()
    expect(result.queries.length).toBeGreaterThanOrEqual(3)
  })

  // Teste 6: Validação do schema
  it("should return valid schema-compliant response", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 30,
      city: "Rio de Janeiro"
    }

    const result = await generateQueries(clientInfo)

    // Validar com Zod
    const parsed = GeneratedQueriesSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  // Teste 7: Cada query tem foco diferente
  it("should generate queries with varied focus areas", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 28,
      city: "Curitiba",
      budget: 500
    }

    const result = await generateQueries(clientInfo)

    const focuses = result.queries.map(q => q.focus)
    // Deve ter pelo menos 2 focos diferentes
    const uniqueFocuses = new Set(focuses)
    expect(uniqueFocuses.size).toBeGreaterThanOrEqual(2)
  })

  // Teste 8: Prioridades válidas (1-5)
  it("should assign valid priorities to queries", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 50
    }

    const result = await generateQueries(clientInfo)

    for (const query of result.queries) {
      expect(query.priority).toBeGreaterThanOrEqual(1)
      expect(query.priority).toBeLessThanOrEqual(5)
    }
  })

  // Teste 9: Queries não estão vazias
  it("should generate non-empty query strings", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 25,
      city: "Belo Horizonte"
    }

    const result = await generateQueries(clientInfo)

    for (const query of result.queries) {
      expect(query.query.length).toBeGreaterThan(10)
    }
  })

  // Teste 10: Modelo configurável
  it("should accept different model configurations", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 30
    }

    // Não deve lançar erro com modelos diferentes
    await expect(
      generateQueries(clientInfo, "gpt-5-mini")
    ).resolves.toBeDefined()
    await expect(generateQueries(clientInfo, "gpt-4o")).resolves.toBeDefined()
  })

  // Teste 11: Perfil completo
  it("should handle complete client profile", async () => {
    const clientInfo: ClientInfoForQueries = {
      age: 42,
      city: "São Paulo",
      state: "SP",
      budget: 1200,
      dependents: [
        { age: 12, relationship: "filho" },
        { age: 8, relationship: "filha" },
        { age: 40, relationship: "esposa" }
      ],
      preExistingConditions: ["asma"],
      preferences: ["rede ampla", "sem coparticipação"]
    }

    const result = await generateQueries(clientInfo)

    expect(result.queries).toBeDefined()
    expect(result.queries.length).toBeGreaterThanOrEqual(3)
  })

  // Teste 12: Apenas estado (sem cidade)
  it("should generate queries with only state info", async () => {
    const clientInfo: ClientInfoForQueries = {
      state: "MG"
    }

    const result = await generateQueries(clientInfo)

    expect(result.queries).toBeDefined()
    expect(result.queries.length).toBeGreaterThanOrEqual(3)
  })
})

describe("extractQueryStrings", () => {
  // Teste 13: Extrai strings ordenadas por prioridade
  it("should extract query strings sorted by priority", () => {
    const generated: GeneratedQueries = {
      queries: [
        { query: "query 3", focus: "general", priority: 3 },
        { query: "query 1", focus: "profile", priority: 1 },
        { query: "query 2", focus: "coverage", priority: 2 }
      ]
    }

    const strings = extractQueryStrings(generated)

    expect(strings).toEqual(["query 1", "query 2", "query 3"])
  })

  // Teste 14: Retorna array vazio para queries vazias
  it("should handle empty queries array", () => {
    const generated: GeneratedQueries = {
      queries: []
    }

    // Schema não permite menos de 3, mas função deve ser robusta
    const strings = extractQueryStrings(generated)

    expect(strings).toEqual([])
  })
})

describe("GeneratedQueriesSchema", () => {
  // Teste 15: Rejeita queries com menos de 3 itens
  it("should reject queries with less than 3 items", () => {
    const invalid = {
      queries: [
        { query: "query 1", focus: "profile", priority: 1 },
        { query: "query 2", focus: "coverage", priority: 2 }
      ]
    }

    const result = GeneratedQueriesSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  // Teste 16: Rejeita queries com mais de 5 itens
  it("should reject queries with more than 5 items", () => {
    const invalid = {
      queries: Array(6).fill({
        query: "query test with minimum length",
        focus: "general",
        priority: 3
      })
    }

    const result = GeneratedQueriesSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  // Teste 17: Rejeita focus inválido
  it("should reject invalid focus values", () => {
    const invalid = {
      queries: [
        {
          query: "query 1 test min length",
          focus: "invalid_focus",
          priority: 1
        },
        { query: "query 2 test min length", focus: "profile", priority: 2 },
        { query: "query 3 test min length", focus: "coverage", priority: 3 }
      ]
    }

    const result = GeneratedQueriesSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  // Teste 18: Rejeita prioridade fora do range
  it("should reject priority out of range", () => {
    const invalid = {
      queries: [
        { query: "query 1 test min length", focus: "profile", priority: 0 },
        { query: "query 2 test min length", focus: "coverage", priority: 2 },
        { query: "query 3 test min length", focus: "general", priority: 3 }
      ]
    }

    const result = GeneratedQueriesSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})
