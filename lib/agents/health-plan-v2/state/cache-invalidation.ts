/**
 * Cache Invalidation Logic para Health Plan Agent v2
 *
 * Implementa sistema de invalidação inteligente de cache conforme PRD seção 3.6.
 * Quando dados upstream mudam, caches dependentes são automaticamente invalidados.
 *
 * @see .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md seção 3.6
 */

import type { PartialClientInfo } from "../types"
import type { HealthPlanState } from "./state-annotation"

/**
 * Regras de invalidação de cache
 *
 * Define quais campos devem ser invalidados quando um campo específico muda.
 * Baseado na dependência de dados entre capacidades do agente.
 */
export const INVALIDATION_RULES: Record<string, string[]> = {
  // Se clientInfo mudar → invalidar searchResults, analysis e recommendation
  clientInfo: ["searchResults", "compatibilityAnalysis", "recommendation"],

  // Se searchResults mudar → invalidar analysis e recommendation
  searchResults: ["compatibilityAnalysis", "recommendation"],

  // Se analysis mudar → invalidar recommendation
  compatibilityAnalysis: ["recommendation"],

  // Preços não invalidam nada (são consultivos)
  erpPrices: []
}

/**
 * Campos críticos do clientInfo que disparam invalidação
 *
 * Mudanças nesses campos invalidam o cache porque afetam diretamente
 * a busca e análise de planos de saúde.
 */
const CRITICAL_CLIENT_FIELDS: (keyof PartialClientInfo)[] = [
  "age",
  "city",
  "state",
  "dependents",
  "healthConditions",
  "budget"
]

/**
 * Campos não-críticos que NÃO disparam invalidação
 *
 * Mudanças nesses campos não afetam a busca ou análise.
 */
const NON_CRITICAL_CLIENT_FIELDS: (keyof PartialClientInfo)[] = [
  "name",
  "preferences",
  "currentPlan",
  "employer"
]

/**
 * Detecta se houve mudança significativa nos dados do cliente
 *
 * @param oldInfo - Dados anteriores do cliente
 * @param newInfo - Novos dados do cliente
 * @returns true se houver mudança em campos críticos
 */
export function hasSignificantChange(
  oldInfo: PartialClientInfo,
  newInfo: PartialClientInfo
): boolean {
  for (const field of CRITICAL_CLIENT_FIELDS) {
    const oldValue = oldInfo[field]
    const newValue = newInfo[field]

    // Se o campo não existia e agora existe (ou vice-versa)
    if ((oldValue === undefined) !== (newValue === undefined)) {
      return true
    }

    // Comparação especial para arrays (dependents, healthConditions)
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (oldValue.length !== newValue.length) {
        return true
      }
      // Comparação profunda simplificada para dependentes
      if (field === "dependents") {
        const oldDeps = JSON.stringify(oldValue)
        const newDeps = JSON.stringify(newValue)
        if (oldDeps !== newDeps) {
          return true
        }
      } else if (field === "healthConditions") {
        // Para arrays simples de strings (healthConditions)
        const oldArr = oldValue as string[]
        const newArr = newValue as string[]
        const oldSet = new Set(oldArr)
        const newSet = new Set(newArr)
        if (oldSet.size !== newSet.size) {
          return true
        }
        for (const v of oldSet) {
          if (!newSet.has(v)) {
            return true
          }
        }
      }
    } else if (oldValue !== newValue) {
      // Comparação direta para valores primitivos
      return true
    }
  }

  return false
}

/**
 * Callback quando clientInfo muda
 *
 * Verifica se a mudança é significativa e retorna informação para invalidação.
 *
 * @param oldInfo - Dados anteriores do cliente
 * @param newInfo - Novos dados do cliente (partial, será mergeado)
 * @returns Objeto indicando se deve invalidar e quais campos mudaram
 */
export function onClientInfoChange(
  oldInfo: PartialClientInfo,
  newInfo: Partial<PartialClientInfo>
): {
  shouldInvalidate: boolean
  changedFields: string[]
  mergedInfo: PartialClientInfo
} {
  const mergedInfo = { ...oldInfo, ...newInfo }
  const changedFields: string[] = []

  // Detecta quais campos mudaram
  for (const key of Object.keys(newInfo) as (keyof PartialClientInfo)[]) {
    if (oldInfo[key] !== newInfo[key]) {
      changedFields.push(key)
    }
  }

  // Verifica se alguma mudança é significativa
  const shouldInvalidate = hasSignificantChange(oldInfo, mergedInfo)

  return {
    shouldInvalidate,
    changedFields,
    mergedInfo
  }
}

