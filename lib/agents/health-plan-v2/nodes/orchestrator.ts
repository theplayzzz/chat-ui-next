/**
 * Orchestrator Node - Nó principal do agente conversacional
 *
 * Responsável por:
 * - Receber mensagens do usuário
 * - Classificar intenções via GPT-4o
 * - Extrair dados relevantes da mensagem
 * - Atualizar estado com intenção e dados
 *
 * NOTA: O orchestrator NÃO gera respostas ao usuário.
 * As respostas são geradas pelas capacidades após o router decidir.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: 7 > Fase 4
 */

import type { BaseMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../state/state-annotation"
import type { UserIntent, PartialClientInfo, StateError } from "../types"
import {
  classifyIntent as classifyIntentGPT,
  isDataCollectionIntent
} from "../intent"

// ============================================================================
// ORCHESTRATOR NODE
// ============================================================================

/**
 * Nó orquestrador que processa mensagens e decide próxima ação
 *
 * Fluxo:
 * 1. Extrai última mensagem do usuário
 * 2. Classifica intenção via GPT-4o
 * 3. Extrai dados da mensagem (se aplicável)
 * 4. Atualiza estado com intenção e dados
 *
 * NOTA: O orchestrator NÃO gera respostas - apenas classifica.
 * As respostas são geradas pelas capacidades após o router.
 */
export async function orchestratorNode(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Messages é um array de BaseMessage do LangChain
  const messages = Array.isArray(state.messages) ? state.messages : []
  const lastMessage = messages[messages.length - 1]

  // Extrai o conteúdo da mensagem de forma segura
  const userContent = extractMessageContent(lastMessage)

  if (!userContent) {
    return {
      lastIntent: "conversar" as UserIntent,
      lastIntentConfidence: 0,
      currentResponse: "Não consegui entender sua mensagem. Pode repetir?"
    }
  }

  try {
    // Classificar intenção via GPT-4o
    const classificationResult = await classifyIntentGPT({
      message: userContent,
      conversationHistory: messages as BaseMessage[],
      currentState: state
    })

    console.log("[orchestrator] Intent classified:", {
      intent: classificationResult.intent,
      confidence: classificationResult.confidence,
      extractedDataKeys: Object.keys(classificationResult.extractedData || {}),
      reasoning: classificationResult.reasoning,
      latencyMs: classificationResult.latencyMs
    })

    // Preparar atualização do estado
    const stateUpdate: Partial<HealthPlanState> = {
      lastIntent: classificationResult.intent,
      lastIntentConfidence: classificationResult.confidence
    }

    // Se extraiu dados, fazer merge com clientInfo
    if (
      classificationResult.extractedData &&
      Object.keys(classificationResult.extractedData).length > 0 &&
      isDataCollectionIntent(classificationResult.intent)
    ) {
      const mergedClientInfo = mergeClientInfo(
        state.clientInfo,
        classificationResult.extractedData as unknown as Record<string, unknown>
      )

      stateUpdate.clientInfo = mergedClientInfo
      stateUpdate.clientInfoVersion = (state.clientInfoVersion || 0) + 1

      console.log("[orchestrator] Client info updated:", {
        newFields: Object.keys(classificationResult.extractedData),
        totalFields: Object.keys(mergedClientInfo).length,
        version: stateUpdate.clientInfoVersion
      })
    }

    // NOTA: O orchestrator NÃO gera currentResponse
    // Apenas classifica intenção e extrai dados
    // A resposta é gerada pela capacidade que executa após o router

    return stateUpdate
  } catch (error) {
    console.error("[orchestrator] Error classifying intent:", error)

    // Adicionar erro ao estado
    const errorEntry: StateError = {
      capability: "orchestrator",
      message: error instanceof Error ? error.message : "Erro desconhecido",
      timestamp: new Date().toISOString(),
      details: { userMessage: userContent }
    }

    return {
      lastIntent: "conversar" as UserIntent,
      lastIntentConfidence: 0.3,
      currentResponse:
        "Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente?",
      errors: [errorEntry]
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extrai conteúdo de texto de uma mensagem (BaseMessage ou string)
 */
function extractMessageContent(message: unknown): string {
  if (!message) {
    return ""
  }

  if (typeof message === "string") {
    return message
  }

  if (typeof message === "object" && "content" in message) {
    const content = (message as { content: unknown }).content
    if (typeof content === "string") {
      return content
    }
    if (Array.isArray(content)) {
      // Pode ser array de content parts
      return content
        .map(part => {
          if (typeof part === "string") return part
          if (typeof part === "object" && "text" in part) return part.text
          return ""
        })
        .join(" ")
    }
  }

  return ""
}

/**
 * Faz merge de clientInfo existente com dados extraídos
 */
function mergeClientInfo(
  existing: PartialClientInfo | undefined,
  extracted: Record<string, unknown>
): PartialClientInfo {
  const merged: PartialClientInfo = { ...existing }

  // Campos simples - sobrescreve se extraído
  if (extracted.name) merged.name = String(extracted.name)
  if (extracted.age) merged.age = Number(extracted.age)
  if (extracted.city) merged.city = String(extracted.city)
  if (extracted.state) merged.state = String(extracted.state)
  if (extracted.budget) merged.budget = Number(extracted.budget)
  if (extracted.currentPlan) merged.currentPlan = String(extracted.currentPlan)
  if (extracted.employer) merged.employer = String(extracted.employer)

  // Arrays - faz merge
  if (extracted.preferences && Array.isArray(extracted.preferences)) {
    merged.preferences = Array.from(
      new Set([...(merged.preferences || []), ...extracted.preferences])
    ) as string[]
  }

  if (extracted.healthConditions && Array.isArray(extracted.healthConditions)) {
    merged.healthConditions = Array.from(
      new Set([
        ...(merged.healthConditions || []),
        ...extracted.healthConditions
      ])
    ) as string[]
  }

  // Dependentes - merge inteligente
  if (extracted.dependents && Array.isArray(extracted.dependents)) {
    merged.dependents = mergeDependents(
      merged.dependents || [],
      (extracted.dependents as PartialClientInfo["dependents"]) || []
    )
  }

  return merged
}

/**
 * Gera uma chave única para identificar um dependente
 * Usa name se disponível, senão usa relationship + age
 */
function getDependentKey(
  dep: NonNullable<PartialClientInfo["dependents"]>[number]
): string {
  if (dep.name) {
    return `name:${dep.name.toLowerCase()}`
  }
  // Fallback: relationship + age (pode ter múltiplos filhos de idades diferentes)
  return `${dep.relationship}:${dep.age || "unknown"}`
}

/**
 * Merge inteligente de dependentes
 *
 * Regras:
 * 1. Dependente com mesmo nome → atualiza dados
 * 2. Dependente com mesmo relationship + age → atualiza dados
 * 3. Se incoming tem nome mas existing não, tenta match por relationship+age
 * 4. Novo dependente (sem match) → adiciona à lista
 * 5. Nunca remove dependentes existentes (apenas atualiza ou adiciona)
 */
function mergeDependents(
  existing: NonNullable<PartialClientInfo["dependents"]>,
  incoming: NonNullable<PartialClientInfo["dependents"]>
): NonNullable<PartialClientInfo["dependents"]> {
  // Criar mapa dos dependentes existentes por chave
  const existingMap = new Map<
    string,
    NonNullable<PartialClientInfo["dependents"]>[number]
  >()
  // Mapa secundário por relationship+age para fallback
  const existingByRelAge = new Map<string, string>() // relAge -> primaryKey

  for (const dep of existing) {
    const key = getDependentKey(dep)
    existingMap.set(key, dep)
    // Guardar referência por relationship+age
    const relAgeKey = `${dep.relationship}:${dep.age || "unknown"}`
    if (!existingByRelAge.has(relAgeKey)) {
      existingByRelAge.set(relAgeKey, key)
    }
  }

  // Processar dependentes incoming
  for (const newDep of incoming) {
    let key = getDependentKey(newDep)
    let matchedKey: string | undefined = undefined

    if (existingMap.has(key)) {
      matchedKey = key
    } else if (newDep.name) {
      // Se incoming tem nome mas não encontrou match, tentar por relationship+age
      const relAgeKey = `${newDep.relationship}:${newDep.age || "unknown"}`
      if (existingByRelAge.has(relAgeKey)) {
        matchedKey = existingByRelAge.get(relAgeKey)!
        // Remover a entrada antiga e usar nova chave com nome
        const oldDep = existingMap.get(matchedKey)!
        existingMap.delete(matchedKey)
        key = getDependentKey(newDep) // Usar chave com nome
        existingMap.set(key, oldDep)
      }
    }

    if (matchedKey || existingMap.has(key)) {
      // Atualizar dependente existente (merge de campos)
      const existingDep = existingMap.get(key)!
      existingMap.set(key, {
        ...existingDep,
        // Sobrescreve com novos valores se não undefined/null
        ...(newDep.name && { name: newDep.name }),
        ...(newDep.age && { age: newDep.age }),
        relationship: newDep.relationship || existingDep.relationship,
        // Merge de condições de saúde
        healthConditions: Array.from(
          new Set([
            ...(existingDep.healthConditions || []),
            ...(newDep.healthConditions || [])
          ])
        )
      })
    } else {
      // Novo dependente - adicionar
      existingMap.set(key, newDep)
    }
  }

  // Converter mapa de volta para array
  const result = Array.from(existingMap.values())

  console.log("[orchestrator] Dependents merged:", {
    existingCount: existing.length,
    incomingCount: incoming.length,
    resultCount: result.length,
    keys: Array.from(existingMap.keys())
  })

  return result
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  extractMessageContent,
  mergeClientInfo,
  mergeDependents,
  getDependentKey
}
