/**
 * Testes para a tool extractClientInfo
 *
 * Cobertura de cenários:
 * - Extração completa em uma mensagem
 * - Extração incremental (múltiplas mensagens)
 * - Dependentes múltiplos
 * - Condições pré-existentes complexas
 * - Campos faltantes detectados corretamente
 * - Validação Zod rejeitando dados inválidos
 * - JSON malformado tratado gracefully
 * - Valores edge
 */

// Testes usando Jest (test runner do projeto)
import {
  parseClientInfo,
  detectMissingFields,
  mergeClientInfo,
  validateClientInfoComplete,
  validateBusinessRules,
  getNextFieldToCollect
} from "../validators/missing-fields-detector"
import {
  calculateCompleteness,
  type PartialClientInfo
} from "../schemas/client-info-schema"

describe("parseClientInfo", () => {
  it("deve parsear JSON válido corretamente", () => {
    const validJson = JSON.stringify({
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800
    })

    const result = parseClientInfo(validJson)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data?.age).toBe(35)
    expect(result.data?.city).toBe("São Paulo")
    expect(result.data?.state).toBe("SP")
    expect(result.data?.budget).toBe(800)
  })

  it("deve rejeitar JSON inválido", () => {
    const invalidJson = "{ age: 35, invalid json }"

    const result = parseClientInfo(invalidJson)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors?.[0]).toContain("JSON inválido")
  })

  it("deve validar schema Zod corretamente", () => {
    const invalidData = JSON.stringify({
      age: -5, // idade negativa inválida
      city: "São Paulo",
      state: "SP",
      budget: 800
    })

    const result = parseClientInfo(invalidData)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it("deve aceitar informações parciais", () => {
    const partialJson = JSON.stringify({
      age: 35,
      city: "São Paulo"
      // state e budget faltando
    })

    const result = parseClientInfo(partialJson)

    expect(result.success).toBe(true)
    expect(result.data?.age).toBe(35)
    expect(result.data?.state).toBeUndefined()
  })
})

describe("detectMissingFields", () => {
  it("deve detectar todos os campos obrigatórios faltantes", () => {
    const emptyInfo: PartialClientInfo = {}

    const missing = detectMissingFields(emptyInfo)

    expect(missing.length).toBeGreaterThan(0)
    const requiredMissing = missing.filter(m => m.isRequired)
    expect(requiredMissing).toHaveLength(4) // age, city, state, budget
  })

  it("deve detectar apenas campos realmente faltantes", () => {
    const completeInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800,
      dependents: [],
      preExistingConditions: [],
      medications: []
    }

    const missing = detectMissingFields(completeInfo)
    const requiredMissing = missing.filter(m => m.isRequired)

    expect(requiredMissing).toHaveLength(0)
  })

  it("deve priorizar campos obrigatórios", () => {
    const partialInfo: PartialClientInfo = {
      age: 35
      // Faltam city, state, budget (obrigatórios)
    }

    const missing = detectMissingFields(partialInfo)

    expect(missing[0].priority).toBe(1)
    expect(missing[0].isRequired).toBe(true)
  })
})

