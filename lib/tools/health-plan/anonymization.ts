/**
 * Funções de anonimização de dados para compliance LGPD
 * Task 13.2 - Sistema de Auditoria e Compliance
 *
 * Implementa três níveis de anonimização:
 * - full: Remove todos os dados pessoais, mantém apenas faixa etária e estado
 * - partial: Hash CPF, mantém primeiro nome, cidade (não endereço completo)
 * - none: Dados originais preservados
 *
 * Referência: PRD RF-012, LGPD Art. 5º (dados anonimizados)
 */

import { createHash } from "crypto"
import type { PartialClientInfo } from "./schemas/client-info-schema"
import {
  type AnonymizationLevel,
  type AnonymizedClientInfo,
  type AnonymizationResult,
  PERSONAL_DATA_FIELDS,
  AnonymizationLevelSchema
} from "./schemas/anonymization-schemas"

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Salt para hash de dados sensíveis
 * Em produção, isso deve vir de uma variável de ambiente
 */
const HASH_SALT = process.env.ANONYMIZATION_SALT || "lgpd-compliance-salt-2024"

/**
 * Faixas etárias para anonimização full
 */
const AGE_RANGES = [
  { min: 0, max: 17, label: "0-17" },
  { min: 18, max: 29, label: "18-29" },
  { min: 30, max: 39, label: "30-39" },
  { min: 40, max: 49, label: "40-49" },
  { min: 50, max: 59, label: "50-59" },
  { min: 60, max: 69, label: "60-69" },
  { min: 70, max: 79, label: "70-79" },
  { min: 80, max: 120, label: "80+" }
]

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Gera hash SHA256 de um valor com salt
 */
export function hashSensitiveField(value: string): string {
  if (!value || typeof value !== "string") {
    return ""
  }

  const hash = createHash("sha256")
  hash.update(value + HASH_SALT)
  return hash.digest("hex")
}

/**
 * Verifica se um campo é considerado dado pessoal (PII)
 */
export function isPersonalData(fieldName: string): boolean {
  const normalizedField = fieldName.toLowerCase()
  return PERSONAL_DATA_FIELDS.some(
    piiField =>
      normalizedField === piiField.toLowerCase() ||
      normalizedField.includes(piiField.toLowerCase())
  )
}

/**
 * Converte idade para faixa etária
 */
export function ageToRange(age: number): string {
  const range = AGE_RANGES.find(r => age >= r.min && age <= r.max)
  return range?.label || "desconhecida"
}

/**
 * Extrai primeiro nome de um nome completo
 */
export function extractFirstName(fullName: string): string {
  if (!fullName || typeof fullName !== "string") {
    return ""
  }
  const parts = fullName.trim().split(/\s+/)
  return parts[0] || ""
}

/**
 * Mascara CPF preservando apenas os últimos 2 dígitos
 */
export function maskCPF(cpf: string): string {
  if (!cpf || typeof cpf !== "string") {
    return ""
  }
  // Remove caracteres não numéricos
  const digits = cpf.replace(/\D/g, "")
  if (digits.length !== 11) {
    return "***.***.***-**"
  }
  return `***.***.***-${digits.slice(-2)}`
}

// =============================================================================
// MAIN ANONYMIZATION FUNCTIONS
// =============================================================================

/**
 * Anonimiza informações do cliente conforme nível especificado
 *
 * @param clientInfo - Informações do cliente a anonimizar
 * @param level - Nível de anonimização (full, partial, none)
 * @returns Informações anonimizadas
 */
export function anonymizeClientInfo(
  clientInfo: PartialClientInfo | Record<string, any>,
  level: AnonymizationLevel
): AnonymizedClientInfo {
  // Validar nível
  const validatedLevel = AnonymizationLevelSchema.safeParse(level)
  if (!validatedLevel.success) {
    throw new Error(`Invalid anonymization level: ${level}`)
  }

  // Se level é 'none', retorna dados originais com metadata
  if (level === "none") {
    return {
      ...clientInfo,
      _anonymization: {
        level: "none",
        appliedAt: new Date().toISOString(),
        fieldsRemoved: [],
        fieldsHashed: []
      }
    } as AnonymizedClientInfo
  }

  const result: AnonymizedClientInfo = {}
  const fieldsRemoved: string[] = []
  const fieldsHashed: string[] = []

  // Processar cada campo
  for (const [key, value] of Object.entries(clientInfo)) {
    if (value === undefined || value === null) continue

    switch (key) {
      // === CAMPOS SEMPRE PRESERVADOS (não são PII) ===
      case "state":
        result.state = value as string
        break

      case "budget":
        result.budget = value as number
        break

      case "preExistingConditions":
        result.preExistingConditions = value as string[]
        break

      case "medications":
        result.medications = value as string[]
        break

      case "preferences":
        result.preferences = value as AnonymizedClientInfo["preferences"]
        break

      // === CAMPOS COM TRATAMENTO ESPECIAL POR NÍVEL ===
      case "age":
        if (level === "full") {
          // Full: converter para faixa etária
          result.ageRange = ageToRange(value as number)
          fieldsRemoved.push("age")
        } else {
          // Partial: manter idade exata
          result.age = value as number
        }
        break

      case "city":
        if (level === "full") {
          // Full: remover cidade
          fieldsRemoved.push("city")
        } else {
          // Partial: manter cidade
          result.city = value as string
        }
        break

      case "dependents":
        if (Array.isArray(value)) {
          result.dependents = value.map(dep => {
            if (level === "full") {
              return {
                relationship: dep.relationship,
                ageRange:
                  dep.age !== undefined ? ageToRange(dep.age) : undefined
              }
            } else {
              return {
                relationship: dep.relationship,
                age: dep.age
              }
            }
          })
        }
        break

      // === CAMPOS SENSÍVEIS (PII) ===
      case "cpf":
        if (level === "full") {
          // Full: remover completamente
          fieldsRemoved.push("cpf")
        } else if (level === "partial") {
          // Partial: hash do CPF
          result.cpfHash = hashSensitiveField(value as string)
          fieldsHashed.push("cpf")
        }
        break

      case "name":
      case "nome":
        if (level === "full") {
          // Full: remover completamente
          fieldsRemoved.push(key)
        } else if (level === "partial") {
          // Partial: manter apenas primeiro nome
          result.name = extractFirstName(value as string)
        }
        break

      case "fullName":
      case "nomeCompleto":
        if (level === "full") {
          fieldsRemoved.push(key)
        } else if (level === "partial") {
          result.name = extractFirstName(value as string)
          fieldsRemoved.push(key)
        }
        break

      case "email":
      case "phone":
      case "telefone":
      case "celular":
      case "address":
      case "endereco":
      case "enderecoCompleto":
      case "cep":
      case "logradouro":
      case "numero":
      case "complemento":
      case "bairro":
      case "rg":
        // Sempre remover esses campos em partial e full
        fieldsRemoved.push(key)
        break

      // === CAMPOS NÃO MAPEADOS: verificar se é PII ===
      default:
        if (isPersonalData(key)) {
          fieldsRemoved.push(key)
        } else {
          // Preservar campos não reconhecidos que não são PII
          ;(result as any)[key] = value
        }
        break
    }
  }

  // Adicionar metadata de anonimização
  result._anonymization = {
    level,
    appliedAt: new Date().toISOString(),
    fieldsRemoved,
    fieldsHashed
  }

  return result
}

