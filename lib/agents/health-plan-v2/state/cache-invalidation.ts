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
import type { ScenarioChange } from "../intent/intent-classification-types"

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

// ============================================================================
// SMART MERGE LOGIC
// ============================================================================

/**
 * Gera chave única para identificar dependente
 *
 * Usa name se disponível, senão usa relationship + age
 */
export function getDependentKey(
  dep: NonNullable<PartialClientInfo["dependents"]>[number]
): string {
  if (dep.name) {
    return `name:${dep.name.toLowerCase()}`
  }
  // Fallback: relationship + age (pode ter múltiplos filhos de idades diferentes)
  return `${dep.relationship}:${dep.age ?? "unknown"}`
}

/**
 * Merge inteligente de dependentes
 *
 * Regras:
 * 1. Dependente com mesmo nome → atualiza dados
 * 2. Dependente com mesmo relationship + age → atualiza dados
 * 3. Novo dependente (sem match) → adiciona à lista
 * 4. Nunca remove dependentes nesta função (use applyDependentRemoval)
 *
 * @param existing - Array de dependentes existentes
 * @param incoming - Array de novos dependentes a mergear
 * @returns Array mergeado sem duplicatas
 */
export function mergeDependents(
  existing: NonNullable<PartialClientInfo["dependents"]>,
  incoming: NonNullable<PartialClientInfo["dependents"]>
): NonNullable<PartialClientInfo["dependents"]> {
  // Criar mapa dos existentes
  const existingMap = new Map<
    string,
    NonNullable<PartialClientInfo["dependents"]>[number]
  >()
  // Mapa secundário por relationship+age para fallback
  const existingByRelAge = new Map<string, string>()

  for (const dep of existing) {
    const key = getDependentKey(dep)
    existingMap.set(key, dep)
    const relAgeKey = `${dep.relationship}:${dep.age ?? "unknown"}`
    if (!existingByRelAge.has(relAgeKey)) {
      existingByRelAge.set(relAgeKey, key)
    }
  }

  // Processar incoming
  for (const newDep of incoming) {
    let key = getDependentKey(newDep)
    let matchedKey: string | undefined = undefined

    if (existingMap.has(key)) {
      matchedKey = key
    } else if (newDep.name) {
      // Se incoming tem nome mas não encontrou match, tentar por relationship+age
      const relAgeKey = `${newDep.relationship}:${newDep.age ?? "unknown"}`
      if (existingByRelAge.has(relAgeKey)) {
        matchedKey = existingByRelAge.get(relAgeKey)!
        const oldDep = existingMap.get(matchedKey)!
        existingMap.delete(matchedKey)
        key = getDependentKey(newDep)
        existingMap.set(key, oldDep)
      }
    }

    if (matchedKey || existingMap.has(key)) {
      // Atualizar existente
      const existingDep = existingMap.get(key)!
      existingMap.set(key, {
        ...existingDep,
        ...(newDep.name && { name: newDep.name }),
        ...(newDep.age !== undefined && { age: newDep.age }),
        relationship: newDep.relationship || existingDep.relationship,
        healthConditions: Array.from(
          new Set([
            ...(existingDep.healthConditions || []),
            ...(newDep.healthConditions || [])
          ])
        )
      })
    } else {
      // Novo dependente
      existingMap.set(key, newDep)
    }
  }

  const result = Array.from(existingMap.values())

  console.log("[cache-invalidation] Dependents merged:", {
    existingCount: existing.length,
    incomingCount: incoming.length,
    resultCount: result.length
  })

  return result
}

/**
 * Merge inteligente de clientInfo
 *
 * Diferente do spread simples:
 * - Arrays são mergeados sem duplicatas
 * - Dependentes usam matching por nome ou relationship+age
 *
 * @param existing - ClientInfo existente
 * @param updates - Novos dados parciais
 * @returns ClientInfo mergeado
 */
export function smartMergeClientInfo(
  existing: PartialClientInfo,
  updates: Partial<PartialClientInfo>
): PartialClientInfo {
  const merged: PartialClientInfo = { ...existing }

  // Campos simples - sobrescreve se presente
  for (const key of [
    "name",
    "age",
    "city",
    "state",
    "budget",
    "currentPlan",
    "employer"
  ] as const) {
    if (updates[key] !== undefined) {
      ;(merged as Record<string, unknown>)[key] = updates[key]
    }
  }

  // Arrays simples - merge sem duplicatas
  if (updates.preferences) {
    merged.preferences = Array.from(
      new Set([...(existing.preferences || []), ...updates.preferences])
    )
  }

  if (updates.healthConditions) {
    merged.healthConditions = Array.from(
      new Set([
        ...(existing.healthConditions || []),
        ...updates.healthConditions
      ])
    )
  }

  // Dependentes - merge inteligente
  if (updates.dependents) {
    merged.dependents = mergeDependents(
      existing.dependents || [],
      updates.dependents
    )
  }

  return merged
}

