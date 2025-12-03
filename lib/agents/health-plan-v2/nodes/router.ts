/**
 * Router - Decide qual capacidade executar baseado na intenção
 *
 * Mapeia intenções do usuário para capacidades específicas.
 */

import type { HealthPlanState } from "../state/state-annotation"
import type { UserIntent } from "../types"

/**
 * Mapeamento de intenções para capacidades
 */
export const INTENT_TO_CAPABILITY: Record<UserIntent, string> = {
  fornecer_dados: "updateClientInfo",
  buscar_planos: "searchPlans",
  analisar: "analyzeCompatibility",
  consultar_preco: "fetchPrices",
  pedir_recomendacao: "generateRecommendation",
  conversar: "respondToUser",
  alterar_dados: "updateClientInfo",
  simular_cenario: "simulateScenario",
  finalizar: "endConversation"
}

/**
 * Tipo de capacidade disponível
 */
export type CapabilityName =
  | "updateClientInfo"
  | "searchPlans"
  | "analyzeCompatibility"
  | "fetchPrices"
  | "generateRecommendation"
  | "respondToUser"
  | "simulateScenario"
  | "endConversation"

/**
 * Router que decide qual capacidade executar
 */
export function routeToCapability(state: HealthPlanState): CapabilityName {
  const intent = state.lastIntent

  if (!intent) {
    return "respondToUser"
  }

  // Se usuário quer finalizar, vai para end
  if (intent === "finalizar") {
    return "endConversation"
  }

  // TODO: Implementar lógica mais sofisticada na Fase 4
  // Por exemplo, se dados insuficientes mesmo com intenção de buscar,
  // redirecionar para coleta

  return (INTENT_TO_CAPABILITY[intent] as CapabilityName) || "respondToUser"
}

/**
 * Verifica se a conversa deve continuar
 */
export function shouldContinue(state: HealthPlanState): "continue" | "end" {
  if (!state.isConversationActive) {
    return "end"
  }
  if (state.lastIntent === "finalizar") {
    return "end"
  }
  return "continue"
}
