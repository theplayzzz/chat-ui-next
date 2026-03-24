import { HumanMessage, AIMessage } from "@langchain/core/messages"
import {
  classifyIntent,
  extractContextFromMessages,
  buildStateContext,
  IntentClassificationResponseSchema
} from "../intent-classifier"

// Shared mock invoke function across all instances
const mockInvoke = jest.fn()

// Mock OpenAI at module level - the key is intercepting the constructor
jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke
  }))
}))

describe("Intent Classifier", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  // Helper to setup mock response
  const setupMockResponse = (data: object) => {
    mockInvoke.mockResolvedValueOnce({
      content: JSON.stringify(data)
    })
  }

  const baseInput = {
    message: "",
    conversationHistory: [],
    currentState: {}
  }

  describe("classifyIntent", () => {
    const baseInput = {
      message: "",
      conversationHistory: [],
      currentState: {}
    }

    it("1. should classify fornecer_dados with extracted data", async () => {
      setupMockResponse({
        intent: "fornecer_dados",
        confidence: 0.95,
        extractedData: { age: 30, city: "SP" },
        reasoning: "Usuario forneceu idade e cidade",
        alternativeIntents: []
      })

      const result = await classifyIntent({
        ...baseInput,
        message: "Tenho 30 anos e moro em SP"
      })

      expect(result.intent).toBe("fornecer_dados")
      expect(result.confidence).toBe(0.95)
      expect(result.extractedData).toEqual({ age: 30, city: "SP" })
    })

    it("2. should classify buscar_planos", async () => {
      setupMockResponse({
        intent: "buscar_planos",
        confidence: 0.9,
        reasoning: "Usuario solicitou busca explícita"
      })

      const result = await classifyIntent({
        ...baseInput,
        message: "Busca planos para mim"
      })

      expect(result.intent).toBe("buscar_planos")
      expect(result.confidence).toBe(0.9)
    })

    it("3. should classify pedir_recomendacao", async () => {
      setupMockResponse({
        intent: "pedir_recomendacao",
        confidence: 0.85,
        reasoning: "Solicitou recomendação"
      })

      const result = await classifyIntent({
        ...baseInput,
        message: "Qual plano você recomenda?"
      })

      expect(result.intent).toBe("pedir_recomendacao")
    })

    it("4. should classify conversar for generic questions", async () => {
      setupMockResponse({
        intent: "conversar",
        confidence: 0.99,
        reasoning: "Dúvida sobre termo de plano"
      })

      const result = await classifyIntent({
        ...baseInput,
        message: "O que é coparticipação?"
      })

      expect(result.intent).toBe("conversar")
    })

    it("5. should classify finalizar intents", async () => {
      setupMockResponse({
        intent: "finalizar",
        confidence: 0.95,
        reasoning: "Despedida"
      })

      const result = await classifyIntent({
        ...baseInput,
        message: "Obrigado, pode encerrar"
      })

      expect(result.intent).toBe("finalizar")
    })

    it("6. should classify alterar_dados", async () => {
      setupMockResponse({
        intent: "alterar_dados",
        confidence: 0.88,
        extractedData: { age: 35 },
        reasoning: "Correção de idade"
      })

      const result = await classifyIntent({
        ...baseInput,
        message: "Na verdade tenho 35 anos"
      })

      expect(result.intent).toBe("alterar_dados")
      expect(result.extractedData?.age).toBe(35)
    })

    it("7. should classify simular_cenario", async () => {
      setupMockResponse({
        intent: "simular_cenario",
        confidence: 0.85,
        extractedData: { scenarioChange: { type: "add_dependent" } },
        reasoning: "Simulação de adição"
      })

      const result = await classifyIntent({
        ...baseInput,
        message: "E se eu adicionasse um dependente?"
      })

      expect(result.intent).toBe("simular_cenario")
    })

    it("8. should fallback to conversar when confidence is low", async () => {
      setupMockResponse({
        intent: "buscar_planos",
        confidence: 0.2, // Below 0.3 MIN_CONFIDENCE_THRESHOLD
        reasoning: "Ambíguo"
      })

      const result = await classifyIntent({
        ...baseInput,
        message: "planos ah sla"
      })

      expect(result.intent).toBe("conversar") // Fallback due to low confidence
      expect(result.confidence).toBe(0.2)
    })

    it("should handle error gracefully and return fallback", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("API Down"))

      const result = await classifyIntent({
        ...baseInput,
        message: "Teste"
      })

      expect(result.intent).toBe("conversar")
      expect(result.reasoning).toContain("API Down")
    })
  })

  describe("Zod Schemas", () => {
    it("9. should validate correct parsing output", () => {
      const validData = {
        intent: "fornecer_dados",
        confidence: 0.95,
        extractedData: { age: 30 },
        reasoning: "ok"
      }

      const result = IntentClassificationResponseSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it("10. should invalidate malformed output with Zod error", async () => {
      const invalidData = {
        intent: "invalid_intent_here", // Not in enum
        confidence: 1.5, // > 1
        reasoning: 123 // not string
      }

      const result = IntentClassificationResponseSchema.safeParse(invalidData)
      expect(result.success).toBe(false)

      // Also test through classifyIntent itself
      setupMockResponse(invalidData)
      const classified = await classifyIntent({
        message: "invalid test",
        conversationHistory: [],
        currentState: {}
      })

      expect(classified.intent).toBe("conversar") // fallback
      expect(classified.reasoning).toContain("Erro de validação do output")
    })
  })

  describe("Helper Functions", () => {
    it("should extractContextFromMessages correctly", () => {
      const messages = [
        new HumanMessage("Hello"),
        new AIMessage("Hi there!"),
        new HumanMessage("How are you?")
      ]
      const context = extractContextFromMessages(messages)
      expect(context).toContain("Usuário: Hello")
      expect(context).toContain("Assistente: Hi there!")
      expect(context).toContain("Usuário: How are you?")
    })

    it("should handle empty messages in extractContextFromMessages", () => {
      expect(extractContextFromMessages([])).toBe("")
    })

    it("should buildStateContext correctly", () => {
      const state = {
        clientInfo: { age: 30 },
        searchResults: [{}, {}] as any,
        compatibilityAnalysis: {} as any
      }
      const context = buildStateContext(state)
      expect(context).toContain('Dados já coletados do cliente: {"age":30}')
      expect(context).toContain("Planos já encontrados: 2 planos")
      expect(context).toContain("Análise de compatibilidade já realizada")
    })
  })
})