/**
 * Invalida campos dependentes no estado
 *
 * Dado um campo que mudou, retorna as atualizações necessárias no estado
 * para invalidar os caches dependentes.
 *
 * @param changedField - Campo que foi alterado
 * @returns Partial state com campos invalidados e versões incrementadas
 */
export function getInvalidationUpdates(
  changedField: keyof typeof INVALIDATION_RULES
): Partial<HealthPlanState> {
  const fieldsToInvalidate = INVALIDATION_RULES[changedField] || []
  const updates: Partial<HealthPlanState> = {}

  for (const field of fieldsToInvalidate) {
    switch (field) {
      case "searchResults":
        updates.searchResults = []
        updates.searchResultsVersion = 0
        break
      case "compatibilityAnalysis":
        updates.compatibilityAnalysis = null
        updates.analysisVersion = 0
        break
      case "recommendation":
        updates.recommendation = null
        updates.recommendationVersion = 0
        break
    }
  }

  return updates
}

/**
 * Processa mudança de clientInfo e retorna estado atualizado
 *
 * Função principal que combina detecção de mudança e invalidação.
 *
 * @param currentState - Estado atual do agente
 * @param newClientData - Novos dados do cliente
 * @returns Partial state com clientInfo atualizado e caches invalidados se necessário
 */
export function processClientInfoUpdate(
  currentState: HealthPlanState,
  newClientData: Partial<PartialClientInfo>
): Partial<HealthPlanState> {
  const { shouldInvalidate, mergedInfo } = onClientInfoChange(
    currentState.clientInfo,
    newClientData
  )

  const updates: Partial<HealthPlanState> = {
    clientInfo: mergedInfo,
    clientInfoVersion: currentState.clientInfoVersion + 1
  }

  if (shouldInvalidate) {
    // Invalida todos os caches dependentes de clientInfo
    const invalidationUpdates = getInvalidationUpdates("clientInfo")
    Object.assign(updates, invalidationUpdates)

    console.log(
      "[cache-invalidation] ClientInfo changed significantly, invalidating caches:",
      Object.keys(invalidationUpdates)
    )
  } else {
    console.log(
      "[cache-invalidation] ClientInfo changed but no cache invalidation needed"
    )
  }

  return updates
}

/**
 * Verifica se um cache específico precisa ser atualizado
 *
 * Compara a versão do cache com a versão dos dados upstream.
 *
 * @param cacheVersion - Versão atual do cache
 * @param upstreamVersion - Versão dos dados upstream
 * @returns true se o cache está desatualizado
 */
export function isCacheStale(
  cacheVersion: number,
  upstreamVersion: number
): boolean {
  return cacheVersion < upstreamVersion
}

/**
 * Obtém campos que precisam ser recomputados dado o estado atual
 *
 * Analisa as versões e retorna lista de capacidades que precisam ser executadas.
 *
 * @param state - Estado atual
 * @returns Lista de capacidades que precisam ser reexecutadas
 */
export function getStaleCapabilities(state: HealthPlanState): string[] {
  const stale: string[] = []

  // Se clientInfo mudou e searchResults está vazio ou desatualizado
  if (
    state.clientInfoVersion > 0 &&
    (state.searchResults.length === 0 || state.searchResultsVersion === 0)
  ) {
    stale.push("searchPlans")
  }

  // Se searchResults existe mas analysis está vazio ou desatualizado
  if (
    state.searchResults.length > 0 &&
    state.searchResultsVersion > 0 &&
    (!state.compatibilityAnalysis || state.analysisVersion === 0)
  ) {
    stale.push("analyzeCompatibility")
  }

  // Se analysis existe mas recommendation está vazio ou desatualizado
  if (
    state.compatibilityAnalysis &&
    state.analysisVersion > 0 &&
    (!state.recommendation || state.recommendationVersion === 0)
  ) {
    stale.push("generateRecommendation")
  }

  return stale
}
