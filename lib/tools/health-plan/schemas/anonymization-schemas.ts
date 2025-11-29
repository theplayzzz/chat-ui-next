/**
 * Schemas Zod para anonimização de dados LGPD
 * Task 13.2 - Sistema de Auditoria e Compliance
 */

import { z } from "zod"

/**
 * Níveis de anonimização suportados
 * - full: Remove todos os dados pessoais identificáveis
 * - partial: Hash de CPF, mantém primeiro nome, cidade
 * - none: Dados originais preservados
 */
export const AnonymizationLevelSchema = z.enum(["full", "partial", "none"])
export type AnonymizationLevel = z.infer<typeof AnonymizationLevelSchema>

/**
 * Resultado de anonimização de client_info
 */
export const AnonymizedClientInfoSchema = z.object({
  // Campos sempre preservados (não identificáveis)
  age: z.number().optional(),
  ageRange: z.string().optional(), // Ex: "30-39" (usado em full)
  state: z.string().optional(),
  city: z.string().optional(), // Removido em full
  budget: z.number().optional(),
  dependents: z
    .array(
      z.object({
        relationship: z.string(),
        age: z.number().optional(),
        ageRange: z.string().optional()
      })
    )
    .optional(),
  preExistingConditions: z.array(z.string()).optional(), // Mantido (não é PII)
  medications: z.array(z.string()).optional(), // Mantido (não é PII)
  preferences: z
    .object({
      networkType: z.string().optional(),
      coParticipation: z.boolean().optional(),
      specificHospitals: z.array(z.string()).optional()
    })
    .optional(),

  // Campos sensíveis que podem ser mascarados
  cpf: z.string().optional(), // Hash ou removido
  cpfHash: z.string().optional(), // Hash SHA256 do CPF
  name: z.string().optional(), // Primeiro nome ou removido
  fullName: z.string().optional(), // Removido em partial/full
  email: z.string().optional(), // Removido em partial/full
  phone: z.string().optional(), // Removido em partial/full
  address: z.string().optional(), // Cidade apenas ou removido

  // Metadata de anonimização
  _anonymization: z
    .object({
      level: AnonymizationLevelSchema,
      appliedAt: z.string().datetime(),
      fieldsRemoved: z.array(z.string()),
      fieldsHashed: z.array(z.string())
    })
    .optional()
})

export type AnonymizedClientInfo = z.infer<typeof AnonymizedClientInfoSchema>

/**
 * Campos considerados dados pessoais (PII) conforme LGPD
 */
export const PERSONAL_DATA_FIELDS = [
  "cpf",
  "rg",
  "name",
  "fullName",
  "nome",
  "nomeCompleto",
  "email",
  "phone",
  "telefone",
  "celular",
  "address",
  "endereco",
  "enderecoCompleto",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro"
] as const

export type PersonalDataField = (typeof PERSONAL_DATA_FIELDS)[number]

/**
 * Campos que podem ser preservados parcialmente
 */
export const PARTIALLY_PRESERVABLE_FIELDS = [
  "name", // Preservar primeiro nome
  "city", // Preservar cidade (sem endereço completo)
  "cpf" // Hash
] as const

/**
 * Campos que nunca são dados pessoais e sempre são preservados
 */
export const NON_PERSONAL_FIELDS = [
  "age",
  "ageRange",
  "state",
  "budget",
  "dependents",
  "preExistingConditions",
  "medications",
  "preferences"
] as const

/**
 * Schema para configuração de anonimização por workspace
 */
export const WorkspaceAnonymizationConfigSchema = z.object({
  defaultLevel: AnonymizationLevelSchema.default("partial"),
  autoAnonymizeAfterDays: z.number().int().min(1).default(90),
  preserveFirstName: z.boolean().default(true),
  preserveCity: z.boolean().default(true),
  hashAlgorithm: z.enum(["sha256", "sha512"]).default("sha256")
})

export type WorkspaceAnonymizationConfig = z.infer<
  typeof WorkspaceAnonymizationConfigSchema
>

/**
 * Schema para resultado de operação de anonimização
 */
export const AnonymizationResultSchema = z.object({
  success: z.boolean(),
  originalFieldsCount: z.number(),
  removedFieldsCount: z.number(),
  hashedFieldsCount: z.number(),
  level: AnonymizationLevelSchema,
  appliedAt: z.string().datetime(),
  data: AnonymizedClientInfoSchema.optional(),
  error: z.string().optional()
})

export type AnonymizationResult = z.infer<typeof AnonymizationResultSchema>
