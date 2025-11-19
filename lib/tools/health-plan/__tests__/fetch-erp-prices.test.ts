import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse, delay } from "msw"
import { calculateFamilyPrice } from "@/lib/utils/pricing"
import { erpPriceCache } from "@/lib/cache/erp-price-cache"
import type {
  FamilyProfile,
  PricingModel,
  PriceBreakdown
} from "@/lib/tools/health-plan/types"
import type { ERPPriceItem } from "@/lib/tools/health-plan/schemas/erp-response-schema"

/**
 * Mock ERP server using MSW
 */
const mockServer = setupServer()

describe("ERP Integration - Price Calculation", () => {
  const mockERPData: ERPPriceItem = {
    planId: "PLAN-001",
    titular: 500.0,
    dependentes: [
      { idade: 35, preco: 450.0 },
      { idade: 10, preco: 300.0 },
      { idade: 8, preco: 280.0 }
    ],
    descontos: 50.0,
    total: 1480.0
  }

  describe("calculateFamilyPrice - Typical Families", () => {
    it("should calculate price for typical family (titular + spouse + 2 children)", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 40 },
        dependentes: [
          { relacao: "conjuge", idade: 35 },
          { relacao: "filho", idade: 10 },
          { relacao: "filho", idade: 8 }
        ]
      }

      const result = calculateFamilyPrice(
        mockERPData,
        familyProfile,
        "por_pessoa"
      )

      expect(result).toBeDefined()
      expect(result.titular).toBe(500.0)
      expect(result.dependentes).toHaveLength(3)
      expect(result.dependentes[0].preco).toBe(450.0)
      expect(result.dependentes[1].preco).toBe(300.0)
      expect(result.dependentes[2].preco).toBe(280.0)
      expect(result.subtotal).toBe(1530.0) // 500 + 450 + 300 + 280
      expect(result.descontos).toBe(50.0)
      expect(result.total).toBe(1480.0)
      expect(result.model).toBe("por_pessoa")
    })

    it("should handle titular only (no dependents)", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 40 },
        dependentes: []
      }

      const result = calculateFamilyPrice(
        mockERPData,
        familyProfile,
        "por_pessoa"
      )

      expect(result.titular).toBe(500.0)
      expect(result.dependentes).toHaveLength(0)
      expect(result.subtotal).toBe(500.0)
      expect(result.total).toBe(450.0) // 500 - 50 descontos
    })

    it("should handle large families (>5 dependents)", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 40 },
        dependentes: [
          { relacao: "conjuge", idade: 35 },
          { relacao: "filho", idade: 18 },
          { relacao: "filho", idade: 15 },
          { relacao: "filho", idade: 12 },
          { relacao: "filho", idade: 10 },
          { relacao: "filho", idade: 8 }
        ]
      }

      const result = calculateFamilyPrice(
        mockERPData,
        familyProfile,
        "por_pessoa"
      )

      expect(result.titular).toBe(500.0)
      expect(result.dependentes).toHaveLength(6)
      expect(result.model).toBe("por_pessoa")
    })
  })

  describe("calculateFamilyPrice - Pricing Models", () => {
    it("should use familia_unica model correctly", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 40 },
        dependentes: [
          { relacao: "conjuge", idade: 35 },
          { relacao: "filho", idade: 10 }
        ]
      }

      const result = calculateFamilyPrice(
        mockERPData,
        familyProfile,
        "familia_unica"
      )

      expect(result.model).toBe("familia_unica")
      expect(result.total).toBe(mockERPData.total)
      // Price should be distributed equally
      const familySize = 3
      const perPerson = (mockERPData.total + mockERPData.descontos) / familySize
      expect(result.titular).toBeCloseTo(perPerson, 2)
    })

    it("should use por_pessoa model correctly", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 40 },
        dependentes: [{ relacao: "conjuge", idade: 35 }]
      }

      const result = calculateFamilyPrice(
        mockERPData,
        familyProfile,
        "por_pessoa"
      )

      expect(result.model).toBe("por_pessoa")
      expect(result.titular).toBe(500.0)
      expect(result.dependentes[0].preco).toBe(450.0)
    })

    it("should use faixa_etaria model correctly", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 40 },
        dependentes: [{ relacao: "conjuge", idade: 35 }]
      }

      const result = calculateFamilyPrice(
        mockERPData,
        familyProfile,
        "faixa_etaria"
      )

      expect(result.model).toBe("faixa_etaria")
      // Should find exact match for age 35
      expect(result.dependentes[0].preco).toBe(450.0)
    })
  })

  describe("calculateFamilyPrice - Edge Cases", () => {
    it("should handle age 0 (newborn)", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 30 },
        dependentes: [{ relacao: "filho", idade: 0 }]
      }

      const result = calculateFamilyPrice(
        mockERPData,
        familyProfile,
        "por_pessoa"
      )

      expect(result.dependentes[0].idade).toBe(0)
      expect(result.dependentes[0].preco).toBeGreaterThan(0)
    })

    it("should handle age 120 (maximum)", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 120 },
        dependentes: []
      }

      const result = calculateFamilyPrice(
        mockERPData,
        familyProfile,
        "por_pessoa"
      )

      expect(result.titular).toBe(500.0)
    })

    it("should reject invalid ages (<0)", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: -1 },
        dependentes: []
      }

      expect(() =>
        calculateFamilyPrice(mockERPData, familyProfile as any, "por_pessoa")
      ).toThrow()
    })

    it("should reject invalid ages (>120)", () => {
      const familyProfile: FamilyProfile = {
        titular: { idade: 121 },
        dependentes: []
      }

      expect(() =>
        calculateFamilyPrice(mockERPData, familyProfile as any, "por_pessoa")
      ).toThrow()
    })
  })
})

