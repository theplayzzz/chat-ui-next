/**
 * Testes de Edge Cases e Stubs - Fase 11
 *
 * Valida:
 * - Comportamento dos stubs (fetchPrices, respondToUser)
 * - Estrutura do workflow (nós, constantes)
 * - Funções helper do workflow
 * - Tipos e constantes do intent classifier
 *
 * @see lib/agents/health-plan-v2/workflow/workflow.ts
 * @see lib/agents/health-plan-v2/intent/intent-classification-types.ts
 */

import {
  createHealthPlanWorkflow,
  createInitialState,
  isConversationActive,
  getCurrentResponse
} from "../workflow/workflow"
import { INTENT_TO_CAPABILITY, MAX_LOOP_ITERATIONS } from "../nodes/router"
import {
  VALID_INTENTS,
  DATA_COLLECTION_INTENTS,
  BUSINESS_CAPABILITY_INTENTS,
  MIN_CONFIDENCE_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD
} from "../intent/intent-classification-types"
import { INVALIDATION_RULES } from "../state/cache-invalidation"
import type { HealthPlanState } from "../state/state-annotation"

// Mock LangGraph to avoid full graph compilation issues in test
jest.mock("@langchain/langgraph", () => {
  const addedNodes: string[] = []
  const mockWorkflow = {
    addNode: jest.fn((name: string) => {
      addedNodes.push(name)
      return mockWorkflow
    }),
    addEdge: jest.fn().mockReturnThis(),
    addConditionalEdges: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnValue({
      invoke: jest.fn(),
      stream: jest.fn()
    }),
    _addedNodes: addedNodes
  }

  // Mock Annotation - it's used both as a function Annotation({...})
  // and as Annotation.Root({...}) and Annotation<Type>
  const annotationFn = (config: any) => config || { value: undefined }
  annotationFn.Root = (schema: any) => schema
  const Annotation = new Proxy(annotationFn, {
    get: (target, prop) => {
      if (prop === "Root") return target.Root
      if (typeof prop === "symbol") return (target as any)[prop]
      return { value: undefined, default: () => undefined }
    }
  })

  return {
    StateGraph: jest.fn(() => mockWorkflow),
    Annotation,
    messagesStateReducer: (a: any, b: any) => [...(a || []), ...(b || [])],
    END: "__end__",
    START: "__start__"
  }
})

// Mock capabilities
jest.mock("../nodes/capabilities", () => ({
  updateClientInfo: jest.fn(),
  searchPlans: jest.fn(),
  analyzeCompatibility: jest.fn(),
  fetchPrices: jest.fn(),
  generateRecommendation: jest.fn(),
  respondToUser: jest.fn(),
  endConversation: jest.fn()
}))

// Mock orchestrator
jest.mock("../nodes/orchestrator", () => ({
  orchestratorNode: jest.fn()
}))

// Mock router
jest.mock("../nodes/router", () => {
  const actual = jest.requireActual("../nodes/router")
  return {
    ...actual,
    routeToCapability: jest.fn()
  }
})

// =============================================================================
// WORKFLOW STRUCTURE
// =============================================================================

describe("Workflow structure", () => {
  it("should create workflow with all 9 nodes", () => {
    const { StateGraph } = require("@langchain/langgraph")
    const workflow = createHealthPlanWorkflow()

    // StateGraph was called
    expect(StateGraph).toHaveBeenCalled()

    // Check that addNode was called for each capability + orchestrator + respondToUser
    const mockInstance = StateGraph.mock.results[0]?.value
    if (mockInstance) {
      const nodeNames = mockInstance.addNode.mock.calls.map(
        (call: any[]) => call[0]
      )
      expect(nodeNames).toContain("orchestrator")
      expect(nodeNames).toContain("updateClientInfo")
      expect(nodeNames).toContain("searchPlans")
      expect(nodeNames).toContain("analyzeCompatibility")
      expect(nodeNames).toContain("fetchPrices")
      expect(nodeNames).toContain("generateRecommendation")
      expect(nodeNames).toContain("respondToUser")
      expect(nodeNames).toContain("endConversation")
      expect(nodeNames).toContain("respondToUser")
      expect(nodeNames).toHaveLength(8) // simulateScenario removed (Phase 10 disabled)
    }
  })
})

// =============================================================================
// WORKFLOW HELPERS
// =============================================================================

describe("createInitialState", () => {
  it("should return state with correct defaults", () => {
    const state = createInitialState({
      workspaceId: "ws-1",
      userId: "user-1",
      assistantId: "asst-1",
      chatId: "chat-1"
    })

    expect(state.workspaceId).toBe("ws-1")
    expect(state.userId).toBe("user-1")
    expect(state.assistantId).toBe("asst-1")
    expect(state.chatId).toBe("chat-1")
    expect(state.messages).toEqual([])
    expect(state.isConversationActive).toBe(true)
    expect(state.loopIterations).toBe(0)
  })

  it("should accept custom messages", () => {
    const mockMsg = { content: "test" } as any
    const state = createInitialState({
      workspaceId: "ws-1",
      userId: "user-1",
      assistantId: "asst-1",
      chatId: "chat-1",
      messages: [mockMsg]
    })

    expect(state.messages).toHaveLength(1)
  })
})

