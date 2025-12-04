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
import { processClientInfoUpdate } from "../state/cache-invalidation"

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

    // Se extraiu dados, processar atualização com invalidação de cache (Task 23.5)
    if (
      classificationResult.extractedData &&
      Object.keys(classificationResult.extractedData).length > 0 &&
      isDataCollectionIntent(classificationResult.intent)
    ) {
      // Extrair scenarioChange para passagem separada (remoção de dependentes)
      const { scenarioChange, ...clientData } =
        classificationResult.extractedData

      // Usar processClientInfoUpdate para invalidação automática de cache
      // Isso invalida searchResults, analysis e recommendation se mudança for significativa
      // Passa scenarioChange para permitir remoção de dependentes (Issue 2 fix)
      const clientInfoUpdates = processClientInfoUpdate(
        state,
        clientData as Partial<PartialClientInfo>,
        scenarioChange
      )

      // Merge com stateUpdate
      Object.assign(stateUpdate, clientInfoUpdates)

      console.log(
        "[orchestrator] Client info updated with cache invalidation:",
        {
          newFields: Object.keys(clientData),
          totalFields: Object.keys(clientInfoUpdates.clientInfo || {}).length,
          version: clientInfoUpdates.clientInfoVersion,
          cacheInvalidated:
            clientInfoUpdates.searchResultsVersion === 0 ||
            clientInfoUpdates.analysisVersion === 0,
          scenarioChange: scenarioChange?.type
        }
      )
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

// ============================================================================
// EXPORTS
// ============================================================================

// NOTA: Funções de merge movidas para cache-invalidation.ts
// Use smartMergeClientInfo e mergeDependents de lá
export { extractMessageContent }
