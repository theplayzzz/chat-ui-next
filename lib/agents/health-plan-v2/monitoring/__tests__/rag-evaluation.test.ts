/**
 * RAG Evaluation Tests
 *
 * Testes unitários para os avaliadores de qualidade RAG.
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6D.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  relevanceEvaluator,
  groundednessEvaluator,
  retrievalQualityEvaluator,
  evaluateRAG,
  createLangSmithEvaluators,
  formatMetrics,
  aggregateMetrics,
  type RAGEvaluationInput,
  type RAGEvaluationResult
} from "../rag-evaluation"
import type { GradedDocument, SearchMetadata } from "../../schemas/rag-schemas"
import type { PartialClientInfo } from "../../types"

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createTestDocument(
  id: string,
  isRelevant: boolean,
  operator?: string
): GradedDocument {
  return {
    id,
    content: `Plano de saúde ${operator || "Amil"} com cobertura nacional.
      Inclui consultas, exames e internação. Faixas etárias disponíveis.
      Ideal para famílias e indivíduos. Preços a partir de R$300.`,
    score: 0.85,
    metadata: {
      documentType: "product",
      operator: operator || "Amil",
      planCode: `PLAN-${id}`,
      tags: ["plano", "saude", "cobertura"]
    },
    gradeResult: {
      documentId: id,
      score: isRelevant ? "relevant" : "irrelevant",
      reason: isRelevant
        ? "Documento relevante para o perfil"
        : "Documento não relevante",
      confidence: 0.9
    },
    isRelevant
  }
}

function createTestClientInfo(
  overrides: Partial<PartialClientInfo> = {}
): PartialClientInfo {
  return {
    name: "João Silva",
    age: 35,
    city: "São Paulo",
    state: "SP",
    budget: 500,
    dependents: [],
    healthConditions: [],
    ...overrides
  }
}

function createTestMetadata(
  overrides: Partial<SearchMetadata> = {}
): SearchMetadata {
  return {
    queryCount: 3,
    rewriteCount: 0,
    totalDocs: 10,
    relevantDocs: 5,
    limitedResults: false,
    timestamp: new Date().toISOString(),
    ...overrides
  }
}

function createTestInput(
  overrides: Partial<RAGEvaluationInput> = {}
): RAGEvaluationInput {
  return {
    clientInfo: createTestClientInfo(),
    queries: [
      "planos de saúde São Paulo adulto",
      "cobertura nacional orçamento R$500",
      "planos familiares SP"
    ],
    documents: [
      createTestDocument("doc1", true, "Amil"),
      createTestDocument("doc2", true, "Bradesco"),
      createTestDocument("doc3", true, "SulAmérica"),
      createTestDocument("doc4", false, "Hapvida"),
      createTestDocument("doc5", false, "NotreDame")
    ],
    searchMetadata: createTestMetadata(),
    ...overrides
  }
}

// =============================================================================
// RELEVANCE EVALUATOR TESTS
// =============================================================================

describe("relevanceEvaluator", () => {
  it("should return score 0 when no documents", () => {
    const input = createTestInput({ documents: [] })
    const result = relevanceEvaluator(input)

    expect(result.key).toBe("relevance")
    expect(result.score).toBe(0)
    expect(result.comment).toContain("Nenhum documento retornado")
  })

  it("should return high score when all docs are relevant", () => {
    const input = createTestInput({
      documents: [
        createTestDocument("doc1", true),
        createTestDocument("doc2", true),
        createTestDocument("doc3", true)
      ]
    })
    const result = relevanceEvaluator(input)

    expect(result.score).toBeGreaterThanOrEqual(0.6)
    expect(result.metadata?.relevantDocs).toBe(3)
  })

  it("should return low score when all docs are irrelevant", () => {
    const input = createTestInput({
      documents: [
        createTestDocument("doc1", false),
        createTestDocument("doc2", false),
        createTestDocument("doc3", false)
      ]
    })
    const result = relevanceEvaluator(input)

    expect(result.score).toBeLessThanOrEqual(0.2)
    expect(result.metadata?.relevantDocs).toBe(0)
  })

  it("should return moderate score with mixed relevance", () => {
    const input = createTestInput() // 3 relevant, 2 irrelevant
    const result = relevanceEvaluator(input)

    expect(result.score).toBeGreaterThan(0.3)
    expect(result.score).toBeLessThan(0.8)
  })

  it("should consider partially relevant docs", () => {
    const partialDoc: GradedDocument = {
      ...createTestDocument("doc1", false),
      gradeResult: {
        documentId: "doc1",
        score: "partially_relevant",
        reason: "Parcialmente relevante",
        confidence: 0.7
      }
    }

    const input = createTestInput({
      documents: [partialDoc, createTestDocument("doc2", true)]
    })
    const result = relevanceEvaluator(input)

    expect(result.score).toBeGreaterThan(0)
  })

  it("should return score between 0 and 1", () => {
    const input = createTestInput()
    const result = relevanceEvaluator(input)

    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// GROUNDEDNESS EVALUATOR TESTS
// =============================================================================

describe("groundednessEvaluator", () => {
  it("should return 0.5 when no response provided", () => {
    const input = createTestInput({ response: undefined })
    const result = groundednessEvaluator(input)

    expect(result.key).toBe("groundedness")
    expect(result.score).toBe(0.5)
    expect(result.metadata?.hasResponse).toBe(false)
  })

  it("should return 0 when no documents", () => {
    const input = createTestInput({
      documents: [],
      response: "Recomendo o plano Amil 500"
    })
    const result = groundednessEvaluator(input)

    expect(result.score).toBe(0)
    expect(result.metadata?.hasDocuments).toBe(false)
  })

  it("should return high score when response matches documents", () => {
    const input = createTestInput({
      documents: [createTestDocument("doc1", true, "Amil")],
      response:
        "Com base nos documentos, o plano Amil oferece cobertura nacional com consultas, exames e internação. O preço começa em R$300."
    })
    const result = groundednessEvaluator(input)

    expect(result.score).toBeGreaterThan(0.5)
  })

  it("should return lower score when response has unrelated content", () => {
    const input = createTestInput({
      documents: [createTestDocument("doc1", true, "Amil")],
      response:
        "O plano XYZ oferece cobertura internacional com telemedicina avançada e check-up anual gratuito."
    })
    const result = groundednessEvaluator(input)

    expect(result.score).toBeLessThan(0.7)
  })

  it("should check operator mentions correctly", () => {
    const input = createTestInput({
      documents: [
        createTestDocument("doc1", true, "Amil"),
        createTestDocument("doc2", true, "Bradesco")
      ],
      response: "Os planos da Amil e Bradesco são boas opções para seu perfil."
    })
    const result = groundednessEvaluator(input)

    expect(result.metadata?.operatorMentions).toBeGreaterThan(0)
  })

  it("should return score between 0 and 1", () => {
    const input = createTestInput({
      response: "Recomendo verificar os planos disponíveis"
    })
    const result = groundednessEvaluator(input)

    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// RETRIEVAL QUALITY EVALUATOR TESTS
// =============================================================================

describe("retrievalQualityEvaluator", () => {
  it("should return high score when >= 5 relevant docs and no rewrites", () => {
    const input = createTestInput({
      searchMetadata: createTestMetadata({
        relevantDocs: 5,
        rewriteCount: 0,
        limitedResults: false
      }),
      documents: [
        createTestDocument("doc1", true, "Amil"),
        createTestDocument("doc2", true, "Bradesco"),
        createTestDocument("doc3", true, "SulAmérica")
      ]
    })
    const result = retrievalQualityEvaluator(input)

    expect(result.key).toBe("retrieval_quality")
    expect(result.score).toBeGreaterThan(0.6)
  })

  it("should penalize rewrites", () => {
    const baseInput = createTestInput({
      searchMetadata: createTestMetadata({
        relevantDocs: 5,
        rewriteCount: 0
      })
    })
    const withRewrites = createTestInput({
      searchMetadata: createTestMetadata({
        relevantDocs: 5,
        rewriteCount: 2
      })
    })

    const scoreNoRewrite = retrievalQualityEvaluator(baseInput).score
    const scoreWithRewrite = retrievalQualityEvaluator(withRewrites).score

    expect(scoreNoRewrite).toBeGreaterThan(scoreWithRewrite)
  })

  it("should penalize limited results", () => {
    const normal = createTestInput({
      searchMetadata: createTestMetadata({ limitedResults: false })
    })
    const limited = createTestInput({
      searchMetadata: createTestMetadata({ limitedResults: true })
    })

    const normalScore = retrievalQualityEvaluator(normal).score
    const limitedScore = retrievalQualityEvaluator(limited).score

    expect(normalScore).toBeGreaterThan(limitedScore)
  })

  it("should value operator diversity", () => {
    const singleOperator = createTestInput({
      documents: [
        createTestDocument("doc1", true, "Amil"),
        createTestDocument("doc2", true, "Amil"),
        createTestDocument("doc3", true, "Amil")
      ]
    })
    const multipleOperators = createTestInput({
      documents: [
        createTestDocument("doc1", true, "Amil"),
        createTestDocument("doc2", true, "Bradesco"),
        createTestDocument("doc3", true, "SulAmérica")
      ]
    })

    const singleScore = retrievalQualityEvaluator(singleOperator).score
    const multipleScore = retrievalQualityEvaluator(multipleOperators).score

    expect(multipleScore).toBeGreaterThan(singleScore)
  })

  it("should return lower score with few relevant docs", () => {
    const input = createTestInput({
      searchMetadata: createTestMetadata({ relevantDocs: 1 }),
      documents: [createTestDocument("doc1", true, "Amil")], // Single doc
      queries: ["single query"]
    })
    const result = retrievalQualityEvaluator(input)

    // With 1 relevant doc (target 5), score should be reduced
    expect(result.score).toBeLessThan(0.75)
    expect(result.metadata?.relevantCount).toBe(1)
  })

  it("should return score between 0 and 1", () => {
    const input = createTestInput()
    const result = retrievalQualityEvaluator(input)

    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// EVALUATE RAG TESTS
// =============================================================================

describe("evaluateRAG", () => {
  it("should return all three scores", () => {
    const input = createTestInput({
      response: "Recomendo os planos Amil e Bradesco para seu perfil."
    })
    const result = evaluateRAG(input)

    expect(result).toHaveProperty("relevance")
    expect(result).toHaveProperty("groundedness")
    expect(result).toHaveProperty("retrievalQuality")
    expect(result).toHaveProperty("overallScore")
  })

  it("should calculate overall score as weighted average", () => {
    const input = createTestInput({
      response: "Recomendo o plano Amil"
    })
    const result = evaluateRAG(input)

    // Overall = relevance * 0.4 + groundedness * 0.3 + retrievalQuality * 0.3
    const expectedOverall =
      result.relevance * 0.4 +
      result.groundedness * 0.3 +
      result.retrievalQuality * 0.3

    expect(result.overallScore).toBeCloseTo(expectedOverall, 2)
  })

  it("should include details for each evaluator", () => {
    const input = createTestInput({
      response: "Test response"
    })
    const result = evaluateRAG(input)

    expect(result.details.relevance).toHaveProperty("key", "relevance")
    expect(result.details.groundedness).toHaveProperty("key", "groundedness")
    expect(result.details.retrievalQuality).toHaveProperty(
      "key",
      "retrieval_quality"
    )
  })

  it("should include timestamp", () => {
    const input = createTestInput()
    const result = evaluateRAG(input)

    expect(result.timestamp).toBeDefined()
    expect(new Date(result.timestamp).getTime()).not.toBeNaN()
  })

  it("should return all scores between 0 and 1", () => {
    const input = createTestInput({
      response: "Test response"
    })
    const result = evaluateRAG(input)

    expect(result.relevance).toBeGreaterThanOrEqual(0)
    expect(result.relevance).toBeLessThanOrEqual(1)
    expect(result.groundedness).toBeGreaterThanOrEqual(0)
    expect(result.groundedness).toBeLessThanOrEqual(1)
    expect(result.retrievalQuality).toBeGreaterThanOrEqual(0)
    expect(result.retrievalQuality).toBeLessThanOrEqual(1)
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
    expect(result.overallScore).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// LANGSMITH EVALUATORS TESTS
// =============================================================================

describe("createLangSmithEvaluators", () => {
  it("should return array of 3 evaluators", () => {
    const evaluators = createLangSmithEvaluators()

    expect(evaluators).toHaveLength(3)
    expect(typeof evaluators[0]).toBe("function")
    expect(typeof evaluators[1]).toBe("function")
    expect(typeof evaluators[2]).toBe("function")
  })

  it("should return evaluator functions that return correct format", async () => {
    const evaluators = createLangSmithEvaluators()
    const input = createTestInput()

    const result1 = await evaluators[0]({ input, output: null })
    const result2 = await evaluators[1]({ input, output: null })
    const result3 = await evaluators[2]({ input, output: null })

    expect(result1).toHaveProperty("key", "relevance")
    expect(result1).toHaveProperty("score")
    expect(result2).toHaveProperty("key", "groundedness")
    expect(result3).toHaveProperty("key", "retrieval_quality")
  })
})

// =============================================================================
// METRICS TESTS
// =============================================================================

describe("formatMetrics", () => {
  it("should format result into metrics structure", () => {
    const result: RAGEvaluationResult = {
      relevance: 0.8,
      groundedness: 0.7,
      retrievalQuality: 0.9,
      overallScore: 0.8,
      details: {
        relevance: { key: "relevance", score: 0.8 },
        groundedness: { key: "groundedness", score: 0.7 },
        retrievalQuality: { key: "retrieval_quality", score: 0.9 }
      },
      timestamp: "2024-01-01T00:00:00.000Z"
    }

    const metrics = formatMetrics(result)

    expect(metrics.labels.timestamp).toBe("2024-01-01T00:00:00.000Z")
    expect(metrics.values.rag_relevance_score).toBe(0.8)
    expect(metrics.values.rag_groundedness_score).toBe(0.7)
    expect(metrics.values.rag_retrieval_quality_score).toBe(0.9)
    expect(metrics.values.rag_overall_score).toBe(0.8)
  })
})

describe("aggregateMetrics", () => {
  it("should return zeros for empty array", () => {
    const aggregated = aggregateMetrics([])

    expect(aggregated.count).toBe(0)
    expect(aggregated.avgRelevance).toBe(0)
    expect(aggregated.avgOverall).toBe(0)
  })

  it("should calculate averages correctly", () => {
    const results: RAGEvaluationResult[] = [
      {
        relevance: 0.8,
        groundedness: 0.6,
        retrievalQuality: 0.7,
        overallScore: 0.7,
        details: {} as any,
        timestamp: ""
      },
      {
        relevance: 0.6,
        groundedness: 0.8,
        retrievalQuality: 0.9,
        overallScore: 0.77,
        details: {} as any,
        timestamp: ""
      }
    ]

    const aggregated = aggregateMetrics(results)

    expect(aggregated.count).toBe(2)
    expect(aggregated.avgRelevance).toBe(0.7)
    expect(aggregated.avgGroundedness).toBe(0.7)
    expect(aggregated.avgRetrievalQuality).toBe(0.8)
  })

  it("should find min and max overall scores", () => {
    const results: RAGEvaluationResult[] = [
      { overallScore: 0.5 } as RAGEvaluationResult,
      { overallScore: 0.9 } as RAGEvaluationResult,
      { overallScore: 0.7 } as RAGEvaluationResult
    ]

    const aggregated = aggregateMetrics(results)

    expect(aggregated.minOverall).toBe(0.5)
    expect(aggregated.maxOverall).toBe(0.9)
  })

  it("should count results below threshold", () => {
    const results: RAGEvaluationResult[] = [
      { overallScore: 0.5 } as RAGEvaluationResult, // below 0.6
      { overallScore: 0.4 } as RAGEvaluationResult, // below 0.6
      { overallScore: 0.7 } as RAGEvaluationResult // above 0.6
    ]

    const aggregated = aggregateMetrics(results)

    expect(aggregated.belowThreshold).toBe(2)
  })
})

// =============================================================================
// EDGE CASES TESTS
// =============================================================================

describe("Edge Cases", () => {
  it("should handle client with dependents", () => {
    const input = createTestInput({
      clientInfo: createTestClientInfo({
        dependents: [
          { age: 10, relationship: "child" },
          { age: 8, relationship: "child" }
        ]
      }),
      documents: [
        {
          ...createTestDocument("doc1", true),
          content: "Plano familiar com cobertura para dependentes e família."
        }
      ]
    })

    const result = relevanceEvaluator(input)
    expect(result.score).toBeGreaterThan(0)
  })

  it("should handle client with health conditions", () => {
    const input = createTestInput({
      clientInfo: createTestClientInfo({
        healthConditions: ["diabetes", "hipertensão"]
      }),
      documents: [
        {
          ...createTestDocument("doc1", true),
          content:
            "Plano com cobertura para condições pré-existentes e carência reduzida."
        }
      ]
    })

    const result = relevanceEvaluator(input)
    expect(result.score).toBeGreaterThan(0)
  })

  it("should handle elderly client (60+)", () => {
    const input = createTestInput({
      clientInfo: createTestClientInfo({ age: 65 }),
      documents: [
        {
          ...createTestDocument("doc1", true),
          content: "Plano sênior para faixa 60-75 com cobertura especial."
        }
      ]
    })

    const result = relevanceEvaluator(input)
    expect(result.score).toBeGreaterThan(0)
  })

  it("should handle document without operator metadata", () => {
    const docNoOperator: GradedDocument = {
      id: "doc1",
      content: "Informação geral sobre planos de saúde",
      isRelevant: true,
      metadata: {
        documentType: "general"
      }
    }

    const input = createTestInput({
      documents: [docNoOperator],
      response: "Informação sobre planos"
    })

    // Should not throw
    const relevance = relevanceEvaluator(input)
    const groundedness = groundednessEvaluator(input)
    const retrieval = retrievalQualityEvaluator(input)

    expect(relevance.score).toBeDefined()
    expect(groundedness.score).toBeDefined()
    expect(retrieval.score).toBeDefined()
  })

  it("should handle empty queries array", () => {
    const input = createTestInput({ queries: [] })
    const result = retrievalQualityEvaluator(input)

    expect(result.score).toBeLessThan(1)
    expect(result.metadata?.queryCount).toBe(0)
  })
})
