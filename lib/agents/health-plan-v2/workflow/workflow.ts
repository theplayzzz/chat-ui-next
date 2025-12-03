/**
 * Workflow Principal - StateGraph com loop conversacional
 *
 * Implementa o grafo LangGraph que orquestra o agente conversacional.
 */

import { StateGraph, END, START } from "@langchain/langgraph"
import {
  HealthPlanStateAnnotation,
  type HealthPlanState
} from "../state/state-annotation"
import { orchestratorNode } from "../nodes/orchestrator"
import { shouldContinue } from "../nodes/router"
import type { BaseMessage } from "@langchain/core/messages"
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint"

/**
 * Cria o workflow do Health Plan Agent v2
 *
 * O grafo segue este fluxo:
 * START -> orchestrator -> END
 *
 * Em fases posteriores, o orchestrator roteará para capacidades específicas.
 */
export function createHealthPlanWorkflow() {
  // Cria o grafo com a anotação de estado
  const builder = new StateGraph(HealthPlanStateAnnotation)
    // Adiciona o nó orquestrador
    .addNode("orchestrator", orchestratorNode)
    // Define o fluxo: START -> orchestrator -> END
    .addEdge(START, "orchestrator")
    .addEdge("orchestrator", END)

  return builder
}

/**
 * Compila o workflow com checkpointer opcional
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

/**
 * Helper para criar estado inicial
 */
export function createInitialState(config: {
  workspaceId: string
  userId: string
  assistantId: string
  chatId: string
  messages?: BaseMessage[]
}): Partial<HealthPlanState> {
  return {
    workspaceId: config.workspaceId,
    userId: config.userId,
    assistantId: config.assistantId,
    chatId: config.chatId,
    messages: config.messages || [],
    isConversationActive: true
  }
}
