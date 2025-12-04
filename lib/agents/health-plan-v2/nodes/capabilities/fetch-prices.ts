/**
 * Capacidade: fetchPrices
 *
 * Consulta preços no ERP (opcional).
 * Só executa quando usuário pede explicitamente.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-006
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Busca preços dos planos no ERP
 * TODO: Implementar integração ERP (Fase 8)
 */
export async function fetchPrices(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const response =
    "Estou consultando os preços atualizados. A integração com o ERP será implementada na Fase 8. Por enquanto, os preços mostrados são estimativas."

  console.log("[fetchPrices] Fetching prices from ERP")

  // BUG FIX (Task 22.9): Adicionar AIMessage ao histórico para persistência
  return {
    pricesRequested: true,
    currentResponse: response,
    messages: [new AIMessage(response)]
  }
}
