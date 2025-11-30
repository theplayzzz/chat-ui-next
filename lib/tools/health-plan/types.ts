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

// ============================================================================
// ERP Integration Types (Task 8)
// ============================================================================

/**
 * Workspace ERP configuration stored in Supabase
 */
export interface WorkspaceERPConfig {
  id: string
  workspace_id: string
  api_url: string
  encrypted_api_key: string
  custom_headers: Record<string, string>
  timeout_ms: number
  retry_attempts: number
  cache_ttl_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Input for creating ERP configuration
 */
export interface ERPConfigInsert {
  workspace_id: string
  api_url: string
  api_key: string // Will be encrypted before storage
  custom_headers?: Record<string, string>
  timeout_ms?: number
  retry_attempts?: number
  cache_ttl_minutes?: number
}

/**
 * Input for updating ERP configuration
 */
export interface ERPConfigUpdate {
  api_url?: string
  api_key?: string // Will be encrypted before storage
  custom_headers?: Record<string, string>
  timeout_ms?: number
  retry_attempts?: number
  cache_ttl_minutes?: number
}

/**
 * Family profile for price calculation
 */
export interface FamilyProfile {
  titular: {
    idade: number
  }
  dependentes: Array<{
    relacao: "conjuge" | "filho" | "pai" | "mae" | "outro"
    idade: number
  }>
}

/**
 * Breakdown of family pricing
 */
export interface PriceBreakdown {
  titular: number
  dependentes: Array<{
    relacao: string
    idade: number
    preco: number
  }>
  subtotal: number
  descontos: number
  total: number
  model: PricingModel
}

/**
 * Pricing models supported by ERP
 */
export type PricingModel = "familia_unica" | "por_pessoa" | "faixa_etaria"

/**
 * Source of pricing data
 */
export type PriceSource = "live" | "cache" | "stale_cache" | "none"

/**
 * Result from fetchERPPrices
 */
export interface ERPPriceResult {
  success: boolean
  prices?: PriceBreakdown[]
  source: PriceSource
  cached_at: string | null
  is_fresh: boolean
  error?: string
  metadata?: {
    workspace_id: string
    plan_ids: string[]
    fetched_at: string
    cache_age_minutes?: number
  }
}

/**
 * ERP error information
 */
export interface ERPError {
  code: string
  message: string
  statusCode?: number
  attempt: number
  timestamp: string
}

/**
 * Discriminated union for ERP results
 */
export type ERPResult<T> =
  | { success: true; data: T; source: "api" }
  | { success: false; error: ERPError; canRetry: boolean }
