/**
 * Capacidade: respondToUser
 *
 * Responde conversas gerais e dúvidas.
 * Não invalida caches.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-008
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Responde perguntas gerais do usuário
 * TODO: Implementar respostas contextuais (Fase 9)
 *
 * Nota: Esta capacidade pode usar state.currentResponse do orchestrator
 * pois é chamada para intent="conversar" onde a resposta já foi preparada.
 */
export async function respondToUser(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Para conversa geral, o orchestrator já preparou resposta adequada
  // Mas se não houver, usar saudação padrão
  const response =
    state.lastIntent === "conversar" && state.currentResponse
      ? state.currentResponse
      : "Olá! Sou o assistente de planos de saúde. " +
        "Posso ajudar você a encontrar o plano ideal! " +
        "Me conte: qual sua idade, onde mora e se tem dependentes?"

  console.log("[respondToUser] Generating response")

  // BUG FIX (Task 22.9): Adicionar AIMessage ao histórico para persistência
  return {
    currentResponse: response,
    messages: [new AIMessage(response)]
  }
}