describe("mergeClientInfo", () => {
  it("deve fazer merge de informações novas com existentes", () => {
    const existing: PartialClientInfo = {
      age: 35,
      city: "São Paulo"
    }

    const updates: PartialClientInfo = {
      state: "SP",
      budget: 800
    }

    const merged = mergeClientInfo(existing, updates)

    expect(merged.age).toBe(35)
    expect(merged.city).toBe("São Paulo")
    expect(merged.state).toBe("SP")
    expect(merged.budget).toBe(800)
  })

  it("deve substituir valores existentes com novos valores", () => {
    const existing: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      budget: 500
    }

    const updates: PartialClientInfo = {
      budget: 800 // Novo orçamento
    }

    const merged = mergeClientInfo(existing, updates)

    expect(merged.budget).toBe(800)
  })

  it("deve manter valores existentes se novos são undefined", () => {
    const existing: PartialClientInfo = {
      age: 35,
      city: "São Paulo"
    }

    const updates: PartialClientInfo = {
      state: "SP"
      // age e city não fornecidos
    }

    const merged = mergeClientInfo(existing, updates)

    expect(merged.age).toBe(35)
    expect(merged.city).toBe("São Paulo")
  })

  it("deve fazer merge de arrays corretamente", () => {
    const existing: PartialClientInfo = {
      age: 35,
      dependents: [{ relationship: "spouse", age: 32 }]
    }

    const updates: PartialClientInfo = {
      dependents: [
        { relationship: "spouse", age: 32 },
        { relationship: "child", age: 5 }
      ]
    }

    const merged = mergeClientInfo(existing, updates)

    expect(merged.dependents).toHaveLength(2)
  })
})

describe("validateClientInfoComplete", () => {
  it("deve validar informação completa como true", () => {
    const completeInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800
    }

    expect(validateClientInfoComplete(completeInfo)).toBe(true)
  })

  it("deve validar informação incompleta como false", () => {
    const incompleteInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo"
      // Faltam state e budget
    }

    expect(validateClientInfoComplete(incompleteInfo)).toBe(false)
  })
})

describe("calculateCompleteness", () => {
  it("deve calcular 100% para informação totalmente completa", () => {
    const completeInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800,
      dependents: [{ relationship: "spouse", age: 32 }],
      preExistingConditions: ["diabetes"],
      medications: ["metformina"],
      preferences: {
        networkType: "broad"
      }
    }

    const completeness = calculateCompleteness(completeInfo)

    expect(completeness).toBe(100)
  })

  it("deve calcular porcentagem correta para informação parcial", () => {
    const partialInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800
      // Campos opcionais faltando
    }

    const completeness = calculateCompleteness(partialInfo)

    expect(completeness).toBeGreaterThan(0)
    expect(completeness).toBeLessThan(100)
  })

  it("deve retornar 0% para informação vazia", () => {
    const emptyInfo: PartialClientInfo = {}

    const completeness = calculateCompleteness(emptyInfo)

    expect(completeness).toBe(0)
  })
})

describe("validateBusinessRules", () => {
  it("deve gerar warning para titular menor de 18", () => {
    const info: PartialClientInfo = {
      age: 16,
      city: "São Paulo",
      state: "SP",
      budget: 500
    }

    const warnings = validateBusinessRules(info)

    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.includes("menor de 18"))).toBe(true)
  })

  it("deve gerar warning para titular acima de 70", () => {
    const info: PartialClientInfo = {
      age: 75,
      city: "São Paulo",
      state: "SP",
      budget: 1200
    }

    const warnings = validateBusinessRules(info)

    expect(warnings.some(w => w.includes("70 anos"))).toBe(true)
  })

  it("deve gerar warning para dependentes idosos", () => {
    const info: PartialClientInfo = {
      age: 45,
      city: "São Paulo",
      state: "SP",
      budget: 2000,
      dependents: [{ relationship: "parent", age: 72 }]
    }

    const warnings = validateBusinessRules(info)

    expect(warnings.some(w => w.includes("60 anos"))).toBe(true)
  })

  it("deve gerar warning para orçamento muito baixo", () => {
    const info: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 150,
      dependents: [
        { relationship: "spouse", age: 32 },
        { relationship: "child", age: 5 }
      ]
    }

    const warnings = validateBusinessRules(info)

    expect(warnings.some(w => w.includes("insuficiente"))).toBe(true)
  })

  it("não deve gerar warnings para informação normal", () => {
    const info: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800,
      dependents: [{ relationship: "child", age: 5 }]
    }

    const warnings = validateBusinessRules(info)

    expect(warnings.length).toBe(0)
  })
})

