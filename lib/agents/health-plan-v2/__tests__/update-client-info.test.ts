/**
 * Testes para updateClientInfo capability
 *
 * Task 23.6: Testes unitários e de integração
 *
 * @see lib/agents/health-plan-v2/nodes/capabilities/update-client-info.ts
 */

import {
  updateClientInfo,
  validateClientData,
  generateConfirmationMessage,
  generateFollowUpQuestion,
  generatePartialSummary,
  formatDependents,
  formatHealthConditions,
  COMPLETENESS_THRESHOLD_FOR_CONFIRMATION,
  VALID_STATES,
  RELATIONSHIP_LABELS
} from "../nodes/capabilities/update-client-info"
import type { HealthPlanState } from "../state/state-annotation"
import type { PartialClientInfo } from "../../../../tools/health-plan/schemas/client-info-schema"

// ============================================================================
// MOCKS
// ============================================================================

// Mock do AIMessage
jest.mock("@langchain/core/messages", () => ({
  AIMessage: class AIMessage {
    content: string
    constructor(content: string) {
      this.content = content
    }
  }
}))

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Cria um estado de teste básico
 */
function createTestState(
  clientInfo: Partial<PartialClientInfo> = {}
): HealthPlanState {
  return {
    workspaceId: "test-workspace",
    userId: "test-user",
    assistantId: "test-assistant",
    chatId: "test-chat",
    messages: [],
    lastIntent: null,
    lastIntentConfidence: 0,
    clientInfo: clientInfo as PartialClientInfo,
    clientInfoVersion: 0,
    searchResults: [],
    searchResultsVersion: 0,
    compatibilityAnalysis: null,
    analysisVersion: 0,
    erpPrices: null,
    pricesRequested: false,
    recommendation: null,
    recommendationVersion: 0,
    isConversationActive: true,
    pendingAction: null,
    loopIterations: 0,
    currentResponse: "",
    errors: []
  } as HealthPlanState
}

// ============================================================================
// TESTES: CONSTANTES
// ============================================================================

describe("Constantes", () => {
  test("VALID_STATES contém todos os estados brasileiros", () => {
    expect(VALID_STATES).toHaveLength(27)
    expect(VALID_STATES).toContain("SP")
    expect(VALID_STATES).toContain("RJ")
    expect(VALID_STATES).toContain("MG")
    expect(VALID_STATES).toContain("DF")
  })

  test("RELATIONSHIP_LABELS contém todas as relações", () => {
    expect(RELATIONSHIP_LABELS).toHaveProperty("spouse", "cônjuge")
    expect(RELATIONSHIP_LABELS).toHaveProperty("child", "filho(a)")
    expect(RELATIONSHIP_LABELS).toHaveProperty("parent", "pai/mãe")
    expect(RELATIONSHIP_LABELS).toHaveProperty("other", "outro")
  })

  test("COMPLETENESS_THRESHOLD_FOR_CONFIRMATION é 70", () => {
    expect(COMPLETENESS_THRESHOLD_FOR_CONFIRMATION).toBe(70)
  })
})

// ============================================================================
// TESTES: VALIDAÇÃO DE DADOS
// ============================================================================