/**
 * Anonimiza informações com resultado detalhado
 *
 * @param clientInfo - Informações do cliente
 * @param level - Nível de anonimização
 * @returns Resultado com estatísticas e dados anonimizados
 */
export function anonymizeWithResult(
  clientInfo: PartialClientInfo | Record<string, any>,
  level: AnonymizationLevel
): AnonymizationResult {
  try {
    const originalFieldsCount = Object.keys(clientInfo).length
    const anonymized = anonymizeClientInfo(clientInfo, level)

    return {
      success: true,
      originalFieldsCount,
      removedFieldsCount: anonymized._anonymization?.fieldsRemoved.length || 0,
      hashedFieldsCount: anonymized._anonymization?.fieldsHashed.length || 0,
      level,
      appliedAt: new Date().toISOString(),
      data: anonymized
    }
  } catch (error) {
    return {
      success: false,
      originalFieldsCount: Object.keys(clientInfo).length,
      removedFieldsCount: 0,
      hashedFieldsCount: 0,
      level,
      appliedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Aplica upgrade de anonimização (partial -> full)
 * Usado no job de anonimização progressiva após 90 dias
 *
 * @param clientInfo - Informações já anonimizadas em nível partial
 * @returns Informações anonimizadas em nível full
 */
export function upgradeAnonymization(
  clientInfo: AnonymizedClientInfo
): AnonymizedClientInfo {
  const currentLevel = clientInfo._anonymization?.level

  // Se já está em full ou none, não faz nada
  if (currentLevel === "full" || currentLevel === "none") {
    return clientInfo
  }

  // Aplicar anonimização full
  return anonymizeClientInfo(clientInfo, "full")
}

/**
 * Verifica se dados estão adequadamente anonimizados para um nível
 *
 * @param data - Dados a verificar
 * @param expectedLevel - Nível esperado de anonimização
 * @returns true se os dados atendem ao nível esperado
 */
export function isProperlyAnonymized(
  data: AnonymizedClientInfo,
  expectedLevel: AnonymizationLevel
): boolean {
  if (expectedLevel === "none") {
    return true
  }

  // Verificar se não há campos PII que deveriam estar removidos
  const sensitiveFieldsPresent = Object.keys(data).filter(key => {
    if (key === "_anonymization") return false
    return isPersonalData(key)
  })

  if (expectedLevel === "full") {
    // Full não deve ter nenhum campo PII, nem cidade, nem idade exata
    const hasAge = "age" in data && data.age !== undefined
    const hasCity = "city" in data && data.city !== undefined
    const hasPII = sensitiveFieldsPresent.length > 0

    return !hasAge && !hasCity && !hasPII
  }

  if (expectedLevel === "partial") {
    // Partial pode ter primeiro nome e cidade, mas não CPF em texto plano
    const hasCPFPlain = "cpf" in data && data.cpf !== undefined
    const hasFullName = "fullName" in data && data.fullName !== undefined
    const hasEmail = "email" in data && data.email !== undefined
    const hasPhone = "phone" in data && data.phone !== undefined

    return !hasCPFPlain && !hasFullName && !hasEmail && !hasPhone
  }

  return true
}

/**
 * Lista campos sensíveis encontrados em um objeto
 * Útil para debugging e auditoria
 */
export function findSensitiveFields(data: Record<string, any>): string[] {
  const sensitiveFields: string[] = []

  function scan(obj: any, path: string = "") {
    if (obj === null || obj === undefined) return

    if (typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key

        if (isPersonalData(key)) {
          sensitiveFields.push(fullPath)
        }

        scan(value, fullPath)
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        scan(item, `${path}[${index}]`)
      })
    }
  }

  scan(data)
  return sensitiveFields
}
