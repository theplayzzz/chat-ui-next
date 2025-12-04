/**
 * Workflow Principal - StateGraph com loop conversacional
 *
 * Implementa o grafo LangGraph que orquestra o agente conversacional.
 *
 * Fluxo do grafo (Fase 4):
 * START → orchestrator → router → [capacidade] → END
 *
 * O "loop conversacional" acontece entre requests HTTP:
 * - Cada request processa uma mensagem
 * - O checkpointer persiste o estado entre requests
 * - O estado é restaurado automaticamente na próxima request
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: 7 > Fase 4, 3.4 Diagrama do Grafo
 */

import { StateGraph } from "@langchain/langgraph"
import {
  HealthPlanStateAnnotation,
  type HealthPlanState
} from "../state/state-annotation"
import { orchestratorNode } from "../nodes/orchestrator"
import { routeToCapability } from "../nodes/router"
import type { BaseMessage } from "@langchain/core/messages"
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint"

// Import das capacidades
import {
  updateClientInfo,
  searchPlans,
  analyzeCompatibility,
  fetchPrices,
  generateRecommendation,
  respondToUser,
  endConversation
} from "../nodes/capabilities"

// ============================================================================
// WORKFLOW BUILDER
// ============================================================================

/**
 * Cria o workflow do Health Plan Agent v2
 *
 * O grafo implementa:
 * 1. START → orchestrator: Processa mensagem e classifica intenção
 * 2. orchestrator → router: Decide qual capacidade executar
 * 3. router → [capacidade]: Executa a capacidade escolhida
 * 4. [capacidade] → END: Finaliza processamento desta mensagem
 *
 * O loop conversacional continua na próxima request HTTP.
 */
export function createHealthPlanWorkflow() {
  // Helper para routing condicional
  const routingFunction = (state: HealthPlanState): string => {
    const capability = routeToCapability(state)
    console.log("[workflow] Routing from orchestrator to:", capability)

    // Mapeia "__end__" para o valor especial END
    if (capability === "__end__") {
      return "__end__"
    }
    return capability
  }

  // Nó stub para simulação (será implementado na Fase 10)
  const simulateScenarioNode = async (state: HealthPlanState) => {
    const { AIMessage } = await import("@langchain/core/messages")
    const response =
      "A simulação de cenário permite testar diferentes perfis (ex: 'E se eu adicionar minha esposa?'). " +
      "Esta funcionalidade será implementada na Fase 10."

    console.log("[simulateScenario] Scenario simulation (stub)")

    return {
      currentResponse: response,
      messages: [new AIMessage(response)]
    }
  }

  // Cria o grafo usando method chaining para melhor inferência de tipos
  const workflow = new StateGraph(HealthPlanStateAnnotation)
    // === ADICIONA NÓS ===
    .addNode("orchestrator", orchestratorNode)
    .addNode("updateClientInfo", updateClientInfo)
    .addNode("searchPlans", searchPlans)
    .addNode("analyzeCompatibility", analyzeCompatibility)
    .addNode("fetchPrices", fetchPrices)
    .addNode("generateRecommendation", generateRecommendation)
    .addNode("respondToUser", respondToUser)
    .addNode("endConversation", endConversation)
    .addNode("simulateScenario", simulateScenarioNode)
    // === DEFINE FLUXO ===
    // START → orchestrator
    .addEdge("__start__", "orchestrator")
    // orchestrator → router (edge condicional)
    .addConditionalEdges("orchestrator", routingFunction)
    // Cada capacidade → END (processamento desta mensagem termina)
    // O loop continua na próxima request HTTP
    .addEdge("updateClientInfo", "__end__")
    .addEdge("searchPlans", "__end__")
    .addEdge("analyzeCompatibility", "__end__")
    .addEdge("fetchPrices", "__end__")
    .addEdge("generateRecommendation", "__end__")
    .addEdge("respondToUser", "__end__")
    .addEdge("simulateScenario", "__end__")
    .addEdge("endConversation", "__end__")

  return workflow
}

// ============================================================================
// WORKFLOW COMPILATION
// ============================================================================

/**
 * Compila o workflow com checkpointer opcional
 *
 * @param checkpointer - Checkpointer para persistir estado (PostgresSaver em produção)
 * @returns Workflow compilado pronto para invocar
 *
 * Nota: O limite de loop é controlado por MAX_LOOP_ITERATIONS no router,
 * não por recursionLimit (que é para profundidade de recursão do grafo).
 */
export function compileWorkflow(checkpointer?: BaseCheckpointSaver) {
  const workflow = createHealthPlanWorkflow()

  return workflow.compile({
    checkpointer
  })
}

/**
 * Tipo do workflow compilado
 */
export type HealthPlanWorkflowApp = ReturnType<typeof compileWorkflow>

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Helper para criar estado inicial para uma nova conversa ou continuar existente
 *
 * @param config - Configuração do estado inicial
 * @returns Estado inicial parcial
 */
export function createInitialState(config: {
  workspaceId: string
  userId: string
  assistantId: string
  chatId: string
  messages?: BaseMessage[]
  isNewConversation?: boolean
}): Partial<HealthPlanState> {
  return {
    workspaceId: config.workspaceId,
    userId: config.userId,
    assistantId: config.assistantId,
    chatId: config.chatId,
    messages: config.messages || [],
    isConversationActive: true,
    // Resetar iterações a cada nova mensagem (evita acúmulo entre requests)
    loopIterations: 0
  }
}

/**
 * Verifica se o estado indica que a conversa ainda está ativa
 */
export function isConversationActive(state: HealthPlanState): boolean {
  return state.isConversationActive !== false
}

/**
 * Extrai a resposta atual do estado
 */
export function getCurrentResponse(state: HealthPlanState): string {
  return (
    state.currentResponse ||
    "Desculpe, não consegui gerar uma resposta. Pode tentar novamente?"
  )
}
