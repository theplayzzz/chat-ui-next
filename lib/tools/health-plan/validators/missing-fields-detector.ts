/**
 * Validação e detecção de campos faltantes
 * para informações do cliente
 */

import {
  ClientInfoSchema,
  PartialClientInfoSchema,
  MinimalClientInfoSchema,
  isClientInfoComplete,
  calculateCompleteness,
  REQUIRED_FIELDS,
  FIELD_LABELS,
  type PartialClientInfo,
  type ClientInfo
} from "../schemas/client-info-schema"
import type { ZodError } from "zod"

/**
 * Resultado do parsing de informações do cliente
 */
export interface ParseResult {
  success: boolean
  data?: PartialClientInfo
  errors?: string[]
  validationErrors?: ZodError
}

/**
 * Informação sobre campo faltante
 */
export interface MissingFieldInfo {
  field: string
  label: string
  isRequired: boolean
  priority: number // 1-5, onde 1 é mais prioritário
}

/**
 * Parse e valida JSON de resposta do GPT-4o
 *
 * @param rawResponse - String JSON retornada pelo GPT-4o
 * @returns ParseResult com dados validados ou erros
 */
export function parseClientInfo(rawResponse: string): ParseResult {
  try {
    // 1. Parse JSON
    const parsed = JSON.parse(rawResponse)

    // 2. Validar com schema parcial (permite campos faltantes)
    const validationResult = PartialClientInfoSchema.safeParse(parsed)

    if (!validationResult.success) {
      return {
        success: false,
        errors: validationResult.error.errors.map(err => err.message),
        validationErrors: validationResult.error
      }
    }

    return {
      success: true,
      data: validationResult.data
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        errors: [`JSON inválido: ${error.message}`]
      }
    }

    return {
      success: false,
      errors: [`Erro ao processar resposta: ${String(error)}`]
    }
  }
}

/**
 * Valida se ClientInfo está completo (todos campos obrigatórios preenchidos)
 *
 * @param clientInfo - Informações parciais do cliente
 * @returns true se completo, false caso contrário
 */
export function validateClientInfoComplete(
  clientInfo: PartialClientInfo
): clientInfo is ClientInfo {
  return isClientInfoComplete(clientInfo)
}

/**
 * Detecta campos obrigatórios que ainda estão faltando
 *
 * @param clientInfo - Informações parciais do cliente
 * @returns Array de campos faltantes com metadata
 */
export function detectMissingFields(
  clientInfo: PartialClientInfo
): MissingFieldInfo[] {
  const missing: MissingFieldInfo[] = []

  // Prioridades: campos obrigatórios primeiro
  const fieldPriorities: Record<string, number> = {
    age: 1,
    city: 1,
    state: 1,
    budget: 1,
    dependents: 2,
    preExistingConditions: 3,
    medications: 3,
    preferences: 4
  }

  // Verificar campos obrigatórios
  for (const field of REQUIRED_FIELDS) {
    const value = clientInfo[field as keyof PartialClientInfo]

    if (value === undefined || value === null) {
      missing.push({
        field,
        label: FIELD_LABELS[field] || field,
        isRequired: true,
        priority: fieldPriorities[field] || 5
      })
    }
  }

  // Verificar campos opcionais importantes
  const optionalImportantFields = [
    "dependents",
    "preExistingConditions",
    "medications"
  ]

  for (const field of optionalImportantFields) {
    const value = clientInfo[field as keyof PartialClientInfo]

    // Considera missing se nunca foi perguntado (undefined)
    // Não considera missing se foi explicitamente respondido como vazio ([])
    if (value === undefined) {
      missing.push({
        field,
        label: FIELD_LABELS[field] || field,
        isRequired: false,
        priority: fieldPriorities[field] || 5
      })
    }
  }

  // Ordenar por prioridade
  return missing.sort((a, b) => a.priority - b.priority)
}

/**
 * Gera lista de campos faltantes para exibição ao usuário
 *
 * @param clientInfo - Informações parciais do cliente
 * @returns Array de labels amigáveis dos campos faltantes
 */
export function getMissingFieldsLabels(
  clientInfo: PartialClientInfo
): string[] {
  const missing = detectMissingFields(clientInfo)
  return missing.map(m => m.label)
}

