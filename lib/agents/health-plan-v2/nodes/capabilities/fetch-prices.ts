/**
 * Capacidade: fetchPrices
 *
 * Consulta preços no ERP configurado por workspace.
 * Busca configuração do ERP na tabela workspace_erp_config,
 * faz requisição à API externa e retorna preços dos planos.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-006
 */

import { AIMessage } from "@langchain/core/messages"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"
import type { HealthPlanState } from "../../state/state-annotation"
import type { ERPPriceResult } from "../../types"
import { humanizeResponse, type HumanizeMessageType } from "./humanize-response"

// =============================================================================
// Types
// =============================================================================

interface ERPConfig {
  api_url: string
  encrypted_api_key: string
  custom_headers: Record<string, string>
  timeout_ms: number
  retry_attempts: number
  cache_ttl_minutes: number
}

interface ERPPriceRequest {
  client_age?: number
  client_state?: string
  client_city?: string
  dependents_count?: number
  dependents?: Array<{ age?: number; relationship?: string }>
  plan_ids?: string[]
  health_conditions?: string[]
}

interface ERPPriceResponseItem {
  plan_id: string
  plan_name: string
  base_price: number
  final_price: number
  discount?: number
  currency?: string
  valid_until?: string
}

// =============================================================================
// Cache simples em memória (por workspace)
// =============================================================================

const priceCache = new Map<string, { data: ERPPriceResult; expiry: number }>()

function getCacheKey(
  workspaceId: string,
  clientAge?: number,
  state?: string
): string {
  return `${workspaceId}:${clientAge || ""}:${state || ""}`
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Busca preços dos planos no ERP configurado para o workspace
 */
export async function fetchPrices(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  console.log("[fetchPrices] Iniciando consulta de preços ERP...")

  const { workspaceId, clientInfo } = state

  try {
    // 1. Buscar configuração ERP do workspace
    const erpConfig = await getERPConfig(workspaceId)

    if (!erpConfig) {
      console.log(
        "[fetchPrices] Nenhuma configuração ERP encontrada para workspace"
      )
      return createFallbackResponse(state, "erp_not_configured")
    }

    // 2. Verificar cache
    const cacheKey = getCacheKey(workspaceId, clientInfo.age, clientInfo.state)
    const cached = priceCache.get(cacheKey)
    if (cached && cached.expiry > Date.now()) {
      console.log("[fetchPrices] Retornando preços do cache")
      return createPriceResponse(state, cached.data)
    }

    // 3. Preparar request para o ERP
    const requestBody: ERPPriceRequest = {
      client_age: clientInfo.age,
      client_state: clientInfo.state,
      client_city: clientInfo.city,
      dependents_count: clientInfo.dependents?.length || 0,
      dependents: clientInfo.dependents?.map(d => ({
        age: d.age,
        relationship: d.relationship
      })),
      health_conditions: clientInfo.healthConditions
    }

    // Adicionar plan_ids dos searchResults se disponíveis
    if (state.searchResults.length > 0) {
      requestBody.plan_ids = state.searchResults.map(r => r.id)
    }

    // 4. Fazer requisição ao ERP com retry
    const priceResult = await callERPWithRetry(
      erpConfig,
      requestBody,
      erpConfig.retry_attempts
    )

    // 5. Cachear resultado
    if (priceResult.success) {
      priceCache.set(cacheKey, {
        data: priceResult,
        expiry: Date.now() + erpConfig.cache_ttl_minutes * 60 * 1000
      })
    }

    return createPriceResponse(state, priceResult)
  } catch (error) {
    console.error("[fetchPrices] Erro:", error)
    return createFallbackResponse(state, "error")
  }
}

// =============================================================================
// ERP Configuration
// =============================================================================

async function getERPConfig(workspaceId: string): Promise<ERPConfig | null> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from("workspace_erp_config")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single()

  if (error || !data) {
    console.log("[fetchPrices] ERP config not found:", error?.message)
    return null
  }

  return {
    api_url: data.api_url,
    encrypted_api_key: data.encrypted_api_key,
    custom_headers: (data.custom_headers as Record<string, string>) || {},
    timeout_ms: data.timeout_ms || 10000,
    retry_attempts: data.retry_attempts || 2,
    cache_ttl_minutes: data.cache_ttl_minutes || 15
  }
}

// =============================================================================
// ERP API Call with Retry
// =============================================================================

