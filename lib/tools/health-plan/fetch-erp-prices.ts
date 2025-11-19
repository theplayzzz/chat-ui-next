import {
  getERPConfigByWorkspaceId,
  getDecryptedAPIKey
} from "@/db/workspace-erp-config"
import { ERPClient } from "@/lib/clients/erp-client"
import { erpPriceCache } from "@/lib/cache/erp-price-cache"
import { calculateFamilyPrice } from "@/lib/utils/pricing"
import {
  FamilyProfile,
  ERPPriceResult,
  PriceBreakdown,
  PricingModel
} from "@/lib/tools/health-plan/types"

/**
 * Fetch ERP prices for health plans with graceful degradation
 *
 * This function implements the complete ERP integration workflow:
 * 1. Fetch workspace ERP configuration
 * 2. Check cache for existing data
 * 3. Attempt to fetch fresh data from ERP API
 * 4. Calculate family pricing
 * 5. Cache the results
 * 6. Fall back to stale cache if API unavailable
 *
 * @param workspaceId - The workspace ID
 * @param planIds - Array of plan IDs to fetch prices for
 * @param familyProfile - Family composition for price calculation
 * @param pricingModel - Optional pricing model (default: 'por_pessoa')
 * @returns Price result with metadata
 */
export async function fetchERPPrices(
  workspaceId: string,
  planIds: string[],
  familyProfile: FamilyProfile,
  pricingModel: PricingModel = "por_pessoa"
): Promise<ERPPriceResult> {
  const startTime = Date.now()

  // Validate inputs
  if (!workspaceId || !planIds || planIds.length === 0) {
    return {
      success: false,
      error: "Invalid input: workspaceId and planIds are required",
      source: "none",
      cached_at: null,
      is_fresh: false
    }
  }

  try {
    // 1. Fetch ERP configuration for workspace
    const config = await getERPConfigByWorkspaceId(workspaceId)

    if (!config) {
      return {
        success: false,
        error: `ERP configuration not found for workspace ${workspaceId}`,
        source: "none",
        cached_at: null,
        is_fresh: false
      }
    }

    // 2. Check cache first
    const cacheKey = erpPriceCache.generateKey(workspaceId, planIds)
    const cached = erpPriceCache.getCached(cacheKey)

    if (cached && !isStale(cached.timestamp, config.cache_ttl_minutes)) {
      // Fresh cache hit!
      const executionTime = Date.now() - startTime
      console.log(
        `[fetchERPPrices] Cache hit (fresh) for workspace ${workspaceId} in ${executionTime}ms`
      )

      return {
        success: true,
        prices: cached.data,
        source: "cache",
        cached_at: new Date(cached.timestamp).toISOString(),
        is_fresh: true,
        metadata: {
          workspace_id: workspaceId,
          plan_ids: planIds,
          fetched_at: new Date().toISOString(),
          cache_age_minutes: Math.round(
            (Date.now() - cached.timestamp) / 1000 / 60
          )
        }
      }
    }

    // 3. Attempt to fetch from ERP API
    try {
      const decryptedApiKey = await getDecryptedAPIKey(workspaceId)

      if (!decryptedApiKey) {
        throw new Error("Failed to decrypt API key")
      }

      const client = new ERPClient(config, decryptedApiKey)
      const result = await client.fetchPrices(planIds)

      if (result.success) {
        // 4. Calculate family prices for each plan
        const priceBreakdowns: PriceBreakdown[] = result.data.map(erpItem => {
          return calculateFamilyPrice(erpItem, familyProfile, pricingModel)
        })

        // 5. Save to cache
        erpPriceCache.setCached(
          cacheKey,
          priceBreakdowns,
          config.cache_ttl_minutes,
          workspaceId
        )

        const executionTime = Date.now() - startTime
        console.log(
          `[fetchERPPrices] API success for workspace ${workspaceId} in ${executionTime}ms`
        )

        return {
          success: true,
          prices: priceBreakdowns,
          source: "live",
          cached_at: null,
          is_fresh: true,
          metadata: {
            workspace_id: workspaceId,
            plan_ids: planIds,
            fetched_at: new Date().toISOString()
          }
        }
      } else {
        // API returned an error
        console.warn(
          `[fetchERPPrices] API error for workspace ${workspaceId}:`,
          result.error
        )
      }
    } catch (error) {
      // API call failed
      console.warn(
        `[fetchERPPrices] API exception for workspace ${workspaceId}:`,
        error
      )
    }

    // 6. API failed - try stale cache
    if (cached) {
      const age = Date.now() - cached.timestamp
      const ageMinutes = Math.round(age / 1000 / 60)
      const maxStaleAge = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

      if (age < maxStaleAge) {
        const executionTime = Date.now() - startTime
        console.warn(
          `[fetchERPPrices] Using stale cache (${ageMinutes}min old) for workspace ${workspaceId} (execution: ${executionTime}ms)`
        )

        return {
          success: true,
          prices: cached.data,
          source: "stale_cache",
          cached_at: new Date(cached.timestamp).toISOString(),
          is_fresh: false,
          metadata: {
            workspace_id: workspaceId,
            plan_ids: planIds,
            fetched_at: new Date().toISOString(),
            cache_age_minutes: ageMinutes
          }
        }
      } else {
        console.error(
          `[fetchERPPrices] Stale cache too old (${ageMinutes}min, max 1440min) for workspace ${workspaceId}`
        )
      }
    }

    // 7. No cache available or cache too old
    const executionTime = Date.now() - startTime
    console.error(
      `[fetchERPPrices] Failed - no valid data source for workspace ${workspaceId} (execution: ${executionTime}ms)`
    )

    return {
      success: false,
      error: "ERP API unavailable and no valid cache available",
      source: "none",
      cached_at: null,
      is_fresh: false,
      metadata: {
        workspace_id: workspaceId,
        plan_ids: planIds,
        fetched_at: new Date().toISOString()
      }
    }
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error(
      `[fetchERPPrices] Critical error for workspace ${workspaceId} (execution: ${executionTime}ms):`,
      error
    )

    return {
      success: false,
      error: `Critical error: ${errorMessage}`,
      source: "none",
      cached_at: null,
      is_fresh: false,
      metadata: {
        workspace_id: workspaceId,
        plan_ids: planIds,
        fetched_at: new Date().toISOString()
      }
    }
  }
}

/**
 * Check if cached data is stale based on TTL
 * @param timestamp - Cache timestamp in milliseconds
 * @param ttlMinutes - TTL in minutes
 * @returns True if stale
 */
function isStale(timestamp: number, ttlMinutes: number): boolean {
  const age = Date.now() - timestamp
  const ttl = ttlMinutes * 60 * 1000 // Convert to milliseconds
  return age > ttl
}

/**
 * Invalidate cache for a workspace (useful for admin operations)
 * @param workspaceId - The workspace ID
 * @param planIds - Optional specific plan IDs
 * @returns Number of entries removed
 */
export function invalidateERPCache(
  workspaceId?: string,
  planIds?: string[]
): number {
  return erpPriceCache.invalidateCache(workspaceId, planIds)
}

/**
 * Get cache statistics (useful for monitoring)
 * @returns Cache statistics
 */
export function getERPCacheStats() {
  return erpPriceCache.getCacheStats()
}
