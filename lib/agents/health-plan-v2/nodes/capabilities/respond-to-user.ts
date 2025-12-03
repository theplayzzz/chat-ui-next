/**
 * Capacidade: respondToUser
 *
 * Responde conversas gerais e dúvidas.
 * Não invalida caches.
 */

import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Responde perguntas gerais do usuário
 * TODO: Implementar respostas contextuais (Fase 9)
 */
export async function respondToUser(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Stub - resposta básica
  return {
    currentResponse:
      "Olá! Sou o assistente de planos de saúde v2. " +
      "Posso ajudar você a encontrar o plano ideal para suas necessidades. " +
      "Me conte: qual sua idade, cidade onde mora, e qual seu orçamento mensal para o plano?"
  }
}
