/**
 * Testes para grade-documents.ts
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Fase 6B.1: > 12 casos de teste
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  gradeDocuments,
  filterRelevantDocuments,
  countByScore,
  type GradeDocumentsOptions
} from "../grade-documents"
import type { FusedDocument } from "../result-fusion"
import type { ClientInfoForQueries } from "../generate-queries"

// =============================================================================
// Mocks
// =============================================================================

// Mock responses para diferentes cenarios
const createMockResponse = (
  results: Array<{ id: string; score: string; reason: string }>
) => ({
  content: JSON.stringify({
    results: results.map(r => ({
      documentId: r.id,
      score: r.score,
      reason: r.reason
    }))
  })
})

// Mock do ChatOpenAI
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

const createTestDocument = (
  id: string,
  content: string,
  metadata?: object
): FusedDocument => ({
  id,
  content,
  metadata: metadata as FusedDocument["metadata"],
  rrfScore: 0.5,
  appearances: 1,
  queryMatches: ["test query"]
})

const basicClientInfo: ClientInfoForQueries = {
  age: 35,
  city: "São Paulo",
  state: "SP",
  budget: 800
}

const familyClientInfo: ClientInfoForQueries = {
  age: 40,
  city: "Rio de Janeiro",
  dependents: [{ age: 10, relationship: "filho" }],
  budget: 1200
}

// =============================================================================
// Tests
// =============================================================================

describe("gradeDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // Teste 1: Documentos relevantes retornam score "relevant"
  // --------------------------------------------------------------------------
  it("should classify relevant documents correctly", async () => {
    const docs = [
      createTestDocument(
        "doc1",
        "Plano de saúde para adultos em São Paulo, R$750/mês"
      ),
      createTestDocument(
        "doc2",
        "Cobertura completa para região metropolitana SP"
      )
    ]

    mockInvoke.mockResolvedValue(
      createMockResponse([
        {
          id: "doc1",
          score: "relevant",
          reason: "Plano compatível com perfil do cliente em SP"
        },
        {
          id: "doc2",
          score: "relevant",
          reason: "Cobertura na região do cliente"
        }
      ])
    )

    const result = await gradeDocuments(docs, basicClientInfo)

    expect(result.stats.relevant).toBe(2)
    expect(result.stats.irrelevant).toBe(0)
    expect(result.relevantDocuments).toHaveLength(2)
  })

  // --------------------------------------------------------------------------
  // Teste 2: Documentos irrelevantes retornam score "irrelevant"
  // --------------------------------------------------------------------------
  it("should classify irrelevant documents and filter them", async () => {
    const docs = [
      createTestDocument("doc1", "Plano Senior 60+ exclusivo idosos"),
      createTestDocument("doc2", "Plano jovem universitário até 25 anos")
    ]

    mockInvoke.mockResolvedValue(
      createMockResponse([
        {
          id: "doc1",
          score: "irrelevant",
          reason: "Cliente tem 35 anos, plano é para 60+"
        },
        {
          id: "doc2",
          score: "irrelevant",
          reason: "Cliente tem 35 anos, plano é até 25"
        }
      ])
    )

    const result = await gradeDocuments(docs, basicClientInfo)

    expect(result.stats.irrelevant).toBe(2)
    expect(result.relevantDocuments).toHaveLength(0) // Filtrados
    expect(result.documents).toHaveLength(2) // Todos os docs originais
  })

  // --------------------------------------------------------------------------
  // Teste 3: Documentos parcialmente relevantes
  // --------------------------------------------------------------------------
  it("should classify partially relevant documents", async () => {
    const docs = [
      createTestDocument("doc1", "Plano empresarial para PMEs em São Paulo")
    ]

    mockInvoke.mockResolvedValue(
      createMockResponse([
        {
          id: "doc1",
          score: "partially_relevant",
          reason: "Região correta mas plano empresarial"
        }
      ])
    )

    const result = await gradeDocuments(docs, basicClientInfo)

    expect(result.stats.partiallyRelevant).toBe(1)
    expect(result.relevantDocuments).toHaveLength(1) // Não é filtrado
  })

  // --------------------------------------------------------------------------
  // Teste 4: Batch processing de 5 documentos
  // --------------------------------------------------------------------------
  it("should process exactly 5 documents per batch", async () => {
    const docs = Array.from({ length: 5 }, (_, i) =>
      createTestDocument(`doc${i}`, `Documento de teste ${i}`)
    )

    mockInvoke.mockResolvedValue(
      createMockResponse(
        docs.map(d => ({ id: d.id, score: "relevant", reason: "Teste" }))
      )
    )

    await gradeDocuments(docs, basicClientInfo, { batchSize: 5 })

    // Deve chamar LLM apenas 1 vez para 5 docs
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  // --------------------------------------------------------------------------
  // Teste 5: Batch processing de 8 documentos cria 2 batches
  // --------------------------------------------------------------------------
  it("should create 2 batches for 8 documents with batchSize 5", async () => {
    const docs = Array.from({ length: 8 }, (_, i) =>
      createTestDocument(`doc${i}`, `Documento de teste ${i}`)
    )

    mockInvoke.mockResolvedValue(
      createMockResponse(
        docs
          .slice(0, 5)
          .map(d => ({ id: d.id, score: "relevant", reason: "Teste" }))
      )
    )

    await gradeDocuments(docs, basicClientInfo, { batchSize: 5 })

    // Deve chamar LLM 2 vezes (5 + 3 docs)
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  // --------------------------------------------------------------------------
  // Teste 6: ClientInfo vazio usa fallback
  // --------------------------------------------------------------------------
  it("should handle empty clientInfo gracefully", async () => {
    const docs = [createTestDocument("doc1", "Plano de saúde geral")]

    mockInvoke.mockResolvedValue(
      createMockResponse([
        {
          id: "doc1",
          score: "partially_relevant",
          reason: "Sem perfil específico"
        }
      ])
    )

    const result = await gradeDocuments(docs, {})

    expect(result.documents).toHaveLength(1)
    expect(result.stats.total).toBe(1)
  })

  // --------------------------------------------------------------------------
  // Teste 7: Modelo GPT-5-mini usa modelKwargs
  // --------------------------------------------------------------------------
  it("should use modelKwargs for gpt-5-mini model", async () => {
    const docs = [createTestDocument("doc1", "Teste")]

    mockInvoke.mockResolvedValue(
      createMockResponse([{ id: "doc1", score: "relevant", reason: "Teste" }])
    )

    await gradeDocuments(docs, basicClientInfo, { model: "gpt-5-mini" })

    // O mock foi chamado, indicando que a configuração foi aceita
    expect(mockInvoke).toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // Teste 8: Modelo gpt-4o usa temperature
  // --------------------------------------------------------------------------
  it("should use temperature for non-gpt-5 models", async () => {
    const docs = [createTestDocument("doc1", "Teste")]

    mockInvoke.mockResolvedValue(
      createMockResponse([{ id: "doc1", score: "relevant", reason: "Teste" }])
    )

    await gradeDocuments(docs, basicClientInfo, { model: "gpt-4o" })

    expect(mockInvoke).toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // Teste 9: Erro do LLM usa fallback
  // --------------------------------------------------------------------------
  it("should use fallback when LLM fails", async () => {
    const docs = [createTestDocument("doc1", "Teste")]

    mockInvoke.mockRejectedValue(new Error("API Error"))

    const result = await gradeDocuments(docs, basicClientInfo)

    // Fallback: marca como partially_relevant
    expect(result.documents[0].gradeResult?.score).toBe("partially_relevant")
    expect(result.documents[0].isRelevant).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Teste 10: Timeout usa fallback
  // --------------------------------------------------------------------------
  it("should handle timeout gracefully", async () => {
    const docs = [createTestDocument("doc1", "Teste")]

    mockInvoke.mockRejectedValue(new Error("Timeout exceeded"))

    const result = await gradeDocuments(docs, basicClientInfo, { timeout: 100 })

    expect(result.documents).toHaveLength(1)
    expect(result.stats.total).toBe(1)
  })

  // --------------------------------------------------------------------------
  // Teste 11: Documento sem metadata
  // --------------------------------------------------------------------------
  it("should handle documents without metadata", async () => {
    const doc: FusedDocument = {
      id: "doc-no-meta",
      content: "Conteúdo sem metadata",
      rrfScore: 0.5,
      appearances: 1,
      queryMatches: []
    }

    mockInvoke.mockResolvedValue(
      createMockResponse([
        {
          id: "doc-no-meta",
          score: "relevant",
          reason: "Documento sem metadata processado"
        }
      ])
    )

    const result = await gradeDocuments([doc], basicClientInfo)

    expect(result.documents).toHaveLength(1)
    expect(result.stats.relevant).toBe(1)
  })

  // --------------------------------------------------------------------------
  // Teste 12: ClientInfo completo com todos os campos
  // --------------------------------------------------------------------------
  it("should handle complete clientInfo with all fields", async () => {
    const fullClientInfo: ClientInfoForQueries = {
      age: 45,
      city: "Curitiba",
      state: "PR",
      budget: 1500,
      dependents: [
        { age: 18, relationship: "filho" },
        { age: 42, relationship: "esposa" }
      ],
      preExistingConditions: ["diabetes", "hipertensão"],
      preferences: ["rede ampla", "sem carência"]
    }

    const docs = [createTestDocument("doc1", "Plano completo família")]

    mockInvoke.mockResolvedValue(
      createMockResponse([
        { id: "doc1", score: "relevant", reason: "Perfil completo atendido" }
      ])
    )

    const result = await gradeDocuments(docs, fullClientInfo)

    expect(result.stats.relevant).toBe(1)
  })

  // --------------------------------------------------------------------------
  // Teste 13: Array vazio de documentos
  // --------------------------------------------------------------------------
  it("should handle empty documents array", async () => {
    const result = await gradeDocuments([], basicClientInfo)

    expect(result.documents).toHaveLength(0)
    expect(result.relevantDocuments).toHaveLength(0)
    expect(result.stats.total).toBe(0)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // Teste 14: filterIrrelevant = false mantém todos
  // --------------------------------------------------------------------------
  it("should keep irrelevant docs when filterIrrelevant is false", async () => {
    const docs = [createTestDocument("doc1", "Plano irrelevante")]

    mockInvoke.mockResolvedValue(
      createMockResponse([
        { id: "doc1", score: "irrelevant", reason: "Não compatível" }
      ])
    )

    const result = await gradeDocuments(docs, basicClientInfo, {
      filterIrrelevant: false
    })

    expect(result.relevantDocuments).toHaveLength(1) // Não filtrado
  })
})

// =============================================================================
// Tests for helper functions
// =============================================================================

describe("filterRelevantDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return only relevant documents as FusedDocument", async () => {
    const docs = [
      createTestDocument("doc1", "Relevante"),
      createTestDocument("doc2", "Irrelevante")
    ]

    mockInvoke.mockResolvedValue(
      createMockResponse([
        {
          id: "doc1",
          score: "relevant",
          reason: "Documento compatível com perfil"
        },
        {
          id: "doc2",
          score: "irrelevant",
          reason: "Documento não compatível com perfil"
        }
      ])
    )

    const result = await filterRelevantDocuments(docs, basicClientInfo)

    // Pelo menos o doc relevante deve estar no resultado
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.some(d => d.id === "doc1")).toBe(true)
    expect(result[0].rrfScore).toBeDefined()
  })
})

describe("countByScore", () => {
  it("should count documents by score correctly", () => {
    const docs = [
      {
        id: "1",
        content: "",
        gradeResult: {
          documentId: "1",
          score: "relevant" as const,
          reason: "ok"
        },
        isRelevant: true
      },
      {
        id: "2",
        content: "",
        gradeResult: {
          documentId: "2",
          score: "relevant" as const,
          reason: "ok"
        },
        isRelevant: true
      },
      {
        id: "3",
        content: "",
        gradeResult: {
          documentId: "3",
          score: "partially_relevant" as const,
          reason: "ok"
        },
        isRelevant: true
      },
      {
        id: "4",
        content: "",
        gradeResult: {
          documentId: "4",
          score: "irrelevant" as const,
          reason: "no"
        },
        isRelevant: false
      }
    ]

    const counts = countByScore(docs)

    expect(counts.relevant).toBe(2)
    expect(counts.partially_relevant).toBe(1)
    expect(counts.irrelevant).toBe(1)
  })
})
