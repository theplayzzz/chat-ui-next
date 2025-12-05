/**
 * Prompts do Health Plan Agent v2
 *
 * Re-exporta os prompts do v1 para manter consistência.
 * Prompts específicos do v2 (como classificação de intenção) serão adicionados aqui.
 */

// Re-export all prompts from v1
export * from "@/lib/tools/health-plan/prompts/extraction-prompts"
export * from "@/lib/tools/health-plan/prompts/compatibility-prompts"
export * from "@/lib/tools/health-plan/prompts/recommendation-prompts"

// V2-specific prompts
export * from "./rag-prompts"
