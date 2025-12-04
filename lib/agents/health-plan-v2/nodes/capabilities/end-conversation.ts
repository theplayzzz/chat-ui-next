/**
 * Capacidade: endConversation
 *
 * Finaliza a conversa quando usuário pede.
 * Salva audit e fecha sessão.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-011
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Finaliza a conversa e salva auditoria
 * TODO: Implementar salvamento de audit (Fase 9)
 */
export async function endConversation(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const response =
    "Obrigado por usar nosso assistente de planos de saúde! " +
    "Se precisar de mais ajuda no futuro, estarei aqui. " +
    "Tenha um ótimo dia!"

  console.log("[endConversation] Finalizing conversation")

  // BUG FIX (Task 22.9): Adicionar AIMessage ao histórico para persistência
  return {
    isConversationActive: false,
    currentResponse: response,
    messages: [new AIMessage(response)]
  }
}
