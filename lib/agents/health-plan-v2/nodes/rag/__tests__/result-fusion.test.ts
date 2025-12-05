/**
 * Testes para result-fusion.ts (RRF - Reciprocal Rank Fusion)
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Fase 6A.5: > 8 casos de teste
 */

import { describe, it, expect } from "vitest"
import {
  reciprocalRankFusion,
  fusionSimple,
  calculateFusionStats,
  filterByDocumentType,
  groupByOperator,
  type QueryResult,
  type SearchDocument,
  type FusedDocument
} from "../result-fusion"

// Helpers para criar documentos de teste
function createDoc(
  id: string,
  content: string,
  metadata?: SearchDocument["metadata"]
): SearchDocument {
  return { id, content, metadata }
}

function createQueryResult(query: string, docs: SearchDocument[]): QueryResult {
  return { query, documents: docs }
}

describe("reciprocalRankFusion", () => {
  // Teste 1: Fusão básica de duas queries
  it("should fuse results from two queries correctly", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("query 1", [
        createDoc("doc1", "Conteúdo 1"),
        createDoc("doc2", "Conteúdo 2"),
        createDoc("doc3", "Conteúdo 3")
      ]),
      createQueryResult("query 2", [
        createDoc("doc2", "Conteúdo 2"),
        createDoc("doc4", "Conteúdo 4"),
        createDoc("doc1", "Conteúdo 1")
      ])
    ]

    const result = reciprocalRankFusion(queryResults)

    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThanOrEqual(15) // Default topK
  })

  // Teste 2: Documento em múltiplas queries recebe score maior
  it("should give higher score to documents appearing in multiple queries", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("query 1", [
        createDoc("doc_shared", "Compartilhado"),
        createDoc("doc_only_1", "Apenas 1")
      ]),
      createQueryResult("query 2", [
        createDoc("doc_shared", "Compartilhado"),
        createDoc("doc_only_2", "Apenas 2")
      ]),
      createQueryResult("query 3", [
        createDoc("doc_shared", "Compartilhado"),
        createDoc("doc_only_3", "Apenas 3")
      ])
    ]

    const result = reciprocalRankFusion(queryResults)

    // doc_shared deve ser o primeiro (aparece em 3 queries)
    expect(result[0].id).toBe("doc_shared")
    expect(result[0].appearances).toBe(3)
  })

  // Teste 3: Respeita topK limit
  it("should respect topK limit", () => {
    const docs = Array.from({ length: 20 }, (_, i) =>
      createDoc(`doc${i}`, `Content ${i}`)
    )

    const queryResults: QueryResult[] = [
      createQueryResult("query 1", docs.slice(0, 10)),
      createQueryResult("query 2", docs.slice(10, 20))
    ]

    const result = reciprocalRankFusion(queryResults, { topK: 5 })

    expect(result.length).toBe(5)
  })

  // Teste 4: Constante k afeta scores
  it("should apply k constant correctly in RRF formula", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("query 1", [
        createDoc("doc1", "Content 1"),
        createDoc("doc2", "Content 2")
      ])
    ]

    // Com k=60 (default)
    const resultK60 = reciprocalRankFusion(queryResults, { k: 60 })
    // Com k=10
    const resultK10 = reciprocalRankFusion(queryResults, { k: 10 })

    // Score com k menor deve ser maior (1/(10+1) > 1/(60+1))
    expect(resultK10[0].rrfScore).toBeGreaterThan(resultK60[0].rrfScore)
  })

  // Teste 5: Multi-query boost funciona
  it("should apply multi-query boost when enabled", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("query 1", [createDoc("doc1", "Content")]),
      createQueryResult("query 2", [createDoc("doc1", "Content")])
    ]

    const withBoost = reciprocalRankFusion(queryResults, {
      multiQueryBoost: true,
      boostFactor: 0.5
    })
    const withoutBoost = reciprocalRankFusion(queryResults, {
      multiQueryBoost: false
    })

    expect(withBoost[0].rrfScore).toBeGreaterThan(withoutBoost[0].rrfScore)
  })

  // Teste 6: Rastreia queryMatches corretamente
  it("should track which queries matched each document", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("plano saúde SP", [createDoc("doc1", "Content")]),
      createQueryResult("cobertura completa", [createDoc("doc1", "Content")]),
      createQueryResult("preço baixo", [createDoc("doc2", "Other")])
    ]

    const result = reciprocalRankFusion(queryResults)

    const doc1 = result.find(d => d.id === "doc1")
    expect(doc1?.queryMatches).toContain("plano saúde SP")
    expect(doc1?.queryMatches).toContain("cobertura completa")
    expect(doc1?.queryMatches).not.toContain("preço baixo")
  })

  // Teste 7: Preserva metadata dos documentos
  it("should preserve document metadata", () => {
    const metadata = {
      documentType: "product",
      operator: "Einstein",
      tags: ["plano", "saúde"]
    }

    const queryResults: QueryResult[] = [
      createQueryResult("query", [createDoc("doc1", "Content", metadata)])
    ]

    const result = reciprocalRankFusion(queryResults)

    expect(result[0].metadata).toEqual(metadata)
  })

  // Teste 8: Lida com queries vazias
  it("should handle empty query results", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("query 1", []),
      createQueryResult("query 2", [createDoc("doc1", "Content")])
    ]

    const result = reciprocalRankFusion(queryResults)

    expect(result.length).toBe(1)
    expect(result[0].id).toBe("doc1")
  })

  // Teste 9: Ordena por score decrescente
  it("should sort results by RRF score descending", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("query 1", [
        createDoc("doc1", "Content 1"),
        createDoc("doc2", "Content 2"),
        createDoc("doc3", "Content 3")
      ])
    ]

    const result = reciprocalRankFusion(queryResults)

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].rrfScore).toBeGreaterThanOrEqual(result[i].rrfScore)
    }
  })
})

