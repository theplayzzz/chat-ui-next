import { createHash } from "crypto"
import { PriceBreakdown } from "@/lib/tools/health-plan/types"

/**
 * Cache entry structure
 */
interface CacheEntry {
  data: PriceBreakdown[]
  timestamp: number
  ttl: number
  hits: number
  workspace_id: string
}

/**
 * Cache statistics
 */
interface CacheStats {
  totalEntries: number
  hitRate: number
  missRate: number
  evictions: number
  oldestEntry: number | null
  totalHits: number
}

/**
 * In-memory cache for ERP price data with TTL and statistics
 */
class ERPPriceCache {
  private cache: Map<string, CacheEntry>
  private stats: {
    hits: number
    misses: number
    evictions: number
  }
  private cleanupInterval: NodeJS.Timeout | null

  constructor() {
    this.cache = new Map()
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    }
    this.cleanupInterval = null

    // Start auto-cleanup
    this.startAutoCleanup()
  }

  /**
   * Generate cache key from workspace and plan IDs
   * @param workspaceId - Workspace ID
   * @param planIds - Array of plan IDs
   * @returns Cache key
   */
  generateKey(workspaceId: string, planIds: string[]): string {
    // Sort plan IDs to ensure consistent key regardless of order
    const sortedIds = [...planIds].sort()
    const idsString = sortedIds.join(",")

    // Create hash of plan IDs for shorter key
    const hash = createHash("sha256")
      .update(idsString)
      .digest("hex")
      .slice(0, 16)

    return `erp_prices:${workspaceId}:${hash}`
  }

  /**
   * Get cached data if available and not expired
   * @param key - Cache key
   * @returns Cache entry or null if not found/expired
   */
  getCached(key: string): CacheEntry | null {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key)
      this.stats.misses++
      this.stats.evictions++
      return null
    }

    // Cache hit!
    entry.hits++
    this.stats.hits++

    return entry
  }

  /**
   * Store data in cache
   * @param key - Cache key
   * @param data - Price breakdown data
   * @param ttlMinutes - Time to live in minutes
   * @param workspaceId - Workspace ID
   */
  setCached(
    key: string,
    data: PriceBreakdown[],
    ttlMinutes: number,
    workspaceId: string
  ): void {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000, // Convert to milliseconds
      hits: 0,
      workspace_id: workspaceId
    }

    this.cache.set(key, entry)
  }

  /**
   * Invalidate cache entries
   * @param workspaceId - Optional workspace ID to filter by
   * @param planIds - Optional plan IDs to invalidate specific entry
   */
  invalidateCache(workspaceId?: string, planIds?: string[]): number {
    let removed = 0

    if (workspaceId && planIds) {
      // Invalidate specific entry
      const key = this.generateKey(workspaceId, planIds)
      if (this.cache.delete(key)) {
        removed = 1
        this.stats.evictions++
      }
    } else if (workspaceId) {
      // Invalidate all entries for workspace
      for (const [key, entry] of this.cache.entries()) {
        if (entry.workspace_id === workspaceId) {
          this.cache.delete(key)
          removed++
          this.stats.evictions++
        }
      }
    } else {
      // Clear all cache
      removed = this.cache.size
      this.cache.clear()
      this.stats.evictions += removed
    }

    return removed
  }

  /**
   * Clear expired cache entries
   * @returns Number of entries removed
   */
  clearExpired(): number {
    let removed = 0

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key)
        removed++
        this.stats.evictions++
      }
    }

    return removed
  }

  /**
   * Get cache statistics
   * @returns Cache stats
   */
  getCacheStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0
    const missRate = totalRequests > 0 ? this.stats.misses / totalRequests : 0

    // Find oldest entry
    let oldestEntry: number | null = null
    for (const entry of this.cache.values()) {
      if (oldestEntry === null || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp
      }
    }

    // Calculate total hits across all entries
    let totalHits = 0
    for (const entry of this.cache.values()) {
      totalHits += entry.hits
    }

    return {
      totalEntries: this.cache.size,
      hitRate,
      missRate,
      evictions: this.stats.evictions,
      oldestEntry,
      totalHits
    }
  }

  /**
   * Check if cache entry is expired
   * @param entry - Cache entry
   * @returns True if expired
   */
  private isExpired(entry: CacheEntry): boolean {
    const age = Date.now() - entry.timestamp
    return age > entry.ttl
  }

  /**
   * Start automatic cleanup interval
   */
  private startAutoCleanup(): void {
    // Clear any existing interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        const removed = this.clearExpired()
        if (removed > 0) {
          console.log(
            `[ERPPriceCache] Auto-cleanup removed ${removed} expired entries`
          )
        }
      },
      5 * 60 * 1000
    )

    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Stop automatic cleanup (for testing or shutdown)
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Reset cache and statistics (useful for testing)
   */
  reset(): void {
    this.cache.clear()
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    }
  }

  /**
   * Get all cache entries (for debugging/monitoring)
   * @returns Map of all cache entries
   */
  getAllEntries(): Map<string, CacheEntry> {
    return new Map(this.cache)
  }
}

/**
 * Singleton instance of the ERP price cache
 */
export const erpPriceCache = new ERPPriceCache()

/**
 * Export types
 */
export type { CacheEntry, CacheStats }
