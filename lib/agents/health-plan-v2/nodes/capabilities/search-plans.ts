/**
 * Capacidade: searchPlans
 *
 * Busca planos de saúde via RAG.
 * Idempotente - pode ser chamada múltiplas vezes.
 */

import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Busca planos de saúde baseado nos dados do cliente
 * TODO: Implementar busca RAG (Fase 6)
 */
export async function searchPlans(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Stub - será implementado na Fase 6
  return {
    currentResponse:
      "Buscando planos de saúde compatíveis com seu perfil... (em desenvolvimento)"
  }
}