describe("validateClientData", () => {
  test("retorna array vazio para dados válidos", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500
    }
    const errors = validateClientData(clientInfo)
    expect(errors).toHaveLength(0)
  })

  test("detecta estado inválido", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      state: "XX" // Estado inválido
    }
    const errors = validateClientData(clientInfo)
    expect(errors.some(e => e.message.includes("Estado"))).toBe(true)
  })

  test("detecta idade inválida (negativa)", () => {
    const clientInfo: PartialClientInfo = {
      age: -5
    }
    const errors = validateClientData(clientInfo)
    expect(errors.some(e => e.message.includes("Idade"))).toBe(true)
  })

  test("detecta idade inválida (muito alta)", () => {
    const clientInfo: PartialClientInfo = {
      age: 150
    }
    const errors = validateClientData(clientInfo)
    expect(errors.some(e => e.message.includes("Idade"))).toBe(true)
  })

  test("detecta budget negativo", () => {
    const clientInfo: PartialClientInfo = {
      budget: -100
    }
    const errors = validateClientData(clientInfo)
    expect(errors.some(e => e.message.includes("Orçamento"))).toBe(true)
  })

  test("detecta idade de dependente inválida", () => {
    const clientInfo: PartialClientInfo = {
      dependents: [{ age: 200, relationship: "child" }]
    }
    const errors = validateClientData(clientInfo)
    expect(errors.some(e => e.message.includes("dependente"))).toBe(true)
  })

  test("inclui warnings de regras de negócio - idade < 18", () => {
    const clientInfo: PartialClientInfo = {
      age: 17,
      city: "SP",
      state: "SP",
      budget: 500
    }
    const errors = validateClientData(clientInfo)
    expect(errors.some(e => e.message.includes("menor de 18"))).toBe(true)
    expect(errors[0].details?.type).toBe("business_warning")
  })

  test("inclui warnings de regras de negócio - idade > 70", () => {
    const clientInfo: PartialClientInfo = {
      age: 75,
      city: "SP",
      state: "SP",
      budget: 500
    }
    const errors = validateClientData(clientInfo)
    expect(errors.some(e => e.message.includes("70 anos"))).toBe(true)
  })

  test("inclui warnings de regras de negócio - orçamento baixo", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "SP",
      state: "SP",
      budget: 150, // R$150 para 2 pessoas = R$75 per capita
      dependents: [{ age: 32, relationship: "spouse" }]
    }
    const errors = validateClientData(clientInfo)
    expect(errors.some(e => e.message.includes("insuficiente"))).toBe(true)
  })
})

// ============================================================================
// TESTES: FORMATAÇÃO
// ============================================================================

describe("formatDependents", () => {
  test("retorna 'Nenhum' para array vazio", () => {
    expect(formatDependents([])).toBe("Nenhum")
  })

  test("retorna 'Nenhum' para undefined", () => {
    expect(formatDependents(undefined)).toBe("Nenhum")
  })

  test("formata dependentes corretamente", () => {
    const dependents = [
      { age: 32, relationship: "spouse" as const },
      { age: 5, relationship: "child" as const }
    ]
    const result = formatDependents(dependents)
    expect(result).toContain("cônjuge")
    expect(result).toContain("32 anos")
    expect(result).toContain("filho(a)")
    expect(result).toContain("5 anos")
  })

  test("formata dependentes sem idade como 'idade não informada'", () => {
    const dependents = [
      { relationship: "spouse" as const },
      { age: 5, relationship: "child" as const }
    ]
    const result = formatDependents(dependents)
    expect(result).toContain("cônjuge")
    expect(result).toContain("idade não informada")
    expect(result).toContain("filho(a)")
    expect(result).toContain("5 anos")
  })
})

describe("formatHealthConditions", () => {
  test("retorna 'Nenhuma declarada' para array vazio", () => {
    expect(formatHealthConditions([])).toBe("Nenhuma declarada")
  })

  test("retorna 'Nenhuma declarada' para undefined", () => {
    expect(formatHealthConditions(undefined)).toBe("Nenhuma declarada")
  })

  test("formata condições corretamente", () => {
    const conditions = ["Diabetes", "Hipertensão"]
    const result = formatHealthConditions(conditions)
    expect(result).toBe("Diabetes, Hipertensão")
  })
})

describe("generatePartialSummary", () => {
  test("retorna string vazia para clientInfo vazio", () => {
    expect(generatePartialSummary({})).toBe("")
  })

  test("gera resumo com dados parciais", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo"
    }
    const result = generatePartialSummary(clientInfo)
    expect(result).toContain("35 anos")
    expect(result).toContain("São Paulo")
    expect(result).toContain("📋 Já tenho:")
  })

  test("inclui dependentes no resumo", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      dependents: [
        { age: 32, relationship: "spouse" },
        { age: 5, relationship: "child" }
      ]
    }
    const result = generatePartialSummary(clientInfo)
    expect(result).toContain("2 dependente(s)")
  })
})

