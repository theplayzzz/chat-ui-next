/**
 * Orchestrator Node - Nó principal do agente conversacional
 *
 * Responsável por:
 * - Receber mensagens do usuário
 * - Classificar intenções via GPT
 * - Decidir próxima capacidade a executar
 */

import type { HealthPlanState } from "../state/state-annotation"
import type { UserIntent, IntentClassificationResult } from "../types"

/**
 * Nó orquestrador que processa mensagens e decide próxima ação
 */
export async function orchestratorNode(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // TODO: Implementar na Fase 3-4
  // Por enquanto, retorna resposta stub

  // Messages é um array de BaseMessage do LangChain
  const messages = Array.isArray(state.messages) ? state.messages : []
  const lastMessage = messages[messages.length - 1]

  // Extrai o conteúdo da mensagem de forma segura
  let userContent = "Mensagem recebida"
  if (lastMessage) {
    if (typeof lastMessage === "string") {
      userContent = lastMessage
    } else if (
      typeof lastMessage === "object" &&
      "content" in lastMessage &&
      typeof lastMessage.content === "string"
    ) {
      userContent = lastMessage.content
    }
  }

  return {
    lastIntent: "conversar" as UserIntent,
    currentResponse: `Olá! Sou o assistente de planos de saúde v2. Em breve estarei totalmente funcional. Você disse: "${userContent}"`
  }
}

/**
 * Classifica a intenção do usuário baseado na mensagem
 * TODO: Implementar na Fase 3
 */
export async function classifyIntent(
  message: string,
  _context: HealthPlanState
): Promise<IntentClassificationResult> {
  // Stub - será implementado na Fase 3
  return {
    intent: "conversar",
    confidence: 1.0,
    reasoning: "Stub - classificação ainda não implementada"
  }
}
