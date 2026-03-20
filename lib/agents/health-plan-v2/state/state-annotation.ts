/**
 * State Annotation para o Health Plan Agent v2
 *
 * Define o estado mutável e reativo do agente conversacional.
 * O estado é persistido automaticamente via PostgresSaver.
 */

import { Annotation, messagesStateReducer } from "@langchain/langgraph"
import type {
  UserIntent,
  PartialClientInfo,
  HealthPlanDocument,
  RankedAnalysis,
  ERPPriceResult,
  GenerateRecommendationResult,
  StateError
} from "../types"
import type { CollectionAnalysisResult } from "../nodes/rag/types"

/**
 * State Annotation do Health Plan Agent v2
 *
 * Usa reducers para permitir atualizações incrementais e merge de dados.
 */
export const HealthPlanStateAnnotation = Annotation.Root({
  // === IDENTIFICADORES ===
  workspaceId: Annotation<string>,
  userId: Annotation<string>,
  assistantId: Annotation<string>,
  chatId: Annotation<string>,

  // === CONVERSA ===
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => []
  }),

  lastIntent: Annotation<UserIntent | null>({
    reducer: (_, y) => y,
    default: () => null
  }),

  lastIntentConfidence: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0
  }),

  // === DADOS DO CLIENTE (MUTÁVEIS) ===
  clientInfo: Annotation<PartialClientInfo>({
    reducer: (current, update) => ({ ...current, ...update }), // Merge, não substitui
    default: () => ({})
  }),

  clientInfoVersion: Annotation<number>({
    reducer: (_, v) => v,
    default: () => 0
  }),

  // === RESULTADOS DE BUSCA (CACHEÁVEIS) ===
  searchResults: Annotation<HealthPlanDocument[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  searchResultsVersion: Annotation<number>({
    reducer: (_, v) => v,
    default: () => 0 // Incrementa quando clientInfo muda
  }),

  /**
   * Metadados da busca RAG por arquivo
   * PRD: Fase 6C.4
   */
  searchMetadata: Annotation<{
    query?: string
    totalFiles?: number
    filesWithResults?: number
    totalChunks?: number
    ragModel?: string
    executionTimeMs?: number
    gradingStats?: {
      highRelevance: number
      mediumRelevance: number
      lowRelevance: number
      irrelevant: number
    }
    /** Stats da análise por collection (Fase 6E) */
    collectionStats?: {
      totalCollections: number
      totalPlansIdentified: number
      highRelevancePlans: number
      mediumRelevancePlans: number
      lowRelevancePlans: number
    }
  } | null>({
    reducer: (_, y) => y,
    default: () => null
  }),

  /**
   * Análises por collection com planos identificados (Fase 6E)
   *
   * Contém análises consolidadas por operadora/collection,
   * identificando planos REAIS (não arquivos individuais).
   */
  collectionAnalyses: Annotation<CollectionAnalysisResult[]>({
    reducer: (_, y) => y,
    default: () => []
  }),

  /**
   * Contexto de análise RAG formatado em texto
   *
   * Contém o texto formatado com todas as análises de planos,
   * pronto para ser usado pelo agente principal nas respostas.
   *
   * Estrutura:
   * - Análises por arquivo ordenadas por relevância (high → medium → low)
   * - Cada análise inclui: COMPATIBILIDADE, DESTAQUES, ALERTAS, RESUMO
   * - Contexto da conversa considerado na avaliação
   */
  ragAnalysisContext: Annotation<string>({
    reducer: (_, newValue) => newValue,
    default: () => ""
  }),

  // === ANÁLISE (CACHEÁVEL) ===
  compatibilityAnalysis: Annotation<RankedAnalysis | null>({
    reducer: (_, y) => y,
    default: () => null
  }),

  analysisVersion: Annotation<number>({
    reducer: (_, v) => v,
    default: () => 0 // Incrementa quando searchResults muda
  }),

  // === PREÇOS (OPCIONAL, SOB DEMANDA) ===
  erpPrices: Annotation<ERPPriceResult | null>({
    reducer: (_, y) => y,
    default: () => null
  }),

  pricesRequested: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false // Só busca se usuário pedir
  }),

  // === RECOMENDAÇÃO (PODE GERAR MÚLTIPLAS VEZES) ===
  recommendation: Annotation<GenerateRecommendationResult | null>({
    reducer: (_, y) => y,
    default: () => null
  }),

  recommendationVersion: Annotation<number>({
    reducer: (_, v) => v,
    default: () => 0
  }),

  // === CONTROLE DE FLUXO ===
  isConversationActive: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => true // Só false quando usuário finaliza
  }),

  pendingAction: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null
  }),

  // === PROTEÇÃO CONTRA LOOP INFINITO ===
  loopIterations: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0 // Resetado a cada nova mensagem do usuário
  }),

  // === RESPOSTA ATUAL ===
  currentResponse: Annotation<string>({
    reducer: (_, y) => y,
    default: () => ""
  }),

  // === METADATA ===
  errors: Annotation<StateError[]>({
    reducer: (x, y) => {
      const combined = x.concat(y)
      // Limita a 50 erros mais recentes para evitar acúmulo de memória
      if (combined.length > 50) {
        return combined.slice(-50)
      }
      return combined
    },
    default: () => []
  })
})

/**
 * Tipo inferido do estado
 */
export type HealthPlanState = typeof HealthPlanStateAnnotation.State
