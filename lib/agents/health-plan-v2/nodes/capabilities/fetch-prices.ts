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
 *
 * NOTA: O router redireciona consultar_preco para respondToUser ou searchPlans.
 * Este stub só é chamado diretamente em cenários edge.
 */
export async function fetchPrices(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const response =
    "No momento, os preços exatos dependem de uma cotação personalizada. " +
    "Posso te ajudar a encontrar planos compatíveis com seu perfil e orçamento — " +
    "os valores apresentados nas análises são baseados nas tabelas disponíveis."

  console.log("[fetchPrices] ERP integration not yet available, using fallback")

  // BUG FIX (Task 22.9): Adicionar AIMessage ao histórico para persistência
  return {
    pricesRequested: true,
    currentResponse: response,
    messages: [new AIMessage(response)]
  }
}
