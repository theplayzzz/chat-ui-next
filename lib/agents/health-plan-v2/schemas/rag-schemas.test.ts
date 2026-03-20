// Jest globals (describe, it, expect) are available automatically
import { GradeResultSchema, GradeScoreEnum } from "./rag-schemas"

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

    it("should accept partially_relevant score", () => {
      const validData = {
        documentId: "doc-1",
        score: "partially_relevant",
        reason: "Partially relevant reason"
      }
      const result = GradeResultSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it("should accept irrelevant score", () => {
      const validData = {
        documentId: "doc-1",
        score: "irrelevant",
        reason: "Not relevant reason"
      }
      const result = GradeResultSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe("GradeScoreEnum", () => {
    it("should have exactly 3 valid values", () => {
      expect(GradeScoreEnum.options).toEqual([
        "relevant",
        "partially_relevant",
        "irrelevant"
      ])
    })
  })
})