/**
 * Aplica remoção de dependentes baseado em ScenarioChange
 *
 * MVP: Remove dependentes por relationship ou índice.
 * Usado quando intent é "alterar_dados" ou "simular_cenario"
 * com scenarioChange.type === "remove_dependent"
 *
 * @param clientInfo - ClientInfo atual
 * @param scenarioChange - Mudança de cenário com detalhes da remoção
 * @returns ClientInfo com dependentes removidos
 */
export function applyDependentRemoval(
  clientInfo: PartialClientInfo,
  scenarioChange: ScenarioChange
): PartialClientInfo {
  if (!clientInfo.dependents || clientInfo.dependents.length === 0) {
    console.log("[cache-invalidation] No dependents to remove")
    return clientInfo
  }

  if (scenarioChange.type !== "remove_dependent") {
    return clientInfo
  }

  const { relationship, index } = scenarioChange.details
  let removedCount = 0

  const filtered = clientInfo.dependents.filter((dep, idx) => {
    // Remover por índice (0-based)
    if (index !== undefined && idx === index) {
      removedCount++
      return false
    }

    // Remover por relationship (remove TODOS do mesmo tipo)
    if (relationship && dep.relationship === relationship) {
      removedCount++
      return false
    }

    return true
  })

  console.log("[cache-invalidation] Dependents removed:", {
    originalCount: clientInfo.dependents.length,
    removedCount,
    remainingCount: filtered.length,
    removalCriteria: { relationship, index }
  })

  return {
    ...clientInfo,
    dependents: filtered
  }
}

// ============================================================================
// CHANGE DETECTION
// ============================================================================

/**
 * Detecta se houve mudança nos dados do cliente
 *
 * NOTA: Invalidação conservadora - qualquer mudança em clientInfo invalida caches.
 * Isso evita inconsistências quando campos como preferences ou name afetam
 * a experiência do usuário de formas não óbvias.
 *
 * @param oldInfo - Dados anteriores do cliente
 * @param newInfo - Novos dados do cliente
 * @returns true se houver QUALQUER mudança nos dados
 */
export function hasSignificantChange(
  oldInfo: PartialClientInfo,
  newInfo: PartialClientInfo
): boolean {
  // Comparação profunda via JSON - qualquer mudança invalida cache
  return JSON.stringify(oldInfo) !== JSON.stringify(newInfo)
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
  // Usa merge inteligente ao invés de spread simples
  // Isso preserva dependentes existentes ao adicionar novos
  const mergedInfo = smartMergeClientInfo(oldInfo, newInfo)
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
 * @param scenarioChange - Mudança de cenário opcional (para remoção de dependentes)
 * @returns Partial state com clientInfo atualizado e caches invalidados se necessário
 */
export function processClientInfoUpdate(
  currentState: HealthPlanState,
  newClientData: Partial<PartialClientInfo>,
  scenarioChange?: ScenarioChange
): Partial<HealthPlanState> {
  // 1. Primeiro faz o merge inteligente dos novos dados
  const { shouldInvalidate, mergedInfo } = onClientInfoChange(
    currentState.clientInfo,
    newClientData
  )

  // 2. Se há scenarioChange de remoção, aplicar após o merge
  let finalInfo = mergedInfo
  if (scenarioChange?.type === "remove_dependent") {
    finalInfo = applyDependentRemoval(mergedInfo, scenarioChange)
    console.log("[cache-invalidation] Applied dependent removal")
  }

  const updates: Partial<HealthPlanState> = {
    clientInfo: finalInfo,
    clientInfoVersion: currentState.clientInfoVersion + 1
  }

  // 3. Determinar se precisa invalidar (considerando remoção também)
  const needsInvalidation =
    shouldInvalidate ||
    (scenarioChange?.type === "remove_dependent" &&
      finalInfo.dependents?.length !== mergedInfo.dependents?.length)

  if (needsInvalidation) {
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
