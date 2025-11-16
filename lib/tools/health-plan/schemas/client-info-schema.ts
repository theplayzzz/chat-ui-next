import { z } from "zod"

/**
 * Schema Zod para informações do cliente de planos de saúde
 * Baseado no PRD: RF-002 (linhas 56-77) e ClientInfo (linhas 987-1005)
 */

// Enum para tipos de relacionamento de dependentes
export const DependentRelationshipEnum = z.enum([
  "spouse",
  "child",
  "parent",
  "other"
])

// Schema para um dependente individual
export const DependentSchema = z.object({
  relationship: DependentRelationshipEnum,
  age: z
    .number()
    .int()
    .min(0, "Idade do dependente deve ser maior ou igual a 0")
    .max(120, "Idade do dependente deve ser menor que 120")
})

// Enum para tipo de rede credenciada
export const NetworkTypeEnum = z.enum(["broad", "restricted"])

// Schema para preferências do cliente
export const PreferencesSchema = z.object({
  networkType: NetworkTypeEnum.optional(),
  coParticipation: z.boolean().optional(),
  specificHospitals: z.array(z.string()).optional()
})

// Schema principal de informações do cliente
export const ClientInfoSchema = z.object({
  // Campos obrigatórios
  age: z
    .number()
    .int()
    .min(0, "Idade deve ser maior ou igual a 0")
    .max(120, "Idade deve ser menor que 120"),
  city: z.string().min(1, "Cidade é obrigatória"),
  state: z
    .string()
    .min(2, "Estado deve ter no mínimo 2 caracteres")
    .max(2, "Estado deve ser a sigla (ex: SP, RJ)")
    .toUpperCase(),
  budget: z.number().positive("Orçamento deve ser um valor positivo"),

  // Campos opcionais mas importantes
  dependents: z.array(DependentSchema).default([]),
  preExistingConditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  preferences: PreferencesSchema.optional(),

  // Metadata (adicionado para rastreamento)
  metadata: z
    .object({
      extractedAt: z.string().datetime().optional(),
      schemaVersion: z.string().default("1.0"),
      completeness: z.number().min(0).max(100).optional()
    })
    .optional()
})

// Schema parcial para permitir coleta incremental
export const PartialClientInfoSchema = ClientInfoSchema.partial()

/**
 * Schema para validação de campos obrigatórios mínimos
 * Usado para verificar se pode prosseguir para próximo step
 */
export const MinimalClientInfoSchema = z.object({
  age: z.number().int().min(0).max(120),
  city: z.string().min(1),
  state: z.string().length(2),
  budget: z.number().positive()
})

// Type exports derivados dos schemas
export type DependentRelationship = z.infer<typeof DependentRelationshipEnum>
export type Dependent = z.infer<typeof DependentSchema>
export type NetworkType = z.infer<typeof NetworkTypeEnum>
export type Preferences = z.infer<typeof PreferencesSchema>
export type ClientInfo = z.infer<typeof ClientInfoSchema>
export type PartialClientInfo = z.infer<typeof PartialClientInfoSchema>
export type MinimalClientInfo = z.infer<typeof MinimalClientInfoSchema>

/**
 * Lista de campos obrigatórios para progressão
 */
export const REQUIRED_FIELDS = ["age", "city", "state", "budget"] as const

/**
 * Labels amigáveis para campos (usado em mensagens de erro)
 */
export const FIELD_LABELS: Record<string, string> = {
  age: "idade",
  city: "cidade",
  state: "estado",
  budget: "orçamento mensal",
  dependents: "dependentes",
  preExistingConditions: "condições pré-existentes",
  medications: "medicamentos de uso contínuo",
  preferences: "preferências"
}

/**
 * Valida se as informações do cliente estão completas o suficiente
 * para prosseguir para o próximo step do processo
 */
export function isClientInfoComplete(
  info: PartialClientInfo
): info is MinimalClientInfo {
  const result = MinimalClientInfoSchema.safeParse(info)
  return result.success
}

/**
 * Calcula a porcentagem de completude das informações
 * Campos obrigatórios têm peso maior
 */
export function calculateCompleteness(info: PartialClientInfo): number {
  const weights = {
    age: 20,
    city: 15,
    state: 15,
    budget: 20,
    dependents: 10,
    preExistingConditions: 10,
    medications: 5,
    preferences: 5
  }

  let score = 0
  let maxScore = 0

  for (const [field, weight] of Object.entries(weights)) {
    maxScore += weight
    const value = info[field as keyof PartialClientInfo]

    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        // Arrays contam como completos se não estão vazios
        if (value.length > 0) {
          score += weight
        }
      } else if (typeof value === "object") {
        // Objetos contam como completos se têm pelo menos uma propriedade
        if (Object.keys(value).length > 0) {
          score += weight
        }
      } else {
        // Valores primitivos contam se estão presentes
        score += weight
      }
    }
  }

  return Math.round((score / maxScore) * 100)
}
