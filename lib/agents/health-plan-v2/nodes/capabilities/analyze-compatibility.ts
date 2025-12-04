/**
 * Capacidade: analyzeCompatibility
 *
 * Analisa compatibilidade dos planos encontrados.
 * Pode ser reexecutada quando dados mudam.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-005
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Analisa compatibilidade dos planos com o perfil do cliente
 * TODO: Implementar análise (Fase 7)
 */
export async function analyzeCompatibility(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const plansCount = state.searchResults?.length || 0
  const response =
    plansCount > 0
      ? `Analisando a compatibilidade de ${plansCount} planos encontrados com seu perfil. A análise detalhada será implementada na Fase 7.`
      : "Não há planos para analisar ainda. Primeiro preciso buscar planos disponíveis."

  console.log("[analyzeCompatibility] Analyzing plan compatibility")

  // BUG FIX (Task 22.9): Adicionar AIMessage ao histórico para persistência
  return {
    currentResponse: response,
    messages: [new AIMessage(response)]
  }
}
