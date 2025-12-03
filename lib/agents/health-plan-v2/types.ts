/**
 * Tipos compartilhados para o Health Plan Agent v2
 */

/**
 * Intenções possíveis do usuário
 */
export type UserIntent =
  | "fornecer_dados" // Fornecendo idade, dependentes, cidade, etc.
  | "buscar_planos" // "Quero ver os planos", "Busque opções"
  | "analisar" // "Analise esses planos", "Qual é melhor?"
  | "consultar_preco" // "Quanto custa?", "Me dê os preços"
  | "pedir_recomendacao" // "Me recomende", "Qual você sugere?"
  | "conversar" // Dúvidas gerais, perguntas
  | "alterar_dados" // "Na verdade tenho 35 anos", "Adicione meu filho"
  | "simular_cenario" // "E se eu tirar meu filho?", "Simule só para mim"
  | "finalizar" // "Obrigado", "Pode fechar", "Finalizar"

/**
 * Resultado da classificação de intenção
 */
export interface IntentClassificationResult {
  intent: UserIntent
  confidence: number
  extractedData?: Record<string, unknown>
  reasoning?: string
}

/**
 * Informações parciais do cliente (mutáveis)
 */
export interface PartialClientInfo {
  name?: string
  age?: number
  city?: string
  state?: string
  budget?: number
  dependents?: Dependent[]
  preferences?: string[]
  healthConditions?: string[]
  currentPlan?: string
  employer?: string
}

/**
 * Dependente do cliente
 */
export interface Dependent {
  name?: string
  age: number
  relationship: "spouse" | "child" | "parent" | "other"
  healthConditions?: string[]
}

/**
 * Documento de plano de saúde (resultado da busca RAG)
 */
export interface HealthPlanDocument {
  id: string
  operadora: string
  nome_plano: string
  tipo: string
  abrangencia: string
  coparticipacao: boolean
  rede_credenciada: string[]
  carencias: Record<string, number>
  preco_base?: number
  metadata: Record<string, unknown>
  similarity_score?: number
}

/**
 * Resultado da análise de compatibilidade
 */
export interface CompatibilityAnalysis {
  planId: string
  score: number
  pros: string[]
  cons: string[]
  compatibility: "alta" | "media" | "baixa"
  recommendation?: string
}

/**
 * Análise ranqueada
 */
export interface RankedAnalysis {
  analyses: CompatibilityAnalysis[]
  topRecommendation: string
  reasoning: string
  timestamp: string
}

/**
 * Resultado de preços do ERP
 */
export interface ERPPriceResult {
  success: boolean
  prices: Array<{
    planId: string
    planName: string
    basePrice: number
    finalPrice: number
    discount?: number
  }>
  source: "erp" | "mock" | "cache"
  timestamp: string
  error?: string
}

/**
 * Resultado da geração de recomendação
 */
export interface GenerateRecommendationResult {
  markdown: string
  topPlanId: string
  alternativeIds: string[]
  highlights: string[]
  warnings: string[]
  nextSteps: string[]
  version: number
  timestamp: string
}

/**
 * Erro registrado no estado
 */
export interface StateError {
  capability: string
  message: string
  timestamp: string
  details?: Record<string, unknown>
}

/**
 * Configuração do agente
 */
export interface AgentConfig {
  workspaceId: string
  userId: string
  assistantId: string
  chatId: string
  model?: string
  temperature?: number
  maxTokens?: number
}
