/**
 * LangSmith Configuration Tests
 *
 * Tests for LangSmith SDK configuration and health check.
 *
 * Referência: Task #14.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  getLangSmithClient,
  isLangSmithEnabled,
  generateRunId,
  generateChildRunId,
  LANGSMITH_CONFIG
} from "../langsmith-config"

describe("LangSmith Configuration", () => {
  describe("LANGSMITH_CONFIG", () => {
    it("should have default project name", () => {
      expect(LANGSMITH_CONFIG.projectName).toBeTruthy()
    })

    it("should have default API endpoint", () => {
      expect(LANGSMITH_CONFIG.apiEndpoint).toBe(
        "https://api.smith.langchain.com"
      )
    })

    it("should have trace version", () => {
      expect(LANGSMITH_CONFIG.traceVersion).toBe("1.0.0")
    })
  })

  describe("isLangSmithEnabled", () => {
    const originalEnv = process.env.LANGSMITH_API_KEY

    beforeEach(() => {
      // Reset module cache to test env changes
      vi.resetModules()
    })

    afterEach(() => {
      process.env.LANGSMITH_API_KEY = originalEnv
    })

    it("should return true when API key is set", () => {
      process.env.LANGSMITH_API_KEY = "test-api-key"
      expect(isLangSmithEnabled()).toBe(true)
    })

    it("should return false when API key is not set", () => {
      delete process.env.LANGSMITH_API_KEY
      expect(isLangSmithEnabled()).toBe(false)
    })

    it("should return false when API key is empty string", () => {
      process.env.LANGSMITH_API_KEY = ""
      expect(isLangSmithEnabled()).toBe(false)
    })
  })

  describe("getLangSmithClient", () => {
    it("should return a client when API key is set", () => {
      // API key is already set in env
      const client = getLangSmithClient()
      if (process.env.LANGSMITH_API_KEY) {
        expect(client).not.toBeNull()
      } else {
        expect(client).toBeNull()
      }
    })
  })

  describe("generateRunId", () => {
    // UUID pattern: 8-4-4-4-12 hex characters
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

    it("should generate valid UUIDs (required by LangSmith API)", () => {
      const id1 = generateRunId()
      const id2 = generateRunId()

      expect(id1).toMatch(UUID_PATTERN)
      expect(id2).toMatch(UUID_PATTERN)
      expect(id1).not.toBe(id2)
    })

    it("should generate UUIDs regardless of prefix param (deprecated)", () => {
      // Prefix param is deprecated - use metadata for categorization
      const id = generateRunId("custom")
      expect(id).toMatch(UUID_PATTERN)
    })

    it("should always generate unique UUIDs", () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateRunId())
      }
      expect(ids.size).toBe(100)
    })
  })

  describe("generateChildRunId", () => {
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

    it("should generate valid UUID for child run", () => {
      const parentId = "c0a80064-0001-0000-0000-000000000001"
      const childId = generateChildRunId(parentId, "step1")

      // LangSmith requires UUIDs - parent relationship is set via parent_run_id field
      expect(childId).toMatch(UUID_PATTERN)
    })

    it("should generate unique child IDs for same parent", () => {
      const parentId = "c0a80064-0001-0000-0000-000000000001"
      const child1 = generateChildRunId(parentId, "step1")
      const child2 = generateChildRunId(parentId, "step1")

      expect(child1).not.toBe(child2)
      expect(child1).toMatch(UUID_PATTERN)
      expect(child2).toMatch(UUID_PATTERN)
    })

    it("should generate independent UUIDs (parent relationship via API field)", () => {
      const parentId = "c0a80064-0001-0000-0000-000000000001"
      const childId = generateChildRunId(parentId, "extract")

      // Child ID is a new UUID - parent-child relationship is established
      // via the parent_run_id field in LangSmith API, not via ID format
      expect(childId).toMatch(UUID_PATTERN)
      expect(childId).not.toBe(parentId)
    })
  })
})
