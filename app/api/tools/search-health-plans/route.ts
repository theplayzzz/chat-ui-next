/**
 * API Route: /api/tools/search-health-plans
 *
 * Endpoint para busca de planos de saúde em múltiplas collections
 * usando RAG e re-ranking avançado
 */

import { NextRequest, NextResponse } from "next/server"
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { searchHealthPlans } from "@/lib/tools/health-plan/search-health-plans"
import type { SearchHealthPlansParams } from "@/lib/tools/health-plan/types"

/**
 * POST /api/tools/search-health-plans
 *
 * Busca planos de saúde em múltiplas collections usando RAG
 *
 * Body:
 * - assistantId: string - ID do assistente health-plan
 * - clientInfo: PartialClientInfo - Informações do cliente
 * - topK?: number - Resultados por collection (default: 10)
 * - filters?: object - Filtros opcionais
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse do body
    const body = await request.json()
    const { assistantId, clientInfo, topK, filters } =
      body as SearchHealthPlansParams

    // 2. Validar parâmetros obrigatórios
    if (!assistantId) {
      return NextResponse.json(
        { error: "assistantId é obrigatório" },
        { status: 400 }
      )
    }

    if (!clientInfo) {
      return NextResponse.json(
        { error: "clientInfo é obrigatório" },
        { status: 400 }
      )
    }

    // 3. Obter profile do servidor
    const profile = await getServerProfile()

    // 4. Verificar API key da OpenAI
    if (profile.use_azure_openai) {
      checkApiKey(profile.azure_openai_api_key, "Azure OpenAI")
    } else {
      checkApiKey(profile.openai_api_key, "OpenAI")
    }

    // 5. Obter API key
    const apiKey = profile.use_azure_openai
      ? profile.azure_openai_api_key || ""
      : profile.openai_api_key || ""

    // 6. Executar busca
    console.log("[API] Iniciando busca de planos de saúde")
    console.log(`[API] AssistantId: ${assistantId}`)
    console.log(`[API] TopK: ${topK || 10}`)

    const response = await searchHealthPlans(
      {
        assistantId,
        clientInfo,
        topK,
        filters
      },
      apiKey
    )

    console.log(
      `[API] Busca concluída: ${response.results.length} resultados em ${response.metadata.executionTimeMs}ms`
    )

    // 7. Retornar resultados
    return NextResponse.json(response, { status: 200 })
  } catch (error: any) {
    console.error("[API] Erro ao buscar planos de saúde:", error)

    const errorMessage =
      error.message || "Erro interno ao buscar planos de saúde"
    const errorCode = error.status || 500

    return NextResponse.json({ error: errorMessage }, { status: errorCode })
  }
}
