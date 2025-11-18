/**
 * Types compartilhados para o Health Plan Agent
 * Referência: PRD health-plan-agent-prd.md
 */

import type {
  ClientInfo,
  PartialClientInfo
} from "./schemas/client-info-schema"

/**
 * Resultado da extração de informações do cliente
 */
export interface ExtractClientInfoResult {
  success: boolean
  clientInfo: PartialClientInfo
  missingRequiredFields: string[]
  completeness: number
  message?: string
  errors?: string[]
}

/**
 * Contexto de uma sessão de coleta de informações
 */
export interface ClientInfoSession {
  sessionId: string
  chatId: string
  userId: string
  clientInfo: PartialClientInfo
  completeness: number
  isComplete: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Parâmetros para a tool extractClientInfo
 */
export interface ExtractClientInfoParams {
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
  currentInfo?: PartialClientInfo
  sessionId?: string
}

/**
 * Resposta da tool extractClientInfo
 */
export interface ExtractClientInfoResponse {
  clientInfo: PartialClientInfo
  missingFields: string[]
  isComplete: boolean
  completeness: number
  nextQuestion?: string
}

/**
 * Parâmetros para a tool searchHealthPlans
 */
export interface SearchHealthPlansParams {
  assistantId: string
  clientInfo: PartialClientInfo
  topK?: number // Número de resultados por collection (default: 10)
  filters?: {
    region?: {
      state?: string
      city?: string
    }
    operator?: string
    priceRange?: {
      min?: number
      max?: number
    }
    planType?: string
  }
}

/**
 * Resultado individual de busca de plano de saúde
 */
export interface HealthPlanSearchResult {
  content: string
  similarity: number
  collectionId: string
  collectionName: string
  fileId: string
  metadata?: Record<string, any>
}

/**
 * Resposta da tool searchHealthPlans
 */
export interface SearchHealthPlansResponse {
  results: HealthPlanSearchResult[]
  metadata: {
    totalCollectionsSearched: number
    query: string
    executionTimeMs: number
    totalResultsBeforeFiltering?: number
  }
}

/**
 * Parâmetros para a tool analyzeCompatibility
 */
export interface AnalyzeCompatibilityParams {
  clientInfo: ClientInfo
  plans: Array<{
    planId: string
    planName: string
    operadora?: string
    collectionId: string
    collectionName: string
    documents: HealthPlanSearchResult[]
  }>
  options?: {
    topK?: number
    includeAlternatives?: boolean
    detailedReasoning?: boolean
    maxConcurrency?: number
    timeoutMs?: number
  }
}

/**
 * Análise de compatibilidade de um plano
 */
export interface PlanCompatibilityAnalysis {
  planId: string
  planName: string
  operadora?: string
  collectionId: string
  collectionName: string
  score: {
    overall: number
    breakdown: {
      eligibility: number
      coverage: number
      budget: number
      network: number
      preferences: number
    }
  }
  pros: string[]
  cons: string[]
  alerts: Array<{
    type: string
    severity: "high" | "medium" | "low"
    description: string
  }>
  reasoning: string
  analyzedAt: string
  confidence: number
}

/**
 * Resposta da tool analyzeCompatibility
 */
export interface AnalyzeCompatibilityResponse {
  ranking: {
    recommended: PlanCompatibilityAnalysis
    alternatives: PlanCompatibilityAnalysis[]
    budget: PlanCompatibilityAnalysis | null
    premium: PlanCompatibilityAnalysis | null
  }
  executionTimeMs: number
  metadata: {
    totalPlansAnalyzed: number
    analysisVersion: string
    modelUsed: string
  }
}

export type { ClientInfo, PartialClientInfo }