describe("fusionSimple", () => {
  // Teste 10: Versão simplificada funciona
  it("should work with simple document arrays", () => {
    const arrays: SearchDocument[][] = [
      [createDoc("doc1", "A"), createDoc("doc2", "B")],
      [createDoc("doc2", "B"), createDoc("doc3", "C")]
    ]

    const result = fusionSimple(arrays)

    expect(result.length).toBe(3)
    // doc2 deve ter maior score (aparece em ambas)
    expect(result[0].id).toBe("doc2")
  })
})

describe("calculateFusionStats", () => {
  // Teste 11: Calcula estatísticas corretamente
  it("should calculate correct fusion statistics", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("q1", [createDoc("d1", "A"), createDoc("d2", "B")]),
      createQueryResult("q2", [createDoc("d2", "B"), createDoc("d3", "C")])
    ]

    const fusedDocs = reciprocalRankFusion(queryResults)
    const stats = calculateFusionStats(queryResults, fusedDocs)

    expect(stats.totalQueries).toBe(2)
    expect(stats.totalDocuments).toBe(4)
    expect(stats.uniqueDocuments).toBe(3)
    expect(stats.maxAppearances).toBe(2) // d2 aparece em ambas
  })

  // Teste 12: Identifica top doc
  it("should identify top document", () => {
    const queryResults: QueryResult[] = [
      createQueryResult("q1", [createDoc("best_doc", "Best content")])
    ]

    const fusedDocs = reciprocalRankFusion(queryResults)
    const stats = calculateFusionStats(queryResults, fusedDocs)

    expect(stats.topDocId).toBe("best_doc")
    expect(stats.topDocScore).toBeGreaterThan(0)
  })
})

describe("filterByDocumentType", () => {
  // Teste 13: Filtra por tipo de documento
  it("should filter documents by type", () => {
    const docs: FusedDocument[] = [
      {
        id: "1",
        content: "A",
        rrfScore: 1,
        appearances: 1,
        queryMatches: [],
        metadata: { documentType: "product" }
      },
      {
        id: "2",
        content: "B",
        rrfScore: 0.9,
        appearances: 1,
        queryMatches: [],
        metadata: { documentType: "faq" }
      },
      {
        id: "3",
        content: "C",
        rrfScore: 0.8,
        appearances: 1,
        queryMatches: [],
        metadata: { documentType: "product" }
      }
    ]

    const filtered = filterByDocumentType(docs, ["product"])

    expect(filtered.length).toBe(2)
    expect(filtered.every(d => d.metadata?.documentType === "product")).toBe(
      true
    )
  })

  // Teste 14: Filtra por múltiplos tipos
  it("should filter by multiple types", () => {
    const docs: FusedDocument[] = [
      {
        id: "1",
        content: "A",
        rrfScore: 1,
        appearances: 1,
        queryMatches: [],
        metadata: { documentType: "product" }
      },
      {
        id: "2",
        content: "B",
        rrfScore: 0.9,
        appearances: 1,
        queryMatches: [],
        metadata: { documentType: "faq" }
      },
      {
        id: "3",
        content: "C",
        rrfScore: 0.8,
        appearances: 1,
        queryMatches: [],
        metadata: { documentType: "general" }
      }
    ]

    const filtered = filterByDocumentType(docs, ["product", "faq"])

    expect(filtered.length).toBe(2)
  })
})

describe("groupByOperator", () => {
  // Teste 15: Agrupa por operadora
  it("should group documents by operator", () => {
    const docs: FusedDocument[] = [
      {
        id: "1",
        content: "A",
        rrfScore: 1,
        appearances: 1,
        queryMatches: [],
        metadata: { operator: "Einstein" }
      },
      {
        id: "2",
        content: "B",
        rrfScore: 0.9,
        appearances: 1,
        queryMatches: [],
        metadata: { operator: "Amil" }
      },
      {
        id: "3",
        content: "C",
        rrfScore: 0.8,
        appearances: 1,
        queryMatches: [],
        metadata: { operator: "Einstein" }
      }
    ]

    const groups = groupByOperator(docs)

    expect(groups.get("Einstein")?.length).toBe(2)
    expect(groups.get("Amil")?.length).toBe(1)
  })

  // Teste 16: Agrupa docs sem operadora em "unknown"
  it("should group documents without operator as unknown", () => {
    const docs: FusedDocument[] = [
      {
        id: "1",
        content: "A",
        rrfScore: 1,
        appearances: 1,
        queryMatches: [],
        metadata: {}
      },
      { id: "2", content: "B", rrfScore: 0.9, appearances: 1, queryMatches: [] }
    ]

    const groups = groupByOperator(docs)

    expect(groups.get("unknown")?.length).toBe(2)
  })
})