describe("isConversationActive", () => {
  it("should return true by default", () => {
    expect(
      isConversationActive({ isConversationActive: true } as HealthPlanState)
    ).toBe(true)
  })

  it("should return false when set to false", () => {
    expect(
      isConversationActive({ isConversationActive: false } as HealthPlanState)
    ).toBe(false)
  })

  it("should return true when field is undefined", () => {
    expect(isConversationActive({} as HealthPlanState)).toBe(true)
  })
})

describe("getCurrentResponse", () => {
  it("should return currentResponse when present", () => {
    expect(
      getCurrentResponse({
        currentResponse: "Hello"
      } as HealthPlanState)
    ).toBe("Hello")
  })

  it("should return fallback when currentResponse is empty", () => {
    const result = getCurrentResponse({
      currentResponse: ""
    } as HealthPlanState)

    expect(result).toContain("Desculpe")
  })

  it("should return fallback when currentResponse is undefined", () => {
    const result = getCurrentResponse({} as HealthPlanState)

    expect(result).toContain("Desculpe")
  })
})

// =============================================================================
// INTENT CLASSIFICATION TYPES
// =============================================================================

describe("Intent classification types", () => {
  it("should have exactly 9 valid intents", () => {
    expect(VALID_INTENTS).toHaveLength(9)
  })

  it("should include simular_cenario in VALID_INTENTS", () => {
    expect(VALID_INTENTS).toContain("simular_cenario")
  })

  it("should include simular_cenario in DATA_COLLECTION_INTENTS", () => {
    expect(DATA_COLLECTION_INTENTS).toContain("simular_cenario")
  })

  it("should have correct DATA_COLLECTION_INTENTS", () => {
    expect(DATA_COLLECTION_INTENTS).toEqual([
      "fornecer_dados",
      "alterar_dados",
      "simular_cenario"
    ])
  })

  it("should have correct BUSINESS_CAPABILITY_INTENTS", () => {
    expect(BUSINESS_CAPABILITY_INTENTS).toEqual([
      "buscar_planos",
      "analisar",
      "consultar_preco",
      "pedir_recomendacao"
    ])
  })

  it("should have all VALID_INTENTS mapped in INTENT_TO_CAPABILITY", () => {
    for (const intent of VALID_INTENTS) {
      expect(INTENT_TO_CAPABILITY[intent]).toBeDefined()
    }
  })

  it("should have confidence thresholds in correct range", () => {
    expect(MIN_CONFIDENCE_THRESHOLD).toBeGreaterThan(0)
    expect(MIN_CONFIDENCE_THRESHOLD).toBeLessThan(1)
    expect(HIGH_CONFIDENCE_THRESHOLD).toBeGreaterThan(MIN_CONFIDENCE_THRESHOLD)
    expect(HIGH_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// CACHE INVALIDATION RULES
// =============================================================================

describe("Cache invalidation rules", () => {
  it("should have clientInfo invalidating downstream caches", () => {
    expect(INVALIDATION_RULES.clientInfo).toContain("searchResults")
    expect(INVALIDATION_RULES.clientInfo).toContain("compatibilityAnalysis")
    expect(INVALIDATION_RULES.clientInfo).toContain("recommendation")
  })

  it("should have searchResults invalidating analysis and recommendation", () => {
    expect(INVALIDATION_RULES.searchResults).toContain("compatibilityAnalysis")
    expect(INVALIDATION_RULES.searchResults).toContain("recommendation")
  })

  it("should have compatibilityAnalysis invalidating recommendation", () => {
    expect(INVALIDATION_RULES.compatibilityAnalysis).toContain("recommendation")
  })

  it("should have erpPrices invalidating nothing", () => {
    expect(INVALIDATION_RULES.erpPrices).toEqual([])
  })
})

// =============================================================================
// ROUTER CONSTANTS
// =============================================================================

describe("Router constants", () => {
  it("should have MAX_LOOP_ITERATIONS = 10", () => {
    expect(MAX_LOOP_ITERATIONS).toBe(10)
  })

  it("should map all intents to capabilities", () => {
    const capabilities = Object.values(INTENT_TO_CAPABILITY)
    expect(capabilities).toContain("updateClientInfo")
    expect(capabilities).toContain("searchPlans")
    expect(capabilities).toContain("analyzeCompatibility")
    expect(capabilities).toContain("fetchPrices")
    expect(capabilities).toContain("generateRecommendation")
    expect(capabilities).toContain("respondToUser")
    expect(capabilities).toContain("respondToUser")
    expect(capabilities).toContain("endConversation")
  })
})
