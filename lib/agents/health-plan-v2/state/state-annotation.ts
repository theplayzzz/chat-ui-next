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

  // === RESPOSTA ATUAL ===
  currentResponse: Annotation<string>({
    reducer: (_, y) => y,
    default: () => ""
  }),

  // === METADATA ===
  errors: Annotation<StateError[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  })
})

/**
 * Tipo inferido do estado
 */
export type HealthPlanState = typeof HealthPlanStateAnnotation.State
