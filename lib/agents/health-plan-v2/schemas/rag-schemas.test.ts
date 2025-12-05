import { describe, it, expect } from "vitest"
import {
  GradeResultSchema,
  QueryItemSchema,
  RewriteResultSchema
} from "./rag-schemas"

describe("RAG Schemas Validation", () => {
  describe("GradeResultSchema (QA-4.1)", () => {
    it("should reject invalid score 'maybe'", () => {
      const invalidData = {
        documentId: "doc-1",
        score: "maybe",
        reason: "Valid reason with enough length"
      }
      const result = GradeResultSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          "Score deve ser: relevant, partially_relevant ou irrelevant"
        )
      }
    })

    it("should accept valid scores", () => {
      const validData = {
        documentId: "doc-1",
        score: "relevant",
        reason: "Valid reason with enough length"
      }
      const result = GradeResultSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe("QueryItemSchema (QA-4.2)", () => {
    it("should reject priority 0", () => {
      const invalidData = {
        query: "Valid query with enough length",
        focus: "general",
        priority: 0
      }
      const result = QueryItemSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          "Prioridade mínima é 1"
        )
      }
    })

    it("should accept priority 1", () => {
      const validData = {
        query: "Valid query with enough length",
        focus: "general",
        priority: 1
      }
      const result = QueryItemSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe("RewriteResultSchema (QA-4.3)", () => {
    it("should reject unknown problem", () => {
      const invalidData = {
        originalQuery: "original",
        rewrittenQuery: "rewritten query length",
        problem: "unknown",
        attemptCount: 1,
        limitedResults: false
      }
      const result = RewriteResultSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it("should accept valid problem", () => {
      const validData = {
        originalQuery: "original",
        rewrittenQuery: "rewritten query length",
        problem: "no_results",
        attemptCount: 1,
        limitedResults: false
      }
      const result = RewriteResultSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })
})
