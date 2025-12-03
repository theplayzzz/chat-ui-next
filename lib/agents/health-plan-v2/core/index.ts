/**
 * Core Logic do Health Plan Agent v2
 *
 * Re-exporta a lógica de negócio do v1 para reutilização.
 * O v2 usa as mesmas funções de:
 * - Extração de informações do cliente
 * - Busca de planos de saúde
 * - Análise de compatibilidade
 * - Consulta de preços ERP
 * - Geração de recomendações
 */

// Re-export core logic from v1
export { extractClientInfo } from "@/lib/tools/health-plan/extract-client-info"
export { searchHealthPlans } from "@/lib/tools/health-plan/search-health-plans"
export { analyzeCompatibility } from "@/lib/tools/health-plan/analyze-compatibility"
export { fetchERPPrices } from "@/lib/tools/health-plan/fetch-erp-prices"
export { generateRecommendation } from "@/lib/tools/health-plan/generate-recommendation"

// Types are defined in the v2 types.ts file or imported from shared types
// The v1 functions return typed results that can be used directly