/**
 * Gera mensagem amigável sobre campos faltantes
 *
 * @param clientInfo - Informações parciais do cliente
 * @returns Mensagem formatada ou null se não há campos faltantes
 */
export function generateMissingFieldsMessage(
  clientInfo: PartialClientInfo
): string | null {
  const missing = detectMissingFields(clientInfo)

  if (missing.length === 0) {
    return null
  }

  const requiredMissing = missing.filter(m => m.isRequired)

  if (requiredMissing.length > 0) {
    const labels = requiredMissing.map(m => m.label).join(", ")
    return `Ainda preciso saber: ${labels}`
  }

  // Apenas campos opcionais faltando
  const optionalLabels = missing.map(m => m.label).join(", ")
  return `Informações opcionais que podem ajudar: ${optionalLabels}`
}

/**
 * Retorna o próximo campo mais prioritário a ser coletado
 *
 * @param clientInfo - Informações parciais do cliente
 * @returns MissingFieldInfo do campo mais prioritário ou null
 */
export function getNextFieldToCollect(
  clientInfo: PartialClientInfo
): MissingFieldInfo | null {
  const missing = detectMissingFields(clientInfo)

  if (missing.length === 0) {
    return null
  }

  // Retorna o primeiro (mais prioritário)
  return missing[0]
}

/**
 * Merge informações novas com informações existentes
 * Prioriza valores novos, mas mantém valores existentes se novos forem null/undefined
 *
 * @param existing - Informações existentes
 * @param updates - Novas informações
 * @returns Informações merged
 */
export function mergeClientInfo(
  existing: PartialClientInfo | undefined | null,
  updates: PartialClientInfo | undefined | null
): PartialClientInfo {
  // Handle null/undefined cases
  if (!existing && !updates) {
    return {}
  }
  if (!existing) {
    return updates ? { ...updates } : {}
  }
  if (!updates) {
    return { ...existing }
  }

  const merged: PartialClientInfo = { ...existing }

  // Para cada campo em updates
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null) {
      // Arrays: substituir completamente se novo array tem itens
      if (Array.isArray(value)) {
        if (value.length > 0) {
          ;(merged as any)[key] = value
        }
      }
      // Objetos: fazer merge profundo
      else if (typeof value === "object") {
        ;(merged as any)[key] = {
          ...(existing as any)[key],
          ...value
        }
      }
      // Primitivos: substituir
      else {
        ;(merged as any)[key] = value
      }
    }
  }

  return merged
}

/**
 * Valida valores específicos com regras de negócio
 *
 * @param clientInfo - Informações do cliente
 * @returns Array de warnings (não bloqueantes)
 */
export function validateBusinessRules(clientInfo: PartialClientInfo): string[] {
  const warnings: string[] = []

  // Validação de idade
  if (clientInfo.age !== undefined) {
    if (clientInfo.age < 18) {
      warnings.push("Titular menor de 18 anos pode requerer responsável legal")
    }
    if (clientInfo.age > 70) {
      warnings.push(
        "Idade acima de 70 anos pode ter restrições em alguns planos"
      )
    }
  }

  // Validação de dependentes
  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const totalPeople = 1 + clientInfo.dependents.length
    if (totalPeople > 10) {
      warnings.push(
        "Número alto de dependentes pode requerer plano empresarial"
      )
    }

    // Verificar se há dependentes idosos
    const elderlyDependents = clientInfo.dependents.filter(d => d.age > 60)
    if (elderlyDependents.length > 0) {
      warnings.push(
        "Dependentes acima de 60 anos podem ter mensalidade diferenciada"
      )
    }
  }

  // Validação de orçamento
  if (clientInfo.budget !== undefined) {
    const peopleCount = 1 + (clientInfo.dependents?.length || 0)
    const budgetPerPerson = clientInfo.budget / peopleCount

    if (budgetPerPerson < 200) {
      warnings.push(
        "Orçamento pode ser insuficiente para planos com boa cobertura"
      )
    }
  }

  // Validação de condições pré-existentes
  if (
    clientInfo.preExistingConditions &&
    clientInfo.preExistingConditions.length > 3
  ) {
    warnings.push("Múltiplas condições pré-existentes podem afetar carências")
  }

  return warnings
}