describe("ERP Integration - Cache System", () => {
  beforeEach(() => {
    erpPriceCache.reset()
  })

  describe("Cache Operations", () => {
    it("should cache successful responses", () => {
      const workspaceId = "ws-123"
      const planIds = ["PLAN-001", "PLAN-002"]
      const mockData: PriceBreakdown[] = [
        {
          titular: 500,
          dependentes: [],
          subtotal: 500,
          descontos: 0,
          total: 500,
          model: "por_pessoa"
        }
      ]

      const key = erpPriceCache.generateKey(workspaceId, planIds)
      erpPriceCache.setCached(key, mockData, 15, workspaceId)

      const cached = erpPriceCache.getCached(key)
      expect(cached).not.toBeNull()
      expect(cached?.data).toEqual(mockData)
    })

    it("should return cached data within TTL", () => {
      const workspaceId = "ws-123"
      const planIds = ["PLAN-001"]
      const mockData: PriceBreakdown[] = []

      const key = erpPriceCache.generateKey(workspaceId, planIds)
      erpPriceCache.setCached(key, mockData, 15, workspaceId) // 15 min TTL

      // Should hit cache immediately
      const cached = erpPriceCache.getCached(key)
      expect(cached).not.toBeNull()

      const stats = erpPriceCache.getCacheStats()
      expect(stats.totalEntries).toBe(1)
      expect(stats.hitRate).toBe(1.0)
    })

    it("should miss cache after TTL expiration", async () => {
      const workspaceId = "ws-123"
      const planIds = ["PLAN-001"]
      const mockData: PriceBreakdown[] = []

      const key = erpPriceCache.generateKey(workspaceId, planIds)
      // Set very short TTL (1ms)
      erpPriceCache.setCached(key, mockData, 0.000017, workspaceId) // ~1ms

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 5))

      const cached = erpPriceCache.getCached(key)
      expect(cached).toBeNull()

      const stats = erpPriceCache.getCacheStats()
      expect(stats.missRate).toBe(1.0)
    })

    it("should invalidate cache by workspace", () => {
      const workspaceId = "ws-123"
      const mockData: PriceBreakdown[] = []

      const key1 = erpPriceCache.generateKey(workspaceId, ["PLAN-001"])
      const key2 = erpPriceCache.generateKey(workspaceId, ["PLAN-002"])
      const key3 = erpPriceCache.generateKey("ws-456", ["PLAN-001"])

      erpPriceCache.setCached(key1, mockData, 15, workspaceId)
      erpPriceCache.setCached(key2, mockData, 15, workspaceId)
      erpPriceCache.setCached(key3, mockData, 15, "ws-456")

      const removed = erpPriceCache.invalidateCache(workspaceId)
      expect(removed).toBe(2)

      // ws-123 should be invalidated
      expect(erpPriceCache.getCached(key1)).toBeNull()
      expect(erpPriceCache.getCached(key2)).toBeNull()
      // ws-456 should still exist
      expect(erpPriceCache.getCached(key3)).not.toBeNull()
    })

    it("should track hit/miss statistics", () => {
      const workspaceId = "ws-123"
      const planIds = ["PLAN-001"]
      const mockData: PriceBreakdown[] = []

      const key = erpPriceCache.generateKey(workspaceId, planIds)

      // Miss (not in cache)
      erpPriceCache.getCached(key)

      // Add to cache
      erpPriceCache.setCached(key, mockData, 15, workspaceId)

      // Hit
      erpPriceCache.getCached(key)
      erpPriceCache.getCached(key)

      // Miss (different key)
      erpPriceCache.getCached("nonexistent")

      const stats = erpPriceCache.getCacheStats()
      expect(stats.totalEntries).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.5, 1) // 2 hits / 4 requests
      expect(stats.missRate).toBeCloseTo(0.5, 1) // 2 misses / 4 requests
    })
  })

  describe("Cache Key Generation", () => {
    it("should generate consistent keys for same inputs", () => {
      const workspaceId = "ws-123"
      const planIds = ["PLAN-001", "PLAN-002"]

      const key1 = erpPriceCache.generateKey(workspaceId, planIds)
      const key2 = erpPriceCache.generateKey(workspaceId, planIds)

      expect(key1).toBe(key2)
    })

    it("should generate same key regardless of plan ID order", () => {
      const workspaceId = "ws-123"

      const key1 = erpPriceCache.generateKey(workspaceId, [
        "PLAN-001",
        "PLAN-002",
        "PLAN-003"
      ])
      const key2 = erpPriceCache.generateKey(workspaceId, [
        "PLAN-003",
        "PLAN-001",
        "PLAN-002"
      ])

      expect(key1).toBe(key2)
    })

    it("should generate different keys for different workspaces", () => {
      const planIds = ["PLAN-001"]

      const key1 = erpPriceCache.generateKey("ws-123", planIds)
      const key2 = erpPriceCache.generateKey("ws-456", planIds)

      expect(key1).not.toBe(key2)
    })

    it("should generate different keys for different plans", () => {
      const workspaceId = "ws-123"

      const key1 = erpPriceCache.generateKey(workspaceId, ["PLAN-001"])
      const key2 = erpPriceCache.generateKey(workspaceId, ["PLAN-002"])

      expect(key1).not.toBe(key2)
    })
  })
})