describe("getNextFieldToCollect", () => {
  it("deve retornar campo obrigatório com maior prioridade", () => {
    const partialInfo: PartialClientInfo = {
      age: 35
      // Faltam city, state, budget
    }

    const nextField = getNextFieldToCollect(partialInfo)

    expect(nextField).toBeDefined()
    expect(nextField?.isRequired).toBe(true)
    expect(nextField?.priority).toBe(1)
  })

  it("deve retornar null quando todos os campos estão preenchidos", () => {
    const completeInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800,
      dependents: [],
      preExistingConditions: [],
      medications: []
    }

    const nextField = getNextFieldToCollect(completeInfo)

    expect(nextField).toBeNull()
  })
})

// Testes de cenários complexos
describe("Cenários Complexos", () => {
  it("deve processar família grande corretamente", () => {
    const largeFamily: PartialClientInfo = {
      age: 45,
      city: "Brasília",
      state: "DF",
      budget: 3000,
      dependents: [
        { relationship: "spouse", age: 42 },
        { relationship: "child", age: 15 },
        { relationship: "child", age: 12 },
        { relationship: "child", age: 8 },
        { relationship: "parent", age: 70 }
      ]
    }

    expect(validateClientInfoComplete(largeFamily)).toBe(true)
    expect(largeFamily.dependents?.length).toBe(5)

    const warnings = validateBusinessRules(largeFamily)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it("deve processar múltiplas condições pré-existentes", () => {
    const multipleConditions: PartialClientInfo = {
      age: 52,
      city: "São Paulo",
      state: "SP",
      budget: 1200,
      preExistingConditions: ["hipertensão", "diabetes tipo 2", "artrite"],
      medications: ["losartana", "metformina", "anti-inflamatório"]
    }

    expect(validateClientInfoComplete(multipleConditions)).toBe(true)
    expect(multipleConditions.preExistingConditions?.length).toBe(3)
    expect(multipleConditions.medications?.length).toBe(3)
  })

  it("deve processar extração incremental", () => {
    // Primeira mensagem
    const step1: PartialClientInfo = {
      age: 35
    }

    // Segunda mensagem
    const step2: PartialClientInfo = {
      city: "São Paulo",
      state: "SP"
    }

    // Terceira mensagem
    const step3: PartialClientInfo = {
      budget: 800
    }

    // Merge incremental
    let current = step1
    current = mergeClientInfo(current, step2)
    current = mergeClientInfo(current, step3)

    expect(validateClientInfoComplete(current)).toBe(true)
    expect(current.age).toBe(35)
    expect(current.city).toBe("São Paulo")
    expect(current.budget).toBe(800)
  })
})

// Testes de valores edge
describe("Valores Edge", () => {
  it("deve aceitar idade 0", () => {
    const json = JSON.stringify({
      age: 0,
      city: "São Paulo",
      state: "SP",
      budget: 500
    })

    const result = parseClientInfo(json)
    expect(result.success).toBe(true)
  })

  it("deve aceitar idade 120", () => {
    const json = JSON.stringify({
      age: 120,
      city: "São Paulo",
      state: "SP",
      budget: 500
    })

    const result = parseClientInfo(json)
    expect(result.success).toBe(true)
  })

  it("deve rejeitar idade 121", () => {
    const json = JSON.stringify({
      age: 121,
      city: "São Paulo",
      state: "SP",
      budget: 500
    })

    const result = parseClientInfo(json)
    expect(result.success).toBe(false)
  })

  it("deve rejeitar budget negativo", () => {
    const json = JSON.stringify({
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: -500
    })

    const result = parseClientInfo(json)
    expect(result.success).toBe(false)
  })

  it("deve aceitar arrays vazios como valores válidos", () => {
    const json = JSON.stringify({
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800,
      dependents: [],
      preExistingConditions: [],
      medications: []
    })

    const result = parseClientInfo(json)
    expect(result.success).toBe(true)
  })
})