// ============================================================================
// TESTES: CONFIRMAÇÃO VISUAL
// ============================================================================

describe("generateConfirmationMessage", () => {
  test("gera mensagem com dados básicos", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500
    }
    const result = generateConfirmationMessage(clientInfo, 70, [])
    expect(result).toContain("✅")
    expect(result).toContain("35 anos")
    expect(result).toContain("São Paulo")
    expect(result).toContain("R$ 500")
    expect(result).toContain("70%")
  })

  test("inclui dependentes na confirmação", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500,
      dependents: [{ age: 32, relationship: "spouse" }]
    }
    const result = generateConfirmationMessage(clientInfo, 80, [])
    expect(result).toContain("Dependentes")
    expect(result).toContain("cônjuge")
    expect(result).toContain("32 anos")
  })

  test("inclui warnings na confirmação", () => {
    const clientInfo: PartialClientInfo = {
      age: 17,
      city: "São Paulo",
      state: "SP",
      budget: 500
    }
    const warnings = [
      {
        capability: "updateClientInfo",
        message: "Titular menor de 18 anos pode requerer responsável legal",
        timestamp: new Date().toISOString(),
        details: { type: "business_warning" }
      }
    ]
    const result = generateConfirmationMessage(clientInfo, 70, warnings)
    expect(result).toContain("⚠️")
    expect(result).toContain("menor de 18")
  })

  test("oferece busca quando dados completos", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500
    }
    const result = generateConfirmationMessage(clientInfo, 100, [])
    expect(result).toContain("buscar planos")
  })

  test("mostra campos faltantes quando incompleto", () => {
    const clientInfo: PartialClientInfo = {
      age: 35
      // Faltando city, state, budget
    }
    const result = generateConfirmationMessage(clientInfo, 20, [])
    expect(result).toContain("Falta informar")
  })
})

// ============================================================================
// TESTES: FOLLOW-UP QUESTIONS
// ============================================================================

describe("generateFollowUpQuestion", () => {
  test("gera pergunta inicial consolidada sem dados", () => {
    const result = generateFollowUpQuestion({})
    expect(result).toContain("idade")
    expect(result).toContain("Cidade")
    expect(result).toContain("estado")
    expect(result).toContain("Orçamento")
  })

  test("pergunta sobre cidade quando só tem idade", () => {
    const clientInfo: PartialClientInfo = {
      age: 35
    }
    const result = generateFollowUpQuestion(clientInfo)
    expect(result).toContain("cidade")
  })

  test("pergunta sobre estado quando tem idade e cidade", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo"
    }
    const result = generateFollowUpQuestion(clientInfo)
    expect(result).toContain("estado")
  })

  test("pergunta sobre orçamento quando tem dados básicos menos budget", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP"
    }
    const result = generateFollowUpQuestion(clientInfo)
    expect(result).toContain("investir")
  })

  test("pergunta sobre dependentes quando dados obrigatórios completos", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500
    }
    const result = generateFollowUpQuestion(clientInfo)
    expect(result).toContain("dependentes")
  })

  test("inclui resumo parcial nas perguntas", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo"
    }
    const result = generateFollowUpQuestion(clientInfo)
    expect(result).toContain("📋 Já tenho:")
    expect(result).toContain("35 anos")
  })

  test("pergunta idade dos dependentes quando não informada", () => {
    const clientInfo: PartialClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500,
      dependents: [
        { relationship: "spouse" }, // sem idade
        { relationship: "child" } // sem idade
      ]
    }
    const result = generateFollowUpQuestion(clientInfo)
    expect(result).toContain("idade")
    expect(result).toContain("Dependentes sem idade")
    expect(result).toContain("cônjuge")
    expect(result).toContain("filho(a)")
  })
})

