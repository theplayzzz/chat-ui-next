/**
 * Tipos específicos para o classificador de intenções
 *
 * Complementa os tipos base de types.ts com tipos auxiliares
 * para o classificador GPT-4o.
 */

import type { UserIntent, PartialClientInfo, Dependent } from "../types"
import type { BaseMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../state/state-annotation"

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Threshold mínimo de confiança para aceitar uma classificação
 * Abaixo disso, fallback para "conversar"
 */
export const MIN_CONFIDENCE_THRESHOLD = 0.5

/**
 * Threshold de alta confiança (não requer alternativas)
 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.8

/**
 * Lista de todas as intenções válidas (para validação)
 */
export const VALID_INTENTS: UserIntent[] = [
  "fornecer_dados",
  "buscar_planos",
  "analisar",
  "consultar_preco",
  "pedir_recomendacao",
  "conversar",
  "alterar_dados",
  "simular_cenario",
  "finalizar"
]

/**
 * Intenções que coletam/alteram dados do cliente
 */
export const DATA_COLLECTION_INTENTS: UserIntent[] = [
  "fornecer_dados",
  "alterar_dados",
  "simular_cenario"
]

/**
 * Intenções que executam capacidades de negócio
 */
export const BUSINESS_CAPABILITY_INTENTS: UserIntent[] = [
  "buscar_planos",
  "analisar",
  "consultar_preco",
  "pedir_recomendacao"
]

// ============================================================================
// TIPOS DE DADOS EXTRAÍDOS
// ============================================================================

/**
 * Dados extraídos da mensagem do usuário
 * Estruturado para merge direto com clientInfo
 */
export interface ExtractedClientData {
  // Dados pessoais
  name?: string
  age?: number
  city?: string
  state?: string
  budget?: number

  // Dependentes
  dependents?: Dependent[]
  dependentCount?: number

  // Preferências
  preferences?: string[]
  healthConditions?: string[]
  currentPlan?: string
  employer?: string

  // Para simulações
  scenarioChange?: {
    type:
      | "add_dependent"
      | "remove_dependent"
      | "change_budget"
      | "change_location"
      | "other"
    details: Record<string, unknown>
  }

  // Para comparações/perguntas
  planName?: string
  questionTopic?: string
}

/**
 * Intenção alternativa detectada (para casos ambíguos)
 */
export interface AlternativeIntent {
  intent: UserIntent
  confidence: number
}

// ============================================================================
// INPUT/OUTPUT DO CLASSIFICADOR
// ============================================================================

/**
 * Input para a função classifyIntent
 */
export interface IntentClassificationInput {
  /** Mensagem atual do usuário */
  message: string

  /** Histórico de mensagens da conversa */
  conversationHistory: BaseMessage[]

  /** Estado atual do agente (para contexto) */
  currentState: Partial<HealthPlanState>
}

/**
 * Output completo da classificação de intenção
 */
export interface IntentClassificationOutput {
  /** Intenção principal detectada */
  intent: UserIntent

  /** Confiança na classificação (0-1) */
  confidence: number

  /** Dados extraídos da mensagem (se aplicável) */
  extractedData?: ExtractedClientData

  /** Raciocínio do modelo sobre a classificação */
  reasoning: string

  /** Intenções alternativas (se ambíguo) */
  alternativeIntents?: AlternativeIntent[]

  /** Tempo de processamento em ms */
  latencyMs?: number
}

// ============================================================================
// CATEGORIAS DE INTENÇÃO
// ============================================================================

/**
 * Categoria de intenção (para agrupamento)
 */
export type IntentCategory =
  | "data_collection" // fornecer_dados, alterar_dados
  | "business_action" // buscar_planos, analisar, pedir_recomendacao
  | "information" // consultar_preco, conversar
  | "simulation" // simular_cenario
  | "control" // finalizar

/**
 * Mapeia intenção para categoria
 */
export const INTENT_CATEGORY_MAP: Record<UserIntent, IntentCategory> = {
  fornecer_dados: "data_collection",
  alterar_dados: "data_collection",
  buscar_planos: "business_action",
  analisar: "business_action",
  pedir_recomendacao: "business_action",
  consultar_preco: "information",
  conversar: "information",
  simular_cenario: "simulation",
  finalizar: "control"
}

/**
 * Metadata sobre cada tipo de intenção
 */
export interface IntentMetadata {
  intent: UserIntent
  category: IntentCategory
  description: string
  examples: string[]
  extractsData: boolean
  requiresContext: boolean
}

/**
 * Metadata de todas as intenções
 */
export const INTENT_METADATA: IntentMetadata[] = [
  {
    intent: "fornecer_dados",
    category: "data_collection",
    description: "Usuário fornece informações pessoais",
    examples: ["Tenho 35 anos", "Moro em São Paulo", "Sou eu e minha esposa"],
    extractsData: true,
    requiresContext: false
  },
  {
    intent: "alterar_dados",
    category: "data_collection",
    description: "Usuário corrige ou altera dados já fornecidos",
    examples: [
      "Na verdade tenho 40 anos",
      "Corrija, são 3 dependentes",
      "Não, moro no RJ"
    ],
    extractsData: true,
    requiresContext: true
  },
  {
    intent: "buscar_planos",
    category: "business_action",
    description: "Usuário quer ver planos disponíveis",
    examples: [
      "Quero ver os planos",
      "Busque opções para mim",
      "Me mostre os planos disponíveis"
    ],
    extractsData: false,
    requiresContext: true
  },
  {
    intent: "analisar",
    category: "business_action",
    description: "Usuário quer análise de compatibilidade",
    examples: [
      "Analise esses planos",
      "Qual é o melhor para mim?",
      "Compare esses planos"
    ],
    extractsData: false,
    requiresContext: true
  },
  {
    intent: "pedir_recomendacao",
    category: "business_action",
    description: "Usuário pede recomendação personalizada",
    examples: [
      "Qual você recomenda?",
      "Me sugira um plano",
      "O que você indica?"
    ],
    extractsData: false,
    requiresContext: true
  },
  {
    intent: "consultar_preco",
    category: "information",
    description: "Usuário pergunta sobre preços",
    examples: ["Quanto custa?", "Me dê os preços", "Qual o valor do Bradesco?"],
    extractsData: false,
    requiresContext: true
  },
  {
    intent: "conversar",
    category: "information",
    description: "Dúvidas gerais ou conversa livre",
    examples: [
      "O que é coparticipação?",
      "Como funciona a carência?",
      "Oi, tudo bem?"
    ],
    extractsData: false,
    requiresContext: false
  },
  {
    intent: "simular_cenario",
    category: "simulation",
    description: "Usuário quer simular cenário hipotético",
    examples: [
      "E se eu adicionar minha mãe?",
      "Simule só para mim",
      "E se meu orçamento fosse R$1000?"
    ],
    extractsData: true,
    requiresContext: true
  },
  {
    intent: "finalizar",
    category: "control",
    description: "Usuário quer encerrar a conversa",
    examples: ["Obrigado, pode encerrar", "Até logo", "Finalizar conversa"],
    extractsData: false,
    requiresContext: false
  }
]

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Verifica se a intenção coleta dados
 */
export function isDataCollectionIntent(intent: UserIntent): boolean {
  return DATA_COLLECTION_INTENTS.includes(intent)
}

/**
 * Verifica se a intenção executa capacidade de negócio
 */
export function isBusinessCapabilityIntent(intent: UserIntent): boolean {
  return BUSINESS_CAPABILITY_INTENTS.includes(intent)
}

/**
 * Retorna a categoria de uma intenção
 */
export function getIntentCategory(intent: UserIntent): IntentCategory {
  return INTENT_CATEGORY_MAP[intent]
}

/**
 * Verifica se a confiança está acima do threshold mínimo
 */
export function isConfidenceAcceptable(confidence: number): boolean {
  return confidence >= MIN_CONFIDENCE_THRESHOLD
}

/**
 * Verifica se a confiança é alta (não precisa de alternativas)
 */
export function isHighConfidence(confidence: number): boolean {
  return confidence >= HIGH_CONFIDENCE_THRESHOLD
}
