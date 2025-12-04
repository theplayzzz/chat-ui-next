/**
 * Capacidade: generateRecommendation
 *
 * Gera recomendação humanizada de planos.
 * Pode gerar múltiplas recomendações na mesma sessão.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-007
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Gera recomendação de planos de saúde
 * TODO: Implementar geração de recomendação (Fase 7)
 */
export async function generateRecommendation(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const hasAnalysis = state.compatibilityAnalysis !== null
  const response = hasAnalysis
    ? "Estou gerando uma recomendação personalizada baseada na análise dos planos. A geração completa será implementada na Fase 7."
    : "Para gerar uma recomendação, primeiro preciso analisar os planos disponíveis para seu perfil."

  console.log("[generateRecommendation] Generating personalized recommendation")

  // BUG FIX (Task 22.9): Adicionar AIMessage ao histórico para persistência
  return {
    recommendationVersion: (state.recommendationVersion || 0) + 1,
    currentResponse: response,
    messages: [new AIMessage(response)]
  }
}
