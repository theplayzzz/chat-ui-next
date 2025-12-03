/**
 * Capacidade: updateClientInfo
 *
 * Atualiza/coleta informações do cliente.
 * Pode ser chamada múltiplas vezes, em qualquer momento.
 */

import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Atualiza informações do cliente no estado
 * TODO: Implementar extração de dados da mensagem (Fase 5)
 */
export async function updateClientInfo(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Stub - será implementado na Fase 5
  return {
    currentResponse:
      "Por favor, me conte um pouco sobre você: qual sua idade, cidade onde mora, e se tem dependentes?"
  }
}
