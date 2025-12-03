/**
 * Capacidade: endConversation
 *
 * Finaliza a conversa quando usuário pede.
 * Salva audit e fecha sessão.
 */

import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Finaliza a conversa e salva auditoria
 * TODO: Implementar salvamento de audit (Fase 9)
 */
export async function endConversation(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Stub - finalização básica
  return {
    isConversationActive: false,
    currentResponse:
      "Obrigado por usar nosso assistente de planos de saúde! " +
      "Se precisar de mais ajuda no futuro, estarei aqui. " +
      "Tenha um ótimo dia!"
  }
}
