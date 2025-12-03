/**
 * Schemas do Health Plan Agent v2
 *
 * Re-exporta os schemas do v1 para manter consistência e evitar duplicação.
 * Quando necessário, podemos adicionar schemas específicos do v2 aqui.
 */

// Re-export all schemas from v1
export * from "@/lib/tools/health-plan/schemas/client-info-schema"
export * from "@/lib/tools/health-plan/schemas/compatibility-schemas"
export * from "@/lib/tools/health-plan/schemas/erp-response-schema"
export * from "@/lib/tools/health-plan/schemas/recommendation-schemas"
export * from "@/lib/tools/health-plan/schemas/anonymization-schemas"
