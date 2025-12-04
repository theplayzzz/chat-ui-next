/**
 * Capacidade: searchPlans
 *
 * Busca planos de saúde via RAG.
 * Idempotente - pode ser chamada múltiplas vezes.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-004
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Busca planos de saúde baseado nos dados do cliente
 * TODO: Implementar busca RAG (Fase 6)
 */
export async function searchPlans(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Gerar resposta própria baseada nos dados do cliente
  const clientInfo = state.clientInfo || {}
  const details = []
  if (clientInfo.age) details.push(`${clientInfo.age} anos`)
  if (clientInfo.city || clientInfo.state)
    details.push(clientInfo.city || clientInfo.state)
  if (clientInfo.budget) details.push(`orçamento R$${clientInfo.budget}`)

  const profileSummary = details.length > 0 ? ` (${details.join(", ")})` : ""
  const response = `Estou buscando planos de saúde compatíveis com seu perfil${profileSummary}. A busca RAG será implementada na Fase 6.`

  console.log("[searchPlans] Searching for health plans")

  // BUG FIX (Task 22.9): Adicionar AIMessage ao histórico para persistência
  return {
    currentResponse: response,
    messages: [new AIMessage(response)]
  }
}
