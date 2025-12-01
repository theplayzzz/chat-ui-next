/**
 * LangSmith Setup
 *
 * Configuração oficial do LangSmith usando as abstrações recomendadas:
 * - wrapOpenAI: Auto-tracing de chamadas OpenAI
 * - traceable: Decorator para funções customizadas
 *
 * Referência: PRD RF-013, Documentação LangSmith SDK
 */

import OpenAI from "openai"
import { wrapOpenAI } from "langsmith/wrappers"
import { traceable, getCurrentRunTree } from "langsmith/traceable"
import { RunTree } from "langsmith"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Tipos de run suportados pelo LangSmith
 */
export type LangSmithRunType =
  | "chain"
  | "llm"
  | "tool"
  | "retriever"
  | "embedding"

/**
 * Opções para traceable
 */
export interface TraceableOptions {
  name: string
  run_type?: LangSmithRunType
  tags?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Resultado da verificação de configuração
 */
export interface ConfigCheckResult {
  valid: boolean
  enabled: boolean
  errors: string[]
  warnings: string[]
  config: {
    apiKey: boolean
    tracing: boolean
    project: string
    endpoint: string
  }
}

/**
 * Configuração do cliente OpenAI trackeado
 */
export interface TracedOpenAIConfig {
  apiKey: string
  defaultMetadata?: Record<string, unknown>
  defaultTags?: string[]
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Nomes dos steps do workflow para consistência
 */
export const WORKFLOW_STEP_NAMES = {
  EXTRACT_CLIENT_INFO: "extractClientInfo",
  SEARCH_HEALTH_PLANS: "searchHealthPlans",
  ANALYZE_COMPATIBILITY: "analyzeCompatibility",
  FETCH_ERP_PRICES: "fetchERPPrices",
  GENERATE_RECOMMENDATION: "generateRecommendation"
} as const

/**
 * Run types recomendados para cada step
 */
export const STEP_RUN_TYPES: Record<string, LangSmithRunType> = {
  [WORKFLOW_STEP_NAMES.EXTRACT_CLIENT_INFO]: "chain",
  [WORKFLOW_STEP_NAMES.SEARCH_HEALTH_PLANS]: "retriever",
  [WORKFLOW_STEP_NAMES.ANALYZE_COMPATIBILITY]: "chain",
  [WORKFLOW_STEP_NAMES.FETCH_ERP_PRICES]: "tool",
  [WORKFLOW_STEP_NAMES.GENERATE_RECOMMENDATION]: "chain"
}

/**
 * Configuração padrão do LangSmith
 */
export const LANGSMITH_DEFAULTS = {
  project: process.env.LANGSMITH_PROJECT || "health-plan-agent",
  endpoint: process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com",
  version: "2.0.0" // Nova versão após refatoração
} as const

// =============================================================================
// CONFIGURATION CHECK
// =============================================================================

/**
 * Verifica se o LangSmith está configurado corretamente
 *
 * @returns Resultado da verificação com erros e warnings
 */
export function checkLangSmithConfig(): ConfigCheckResult {
  const errors: string[] = []
  const warnings: string[] = []

  const apiKey = process.env.LANGSMITH_API_KEY
  const tracing = process.env.LANGSMITH_TRACING

  // Verificar API key (obrigatório)
  if (!apiKey) {
    errors.push("LANGSMITH_API_KEY não está definido")
  }

  // Verificar LANGSMITH_TRACING (obrigatório para auto-tracing)
  if (!tracing || tracing !== "true") {
    errors.push("LANGSMITH_TRACING deve ser 'true' para habilitar auto-tracing")
  }

  // Warnings opcionais
  if (!process.env.LANGSMITH_PROJECT) {
    warnings.push(
      `LANGSMITH_PROJECT não definido, usando padrão: "${LANGSMITH_DEFAULTS.project}"`
    )
  }

  if (process.env.LANGSMITH_WORKSPACE_ID) {
    // Workspace ID presente é bom para org-scoped keys
  } else if (apiKey?.startsWith("lsv2_sk_")) {
    warnings.push(
      "LANGSMITH_WORKSPACE_ID pode ser necessário para org-scoped API keys"
    )
  }

  return {
    valid: errors.length === 0,
    enabled: !!apiKey && tracing === "true",
    errors,
    warnings,
    config: {
      apiKey: !!apiKey,
      tracing: tracing === "true",
      project: LANGSMITH_DEFAULTS.project,
      endpoint: LANGSMITH_DEFAULTS.endpoint
    }
  }
}

/**
 * Verifica configuração e loga resultado
 */
export function validateAndLogConfig(): boolean {
  const result = checkLangSmithConfig()

  if (result.errors.length > 0) {
    console.error("[langsmith-setup] Erros de configuração:")
    result.errors.forEach(err => console.error(`  - ${err}`))
  }

  if (result.warnings.length > 0) {
    console.warn("[langsmith-setup] Avisos:")
    result.warnings.forEach(warn => console.warn(`  - ${warn}`))
  }

  if (result.valid) {
    console.log("[langsmith-setup] Configuração válida:", {
      project: result.config.project,
      tracing: result.config.tracing
    })
  }

  return result.valid
}

// =============================================================================
// TRACED OPENAI CLIENT
// =============================================================================

/**
 * Tipo para cliente OpenAI (com ou sem tracing)
 * Usa tipo genérico para compatibilidade com wrapOpenAI
 */
export type TracedOpenAIClient = OpenAI

/**
 * Cria um cliente OpenAI com tracing automático do LangSmith
 *
 * Todas as chamadas feitas através deste cliente serão automaticamente
 * trackeadas no LangSmith com token usage, latência, etc.
 *
 * @param config - Configuração do cliente
 * @returns Cliente OpenAI com tracing
 *
 * @example
 * const openai = createTracedOpenAI({ apiKey: "sk-..." })
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   messages: [{ role: "user", content: "Hello" }]
 * })
 * // Automaticamente trackeado no LangSmith
 */
export function createTracedOpenAI(
  config: TracedOpenAIConfig
): TracedOpenAIClient {
  const client = new OpenAI({ apiKey: config.apiKey })

  // Se tracing não estiver habilitado, retorna cliente sem wrapper
  if (process.env.LANGSMITH_TRACING !== "true") {
    console.warn(
      "[langsmith-setup] LANGSMITH_TRACING não é 'true', retornando cliente sem tracing"
    )
    return client
  }

  // Wrap com LangSmith para auto-tracing
  // Usamos 'as any' para resolver incompatibilidade entre versões OpenAI/LangSmith
  const tracedClient = wrapOpenAI(client as any, {
    // Metadata padrão aplicado a todas as chamadas
    ...(config.defaultMetadata && { metadata: config.defaultMetadata }),
    ...(config.defaultTags && { tags: config.defaultTags })
  })

  // Retorna como TracedOpenAIClient para manter interface OpenAI
  return tracedClient as unknown as TracedOpenAIClient
}

/**
 * Cria cliente OpenAI trackeado com configuração simplificada
 *
 * @param apiKey - Chave da API OpenAI
 * @returns Cliente OpenAI com tracing
 */
export function createSimpleTracedOpenAI(apiKey: string): TracedOpenAIClient {
  return createTracedOpenAI({ apiKey })
}

// =============================================================================
// TRACEABLE HELPERS
// =============================================================================

/**
 * Cria opções de traceable para um step do workflow
 *
 * @param stepNumber - Número do step (1-5)
 * @param stepName - Nome do step
 * @param additionalTags - Tags adicionais
 * @param additionalMetadata - Metadata adicional
 * @returns Opções formatadas para traceable
 */
export function createStepTraceOptions(
  stepNumber: number,
  stepName: string,
  additionalTags?: string[],
  additionalMetadata?: Record<string, unknown>
): TraceableOptions {
  return {
    name: stepName,
    run_type: STEP_RUN_TYPES[stepName] || "chain",
    tags: [
      "health-plan",
      `step-${stepNumber}`,
      stepName,
      ...(additionalTags || [])
    ],
    metadata: {
      step: stepNumber,
      stepName,
      version: LANGSMITH_DEFAULTS.version,
      ...additionalMetadata
    }
  }
}

/**
 * Adiciona metadata à run atual
 *
 * Deve ser chamado dentro de uma função traceable
 *
 * @param metadata - Metadata a adicionar
 */
export function addRunMetadata(metadata: Record<string, unknown>): void {
  try {
    const runTree = getCurrentRunTree()
    if (runTree) {
      runTree.extra = {
        ...runTree.extra,
        metadata: {
          ...(runTree.extra?.metadata as Record<string, unknown>),
          ...metadata
        }
      }
    }
  } catch {
    // Silently ignore if not in a traceable context
  }
}

/**
 * Adiciona tags à run atual
 *
 * Deve ser chamado dentro de uma função traceable
 *
 * @param tags - Tags a adicionar
 */
export function addRunTags(tags: string[]): void {
  try {
    const runTree = getCurrentRunTree()
    if (runTree) {
      runTree.tags = [...(runTree.tags || []), ...tags]
    }
  } catch {
    // Silently ignore if not in a traceable context
  }
}

/**
 * Define o session_id para agrupar runs de uma conversa
 *
 * Deve ser chamado dentro de uma função traceable
 *
 * @param sessionId - ID da sessão/chat para agrupamento
 */
export function setSessionId(sessionId: string): void {
  addRunMetadata({ session_id: sessionId })
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Re-exportar traceable e getCurrentRunTree para uso direto
export { traceable, getCurrentRunTree, RunTree }

// Re-exportar wrapOpenAI para casos especiais
export { wrapOpenAI }
