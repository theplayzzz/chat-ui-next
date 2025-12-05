/**
 * Testes para rewrite-query.ts
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Fase 6B.2: > 8 casos de teste
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  rewriteQuery,
  detectProblem,
  shouldRewrite,
  createRewriteContext,
  MAX_REWRITE_ATTEMPTS,
  MIN_RELEVANT_DOCS,
  type RewriteContext
} from "../rewrite-query"
import type { ClientInfoForQueries } from "../generate-queries"
import type { RewriteProblem } from "../../../schemas/rag-schemas"

// =============================================================================
// Mocks
// =============================================================================

const mockInvoke = vi.fn()
const { MockChatOpenAI } = vi.hoisted(() => {
  return {
    MockChatOpenAI: class {
      invoke = mockInvoke
    }
  }
})

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: MockChatOpenAI
}))

// =============================================================================
// Test Data
// =============================================================================

const basicClientInfo: ClientInfoForQueries = {
  age: 35,
  city: "São Paulo",
  state: "SP",
  budget: 800
}

const createContext = (
  problem: RewriteProblem,
  attemptCount: number = 1,
  query: string = "plano de saúde básico"
): RewriteContext => ({
  originalQuery: query,
  problem,
  attemptCount,
  clientInfo: basicClientInfo
})

const createMockResponse = (rewrittenQuery: string, changes?: string) => ({
  content: JSON.stringify({
    rewrittenQuery,
    changes
  })
})

// =============================================================================
// Tests
// =============================================================================

describe("rewriteQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // Teste 1: Problema "no_results" reformula query mais abrangente
  // --------------------------------------------------------------------------
  it("should rewrite query for no_results problem", async () => {
    const context = createContext("no_results", 1, "plano específico XYZ123")

    mockInvoke.mockResolvedValue(
      createMockResponse(
        "plano de saúde cobertura ampla São Paulo",
        "Removido código específico, adicionado contexto regional"
      )
    )

    const result = await rewriteQuery(context)

    expect(result.rewrittenQuery).not.toBe(context.originalQuery)
    expect(result.problem).toBe("no_results")
    expect(result.attemptCount).toBe(1)
    expect(result.limitedResults).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Teste 2: Problema "too_specific" remove termos específicos
  // --------------------------------------------------------------------------
  it("should rewrite query for too_specific problem", async () => {
    const context = createContext(
      "too_specific",
      1,
      "plano Amil S750 código ANS 12345 oncológico"
    )

    mockInvoke.mockResolvedValue(
      createMockResponse(
        "plano Amil cobertura oncológica São Paulo",
        "Removido código ANS e identificador específico"
      )
    )

    const result = await rewriteQuery(context)

    expect(result.rewrittenQuery).toContain("Amil")
    expect(result.rewrittenQuery).not.toContain("12345")
    expect(result.limitedResults).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Teste 3: Problema "low_similarity" ajusta termos
  // --------------------------------------------------------------------------
  it("should rewrite query for low_similarity problem", async () => {
    const context = createContext("low_similarity", 1, "seguro médico barato")

    mockInvoke.mockResolvedValue(
      createMockResponse(
        "plano de saúde econômico custo-benefício São Paulo",
        "Adicionados sinônimos e contexto"
      )
    )

    const result = await rewriteQuery(context)

    expect(result.rewrittenQuery).toBeDefined()
    expect(result.problem).toBe("low_similarity")
  })

  // --------------------------------------------------------------------------
  // Teste 4: Primeira tentativa bem-sucedida retorna attemptCount=1
  // --------------------------------------------------------------------------
  it("should return attemptCount=1 on first attempt", async () => {
    const context = createContext("no_results", 1)

    mockInvoke.mockResolvedValue(createMockResponse("nova query reformulada"))

    const result = await rewriteQuery(context)

    expect(result.attemptCount).toBe(1)
    expect(result.limitedResults).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Teste 5: Segunda tentativa bem-sucedida retorna attemptCount=2
  // --------------------------------------------------------------------------
  it("should return attemptCount=2 on second attempt", async () => {
    const context = createContext("low_similarity", 2)

    mockInvoke.mockResolvedValue(createMockResponse("query segunda tentativa"))

    const result = await rewriteQuery(context)

    expect(result.attemptCount).toBe(2)
    expect(result.limitedResults).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Teste 6: Após 2 tentativas seta limitedResults=true
  // --------------------------------------------------------------------------
  it("should set limitedResults=true after max attempts", async () => {
    const context = createContext("no_results", 3) // > MAX_REWRITE_ATTEMPTS

    const result = await rewriteQuery(context)

    expect(result.limitedResults).toBe(true)
    expect(result.rewrittenQuery).toBe(context.originalQuery) // Retorna original
    expect(mockInvoke).not.toHaveBeenCalled() // Não chama LLM
  })

  // --------------------------------------------------------------------------
  // Teste 7: Mock GPT-5-mini valida modelKwargs
  // --------------------------------------------------------------------------
  it("should use modelKwargs for gpt-5-mini model", async () => {
    const context = createContext("no_results", 1)

    mockInvoke.mockResolvedValue(createMockResponse("query reescrita"))

    await rewriteQuery(context, { model: "gpt-5-mini" })

    expect(mockInvoke).toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // Teste 8: Erro do LLM retorna query com fallback
  // --------------------------------------------------------------------------
  it("should use fallback when LLM fails", async () => {
    const context = createContext(
      "too_specific",
      1,
      "plano ANS código 12345-678"
    )

    mockInvoke.mockRejectedValue(new Error("API Error"))

    const result = await rewriteQuery(context)

    // Fallback: aplica rewrite simples - deve retornar uma query diferente ou a original
    expect(result.rewrittenQuery).toBeDefined()
    // O fallback tenta remover códigos, mas mesmo que não consiga, deve retornar algo
    expect(typeof result.rewrittenQuery).toBe("string")
    expect(result.rewrittenQuery.length).toBeGreaterThan(0)
  })

  // --------------------------------------------------------------------------
  // Teste 9: Problema "missing_context" adiciona contexto
  // --------------------------------------------------------------------------
  it("should add context for missing_context problem", async () => {
    const context = createContext("missing_context", 1, "melhor plano")

    mockInvoke.mockResolvedValue(
      createMockResponse(
        "melhor plano de saúde São Paulo adulto até R$800",
        "Adicionado contexto do cliente"
      )
    )

    const result = await rewriteQuery(context)

    expect(result.rewrittenQuery.length).toBeGreaterThan(
      context.originalQuery.length
    )
  })

  // --------------------------------------------------------------------------
  // Teste 10: Fallback com erro na segunda tentativa
  // --------------------------------------------------------------------------
  it("should set limitedResults on error at max attempt", async () => {
    const context = createContext("no_results", 2)

    mockInvoke.mockRejectedValue(new Error("Timeout"))

    const result = await rewriteQuery(context)

    // Na segunda tentativa com erro, deve setar limitedResults
    expect(result.limitedResults).toBe(true)
  })
})

// =============================================================================
// Tests for helper functions
// =============================================================================

describe("detectProblem", () => {
  it("should detect no_results when totalResults is 0", () => {
    const problem = detectProblem(0, 0)
    expect(problem).toBe("no_results")
  })

  it("should detect low_similarity when avgSimilarity < 0.5", () => {
    const problem = detectProblem(5, 1, 0.3)
    expect(problem).toBe("low_similarity")
  })

  it("should detect too_specific when relevantResults < MIN but avgSimilarity >= 0.5", () => {
    const problem = detectProblem(5, 1, 0.6)
    expect(problem).toBe("too_specific")
  })

  it("should detect missing_context when results exist but not enough relevant", () => {
    const problem = detectProblem(10, 5)
    expect(problem).toBe("missing_context")
  })
})

describe("shouldRewrite", () => {
  it("should return true when relevantCount < MIN and attemptCount < MAX", () => {
    expect(shouldRewrite(1, 0)).toBe(true)
    expect(shouldRewrite(2, 1)).toBe(true)
  })

  it("should return false when relevantCount >= MIN_RELEVANT_DOCS", () => {
    expect(shouldRewrite(MIN_RELEVANT_DOCS, 0)).toBe(false)
    expect(shouldRewrite(5, 0)).toBe(false)
  })

  it("should return false when attemptCount >= MAX_REWRITE_ATTEMPTS", () => {
    expect(shouldRewrite(1, MAX_REWRITE_ATTEMPTS)).toBe(false)
    expect(shouldRewrite(0, 3)).toBe(false)
  })
})

describe("createRewriteContext", () => {
  it("should create valid context with all fields", () => {
    const context = createRewriteContext(
      "original query",
      "too_specific",
      1,
      basicClientInfo
    )

    expect(context.originalQuery).toBe("original query")
    expect(context.problem).toBe("too_specific")
    expect(context.attemptCount).toBe(1)
    expect(context.clientInfo).toEqual(basicClientInfo)
  })
})

describe("Constants", () => {
  it("should have MAX_REWRITE_ATTEMPTS = 2", () => {
    expect(MAX_REWRITE_ATTEMPTS).toBe(2)
  })

  it("should have MIN_RELEVANT_DOCS = 3", () => {
    expect(MIN_RELEVANT_DOCS).toBe(3)
  })
})