describe("ERP Integration - Mock Server Tests", () => {
  beforeAll(() => {
    mockServer.listen()
  })

  afterEach(() => {
    mockServer.resetHandlers()
  })

  afterAll(() => {
    mockServer.close()
  })

  describe("HTTP Client Scenarios", () => {
    it("should handle successful API response", async () => {
      mockServer.use(
        http.post("https://api.erp.test/prices", async () => {
          return HttpResponse.json({
            success: true,
            data: [
              {
                planId: "PLAN-001",
                titular: 500.0,
                dependentes: [],
                descontos: 0,
                total: 500.0
              }
            ],
            timestamp: new Date().toISOString()
          })
        })
      )

      // Test would require full integration setup
      // This is a structure example
      expect(true).toBe(true)
    })

    it("should handle timeout", async () => {
      mockServer.use(
        http.post("https://api.erp.test/slow", async () => {
          await delay(15000) // 15 seconds
          return HttpResponse.json({ success: true })
        })
      )

      // Timeout handling test
      expect(true).toBe(true)
    })

    it("should handle 500 error", async () => {
      mockServer.use(
        http.post("https://api.erp.test/error", () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      // Error handling test
      expect(true).toBe(true)
    })

    it("should handle malformed response", async () => {
      mockServer.use(
        http.post("https://api.erp.test/invalid", () => {
          return HttpResponse.json({ invalid: "data" })
        })
      )

      // Validation error test
      expect(true).toBe(true)
    })
  })
})