async function callERPWithRetry(
  config: ERPConfig,
  body: ERPPriceRequest,
  maxRetries: number
): Promise<ERPPriceResult> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
        await new Promise(resolve => setTimeout(resolve, delay))
        console.log(`[fetchPrices] Retry attempt ${attempt}/${maxRetries}`)
      }

      const result = await callERP(config, body)
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(
        `[fetchPrices] Attempt ${attempt + 1} failed:`,
        lastError.message
      )
    }
  }

  // Todas as tentativas falharam
  return {
    success: false,
    prices: [],
    source: "erp",
    timestamp: new Date().toISOString(),
    error: lastError?.message || "All retry attempts failed"
  }
}

async function callERP(
  config: ERPConfig,
  body: ERPPriceRequest
): Promise<ERPPriceResult> {
  // Decrypt API key via Supabase RPC
  const apiKey = await decryptApiKey(config.encrypted_api_key)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeout_ms)

  try {
    const response = await fetch(config.api_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey ? `Bearer ${apiKey}` : "",
        ...config.custom_headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(
        `ERP API returned ${response.status}: ${response.statusText}`
      )
    }

    const data = await response.json()

    // Normalizar resposta do ERP
    const prices: ERPPriceResult["prices"] = Array.isArray(
      data.prices || data.data || data
    )
      ? (data.prices || data.data || data).map(
          (item: ERPPriceResponseItem) => ({
            planId: item.plan_id || item.plan_name,
            planName: item.plan_name || item.plan_id,
            basePrice: item.base_price || 0,
            finalPrice: item.final_price || item.base_price || 0,
            discount: item.discount
          })
        )
      : []

    return {
      success: true,
      prices,
      source: "erp",
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

async function decryptApiKey(encryptedKey: string): Promise<string | null> {
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await (supabase.rpc as any)("decrypt_api_key", {
      encrypted_key: encryptedKey
    })

    if (error) {
      console.warn("[fetchPrices] Could not decrypt API key:", error.message)
      return null
    }

    return data as string
  } catch {
    console.warn("[fetchPrices] API key decryption failed")
    return null
  }
}

// =============================================================================
// Response Builders
// =============================================================================

async function createPriceResponse(
  state: HealthPlanState,
  result: ERPPriceResult
): Promise<Partial<HealthPlanState>> {
  let rawResponse: string

  if (result.success && result.prices.length > 0) {
    const priceLines = result.prices
      .map(p => {
        const discount = p.discount ? ` (desconto: ${p.discount}%)` : ""
        return `- **${p.planName}**: R$ ${p.finalPrice.toFixed(2)}/mês${discount}`
      })
      .join("\n")

    rawResponse =
      `Encontrei os preços atualizados para os planos:\n\n${priceLines}\n\n` +
      `_Valores consultados em ${new Date().toLocaleDateString("pt-BR")}. ` +
      `Preços sujeitos a alteração conforme perfil e análise da operadora._`
  } else if (result.error) {
    rawResponse =
      "Não consegui consultar os preços no momento. " +
      "Posso te ajudar com a análise dos planos enquanto isso — " +
      "os valores apresentados são baseados nas tabelas disponíveis."
  } else {
    rawResponse =
      "A consulta de preços não retornou resultados para o seu perfil. " +
      "Isso pode acontecer se o plano não estiver disponível na sua região. " +
      "Quer que eu busque alternativas?"
  }

  const humanized = await humanizeResponse({
    rawResponse,
    state,
    messageType: result.success
      ? "confirmation"
      : ("error" as HumanizeMessageType)
  })

  return {
    erpPrices: result,
    pricesRequested: true,
    currentResponse: humanized.response,
    messages: [new AIMessage(humanized.response)]
  }
}

async function createFallbackResponse(
  state: HealthPlanState,
  reason: "erp_not_configured" | "error"
): Promise<Partial<HealthPlanState>> {
  const rawResponse =
    reason === "erp_not_configured"
      ? "A consulta de preços em tempo real não está configurada para este workspace. " +
        "Os valores apresentados nas análises são baseados nas tabelas de preço disponíveis nos documentos. " +
        "Para cotações exatas, entre em contato com a operadora."
      : "Ocorreu um erro ao consultar preços. " +
        "Posso te ajudar com a análise dos planos enquanto isso — " +
        "os valores apresentados são baseados nas tabelas disponíveis."

  const humanized = await humanizeResponse({
    rawResponse,
    state,
    messageType: "error"
  })

  const fallbackResult: ERPPriceResult = {
    success: false,
    prices: [],
    source: "erp",
    timestamp: new Date().toISOString(),
    error:
      reason === "erp_not_configured" ? "ERP not configured" : "Request failed"
  }

  return {
    erpPrices: fallbackResult,
    pricesRequested: true,
    currentResponse: humanized.response,
    messages: [new AIMessage(humanized.response)]
  }
}
