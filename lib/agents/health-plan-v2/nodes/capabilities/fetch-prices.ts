/**
 * Capacidade: fetchPrices
 *
 * Consulta preços no ERP (opcional).
 * Só executa quando usuário pede explicitamente.
 */

import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Busca preços dos planos no ERP
 * TODO: Implementar integração ERP (Fase 8)
 */
export async function fetchPrices(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Stub - será implementado na Fase 8
  return {
    pricesRequested: true,
    currentResponse:
      "Consultando preços atualizados... (em desenvolvimento - ERP não configurado)"
  }
}
