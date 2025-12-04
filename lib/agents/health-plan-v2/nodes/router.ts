/**
 * Router - Decide qual capacidade executar baseado na intenção + estado
 *
 * Implementa lógica sofisticada de roteamento conforme PRD Fase 4:
 * - Verifica pré-requisitos antes de executar capacidades
 * - Redireciona para coleta de dados quando necessário
 * - Invalida caches quando dados mudam
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: 7 > Fase 4, RF-001, RF-002
 */

import type { HealthPlanState } from "../state/state-annotation"
import type { UserIntent, PartialClientInfo } from "../types"

// ============================================================================
// CONSTANTS
// ============================================================================

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
 * Limite de iterações do loop para evitar loop infinito
 */
export const MAX_LOOP_ITERATIONS = 10

// ============================================================================
// TYPES
// ============================================================================

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
  | "__end__" // Nó especial para finalizar o grafo

/**
 * Resultado do roteamento com contexto
 */
export interface RouteDecision {
  capability: CapabilityName
  reason: string
  redirected: boolean
  originalIntent?: UserIntent
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verifica se clientInfo tem os dados mínimos necessários para buscar planos
 *
 * Dados obrigatórios: age (ou faixa etária) e city/state
 */
export function hasRequiredClientData(
  clientInfo: PartialClientInfo | undefined
): boolean {
  if (!clientInfo) return false

  // Precisa de idade (ou poder inferir da faixa etária)
  const hasAge = typeof clientInfo.age === "number" && clientInfo.age > 0

  // Precisa de localização (cidade ou estado)
  const hasLocation = Boolean(clientInfo.city || clientInfo.state)

  return hasAge && hasLocation
}

/**
 * Verifica se há resultados de busca disponíveis
 */
export function hasSearchResults(state: HealthPlanState): boolean {
  return Array.isArray(state.searchResults) && state.searchResults.length > 0
}

/**
 * Verifica se há análise de compatibilidade disponível
 * Verifica tanto null quanto undefined
 */
export function hasCompatibilityAnalysis(state: HealthPlanState): boolean {
  return (
    state.compatibilityAnalysis !== null &&
    state.compatibilityAnalysis !== undefined
  )
}

/**
 * Verifica se a conversa atingiu o limite de iterações
 */
export function hasReachedLoopLimit(state: HealthPlanState): boolean {
  return (state.loopIterations || 0) >= MAX_LOOP_ITERATIONS
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

/**
 * Router que decide qual capacidade executar com lógica sofisticada
 *
 * Lógica de redirecionamento:
 * 1. Se intent=buscar_planos mas sem dados → updateClientInfo
 * 2. Se intent=analisar mas sem searchResults → searchPlans (se dados) ou updateClientInfo
 * 3. Se intent=pedir_recomendacao mas sem analysis → analyzeCompatibility (se busca) ou cadeia completa
 * 4. Se intent=alterar_dados → sempre updateClientInfo (cache invalidado no orchestrator)
 * 5. Se intent=finalizar → endConversation
 * 6. Default → respondToUser
 */
export function routeToCapability(state: HealthPlanState): CapabilityName {
  const decision = routeToCapabilityWithReason(state)

  console.log("[router] Route decision:", {
    intent: state.lastIntent,
    capability: decision.capability,
    reason: decision.reason,
    redirected: decision.redirected
  })

  return decision.capability
}

/**
 * Versão detalhada do router que retorna razão da decisão
 */
export function routeToCapabilityWithReason(
  state: HealthPlanState
): RouteDecision {
  const intent = state.lastIntent

  // === Caso: Sem intenção definida ===
  if (!intent) {
    return {
      capability: "respondToUser",
      reason: "Sem intenção detectada, respondendo genericamente",
      redirected: false
    }
  }

  // === Caso: Limite de loop atingido ===
  if (hasReachedLoopLimit(state)) {
    return {
      capability: "__end__",
      reason: `Loop limit reached (${MAX_LOOP_ITERATIONS} iterations)`,
      redirected: true,
      originalIntent: intent
    }
  }

  // === Caso: Finalizar ===
  if (intent === "finalizar") {
    return {
      capability: "endConversation",
      reason: "Usuário solicitou finalização",
      redirected: false
    }
  }

  // === Caso: Conversar (sem lógica especial) ===
  if (intent === "conversar") {
    return {
      capability: "respondToUser",
      reason: "Conversa geral, sem capacidade de negócio",
      redirected: false
    }
  }

  // === Caso: Fornecer/Alterar dados ===
  if (intent === "fornecer_dados" || intent === "alterar_dados") {
    return {
      capability: "updateClientInfo",
      reason: `Intenção de ${intent === "alterar_dados" ? "alterar" : "fornecer"} dados`,
      redirected: false
    }
  }

  // === Caso: Buscar planos ===
  if (intent === "buscar_planos") {
    if (!hasRequiredClientData(state.clientInfo)) {
      return {
        capability: "updateClientInfo",
        reason: "Dados insuficientes para busca (precisa idade e localização)",
        redirected: true,
        originalIntent: intent
      }
    }
    return {
      capability: "searchPlans",
      reason: "Dados suficientes, executando busca",
      redirected: false
    }
  }

  // === Caso: Analisar ===
  if (intent === "analisar") {
    if (!hasSearchResults(state)) {
      // Sem resultados de busca - precisa buscar primeiro
      if (!hasRequiredClientData(state.clientInfo)) {
        return {
          capability: "updateClientInfo",
          reason: "Sem resultados de busca e sem dados suficientes para buscar",
          redirected: true,
          originalIntent: intent
        }
      }
      return {
        capability: "searchPlans",
        reason: "Sem resultados de busca, executando busca primeiro",
        redirected: true,
        originalIntent: intent
      }
    }
    return {
      capability: "analyzeCompatibility",
      reason: "Resultados de busca disponíveis, analisando",
      redirected: false
    }
  }

  // === Caso: Pedir recomendação ===
  if (intent === "pedir_recomendacao") {
    if (!hasCompatibilityAnalysis(state)) {
      // Sem análise - precisa analisar primeiro
      if (!hasSearchResults(state)) {
        // Sem busca - precisa buscar primeiro
        if (!hasRequiredClientData(state.clientInfo)) {
          return {
            capability: "updateClientInfo",
            reason:
              "Cadeia completa necessária: coleta → busca → análise → recomendação",
            redirected: true,
            originalIntent: intent
          }
        }
        return {
          capability: "searchPlans",
          reason: "Sem análise nem busca, iniciando busca para recomendação",
          redirected: true,
          originalIntent: intent
        }
      }
      return {
        capability: "analyzeCompatibility",
        reason: "Sem análise, analisando para recomendação",
        redirected: true,
        originalIntent: intent
      }
    }
    return {
      capability: "generateRecommendation",
      reason: "Análise disponível, gerando recomendação",
      redirected: false
    }
  }

  // === Caso: Consultar preço ===
  if (intent === "consultar_preco") {
    // Preços são opcionais e podem funcionar mesmo sem busca completa
    return {
      capability: "fetchPrices",
      reason: "Consulta de preços solicitada",
      redirected: false
    }
  }

  // === Caso: Simular cenário ===
  if (intent === "simular_cenario") {
    return {
      capability: "simulateScenario",
      reason: "Simulação de cenário solicitada",
      redirected: false
    }
  }

  // === Default ===
  return {
    capability: "respondToUser",
    reason: `Intent '${intent}' não reconhecida, respondendo genericamente`,
    redirected: false
  }
}

// ============================================================================
// LOOP CONTROL
// ============================================================================

/**
 * Verifica se a conversa deve continuar ou encerrar
 *
 * Retorna:
 * - "continue": volta para orchestrator aguardar próxima mensagem
 * - "end": finaliza o grafo
 */
export function shouldContinue(state: HealthPlanState): "continue" | "end" {
  // Conversa não ativa
  if (!state.isConversationActive) {
    console.log("[router] shouldContinue: end (conversation not active)")
    return "end"
  }

  // Usuário finalizou
  if (state.lastIntent === "finalizar") {
    console.log("[router] shouldContinue: end (user requested)")
    return "end"
  }

  // Limite de iterações
  if (hasReachedLoopLimit(state)) {
    console.log("[router] shouldContinue: end (loop limit reached)")
    return "end"
  }

  console.log("[router] shouldContinue: continue")
  return "continue"
}

/**
 * Determina o próximo nó após uma capacidade
 *
 * A maioria das capacidades volta para "awaiting" (aguardando próxima mensagem)
 * Apenas endConversation vai para END
 */
export function afterCapability(
  state: HealthPlanState
): "awaiting" | "__end__" {
  // Se acabou de executar endConversation, termina
  if (state.lastIntent === "finalizar" || !state.isConversationActive) {
    return "__end__"
  }

  // Todas as outras capacidades voltam para aguardar próxima mensagem
  return "awaiting"
}
