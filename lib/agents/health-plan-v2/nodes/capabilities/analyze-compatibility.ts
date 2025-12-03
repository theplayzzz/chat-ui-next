/**
 * Capacidade: analyzeCompatibility
 *
 * Analisa compatibilidade dos planos encontrados.
 * Pode ser reexecutada quando dados mudam.
 */

import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Analisa compatibilidade dos planos com o perfil do cliente
 * TODO: Implementar análise (Fase 7)
 */
export async function analyzeCompatibility(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Stub - será implementado na Fase 7
  return {
    currentResponse:
      "Analisando compatibilidade dos planos... (em desenvolvimento)"
  }
}