// ============================================================================
// TESTES: FUNÇÃO PRINCIPAL
// ============================================================================

describe("updateClientInfo", () => {
  test("gera pergunta inicial quando clientInfo vazio", async () => {
    const state = createTestState({})
    const result = await updateClientInfo(state)

    expect(result.currentResponse).toBeDefined()
    expect(result.currentResponse).toContain("idade")
    expect(result.messages).toHaveLength(1)
  })

  test("gera confirmação quando dados completos", async () => {
    const state = createTestState({
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500
    })
    const result = await updateClientInfo(state)

    expect(result.currentResponse).toContain("✅")
    expect(result.currentResponse).toContain("35 anos")
  })

  test("gera follow-up quando dados parciais", async () => {
    const state = createTestState({
      age: 35
    })
    const result = await updateClientInfo(state)

    // Deve perguntar sobre cidade ou estado
    expect(
      result.currentResponse?.includes("cidade") ||
        result.currentResponse?.includes("estado")
    ).toBe(true)
  })

  test("inclui warnings no estado", async () => {
    const state = createTestState({
      age: 17, // Menor de idade - deve gerar warning
      city: "São Paulo",
      state: "SP",
      budget: 500
    })
    const result = await updateClientInfo(state)

    expect(result.errors).toBeDefined()
    expect(result.errors?.some(e => e.message.includes("menor de 18"))).toBe(
      true
    )
  })

  test("adiciona AIMessage ao histórico", async () => {
    const state = createTestState({})
    const result = await updateClientInfo(state)

    expect(result.messages).toHaveLength(1)
    expect(result.messages?.[0]).toHaveProperty("content")
  })

  test("usa threshold de completude para decidir tipo de resposta", async () => {
    // 70% completude = deve mostrar confirmação
    const state = createTestState({
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500
    })
    const result = await updateClientInfo(state)

    // Com 4 campos obrigatórios preenchidos (70%), deve mostrar confirmação
    expect(result.currentResponse).toContain("✅")
  })
})

// ============================================================================
// TESTES: INTEGRAÇÃO
// ============================================================================

describe("Integração updateClientInfo", () => {
  test("fluxo completo: vazio → parcial → completo", async () => {
    // 1. Estado vazio - deve pedir informações
    let state = createTestState({})
    let result = await updateClientInfo(state)
    expect(result.currentResponse).toContain("idade")

    // 2. Adicionar idade - deve perguntar próximo campo
    state = createTestState({ age: 35 })
    result = await updateClientInfo(state)
    expect(
      result.currentResponse?.includes("cidade") ||
        result.currentResponse?.includes("estado")
    ).toBe(true)

    // 3. Adicionar mais dados - deve mostrar confirmação quando suficiente
    state = createTestState({
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500
    })
    result = await updateClientInfo(state)
    expect(result.currentResponse).toContain("✅")
    expect(result.currentResponse).toContain("buscar planos")
  })

  test("validação não bloqueia fluxo", async () => {
    // Dados com warnings (idade < 18)
    const state = createTestState({
      age: 17,
      city: "São Paulo",
      state: "SP",
      budget: 500
    })
    const result = await updateClientInfo(state)

    // Deve gerar resposta mesmo com warnings
    expect(result.currentResponse).toBeDefined()
    expect(result.currentResponse?.length).toBeGreaterThan(0)

    // Warnings devem estar no errors
    expect(result.errors?.length).toBeGreaterThan(0)
  })

  test("lida com dependentes corretamente", async () => {
    const state = createTestState({
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500,
      dependents: [
        { age: 32, relationship: "spouse" },
        { age: 5, relationship: "child" },
        { age: 3, relationship: "child" }
      ]
    })
    const result = await updateClientInfo(state)

    expect(result.currentResponse).toContain("Dependentes")
    expect(result.currentResponse).toContain("cônjuge")
    expect(result.currentResponse).toContain("filho(a)")
  })
})
