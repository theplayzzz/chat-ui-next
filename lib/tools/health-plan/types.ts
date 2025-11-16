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

export type { ClientInfo, PartialClientInfo }
