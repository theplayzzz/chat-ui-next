/**
 * Testes Unitários - retrieve-hierarchical.ts
 *
 * Testa busca hierárquica com pesos 0.3/0.7
 * PRD: Fase 6C.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  extractOperatorsFromDocs,
  combineWithWeights,
  createDebugHeaders,
  type HierarchicalRetrieveResult
} from "../retrieve-hierarchical"
import type { SearchDocument } from "../result-fusion"

// =============================================================================
// Test Data
// =============================================================================

const createMockDoc = (
  id: string,
  content: string,
  score: number,
  metadata?: Partial<SearchDocument["metadata"]>
): SearchDocument => ({
  id,
  content,
  score,
  metadata: {
    documentType: metadata?.documentType,
    operator: metadata?.operator,
    planCode: metadata?.planCode,
    tags: metadata?.tags,
    fileId: metadata?.fileId,
    fileName: metadata?.fileName
  }
})

const generalDocs: SearchDocument[] = [
  createMockDoc(
    "doc-general-1",
    "Guia geral de planos de saúde. Operadoras como Amil, Bradesco e SulAmérica oferecem diferentes coberturas.",
    0.85,
    { documentType: "general" }
  ),
  createMockDoc(
    "doc-general-2",
    "Comparativo de operadoras: Unimed tem forte presença regional, enquanto Hapvida domina o Norte/Nordeste.",
    0.78,
    { documentType: "general" }
  ),
  createMockDoc(
    "doc-general-3",
    "Dicas para escolher plano de saúde: considere cobertura, rede credenciada e preço.",
    0.72,
    { documentType: "general" }
  )
]

const specificDocs: SearchDocument[] = [
  createMockDoc(
    "doc-amil-400",
    "Plano Amil 400 - Cobertura nacional, quarto individual, rede premium.",
    0.92,
    { documentType: "product", operator: "Amil", planCode: "AMIL-400" }
  ),
  createMockDoc(
    "doc-bradesco-saude",
    "Bradesco Saúde Nacional Flex - Plano com coparticipação, boa relação custo-benefício.",
    0.88,
    { documentType: "product", operator: "Bradesco", planCode: "BRAD-FLEX" }
  ),
  createMockDoc(
    "doc-sulamerica-ref",
    "SulAmérica Referência - Ampla rede hospitalar, cobertura completa.",
    0.85,
    { documentType: "product", operator: "SulAmérica", planCode: "SUL-REF" }
  ),
  createMockDoc(
    "doc-unimed-standard",
    "Unimed Standard SP - Plano regional com foco em São Paulo.",
    0.8,
    { documentType: "operator", operator: "Unimed" }
  ),
  createMockDoc(
    "doc-hapvida-basic",
    "Hapvida Básico - Opção econômica para Norte e Nordeste.",
    0.75,
    { documentType: "operator", operator: "Hapvida" }
  )
]

// =============================================================================
// Tests: extractOperatorsFromDocs
// =============================================================================

describe("extractOperatorsFromDocs", () => {
  it("deve extrair operadoras do metadata.operator", () => {
    const docs: SearchDocument[] = [
      createMockDoc("1", "Conteúdo", 0.9, { operator: "Amil" }),
      createMockDoc("2", "Conteúdo", 0.8, { operator: "Bradesco" })
    ]

    const operators = extractOperatorsFromDocs(docs)

    expect(operators).toContain("amil")
    expect(operators).toContain("bradesco")
    expect(operators).toHaveLength(2)
  })

  it("deve extrair operadoras mencionadas no conteúdo", () => {
    const docs: SearchDocument[] = [
      createMockDoc(
        "1",
        "A Amil e a SulAmérica são líderes no mercado de planos.",
        0.9
      )
    ]

    const operators = extractOperatorsFromDocs(docs)

    expect(operators).toContain("amil")
    expect(operators).toContain("sulamerica") // Normalizado sem acento
  })

  it("deve normalizar nomes de operadoras (acentos, variações)", () => {
    const docs: SearchDocument[] = [
      createMockDoc("1", "SulAmérica tem bons planos.", 0.9),
      createMockDoc("2", "Notre Dame Intermédica cresceu muito.", 0.8),
      createMockDoc("3", "São Cristóvão atende bem no RJ.", 0.7)
    ]

    const operators = extractOperatorsFromDocs(docs)

    expect(operators).toContain("sulamerica")
    expect(operators).toContain("notredame")
    expect(operators).toContain("intermedica")
    expect(operators).toContain("sao cristovao")
  })

  it("deve remover duplicatas", () => {
    const docs: SearchDocument[] = [
      createMockDoc("1", "Amil é boa", 0.9, { operator: "Amil" }),
      createMockDoc("2", "Escolha a Amil", 0.8, { operator: "Amil" })
    ]

    const operators = extractOperatorsFromDocs(docs)

    expect(operators.filter(o => o === "amil")).toHaveLength(1)
  })

  it("deve retornar array vazio se não encontrar operadoras", () => {
    const docs: SearchDocument[] = [
      createMockDoc("1", "Texto genérico sobre saúde.", 0.9)
    ]

    const operators = extractOperatorsFromDocs(docs)

    expect(operators).toHaveLength(0)
  })

  it("deve extrair múltiplas operadoras de um único documento", () => {
    const docs: SearchDocument[] = [
      createMockDoc(
        "1",
        "Comparando Amil, Bradesco, Unimed e Hapvida para sua família.",
        0.9
      )
    ]

    const operators = extractOperatorsFromDocs(docs)

    expect(operators).toContain("amil")
    expect(operators).toContain("bradesco")
    expect(operators).toContain("unimed")
    expect(operators).toContain("hapvida")
    expect(operators.length).toBeGreaterThanOrEqual(4)
  })
})

// =============================================================================
// Tests: combineWithWeights
// =============================================================================

describe("combineWithWeights", () => {
  it("deve aplicar peso 0.3 para docs gerais", () => {
    const result = combineWithWeights(generalDocs, [], 0.3, 0.7, [])

    expect(result).toHaveLength(generalDocs.length)

    const firstDoc = result[0]
    expect(firstDoc.hierarchyLevel).toBe("general")
    expect(firstDoc.hierarchicalScore).toBeCloseTo(0.85 * 0.3, 4)
  })

  it("deve aplicar peso 0.7 para docs específicos", () => {
    const result = combineWithWeights([], specificDocs, 0.3, 0.7, [])

    expect(result).toHaveLength(specificDocs.length)

    const firstDoc = result[0]
    expect(firstDoc.hierarchyLevel).toBe("specific")
    expect(firstDoc.hierarchicalScore).toBeCloseTo(0.92 * 0.7, 4)
  })

  it("deve combinar docs gerais e específicos ordenados por score", () => {
    const result = combineWithWeights(generalDocs, specificDocs, 0.3, 0.7, [])

    expect(result).toHaveLength(generalDocs.length + specificDocs.length)

    // Verificar ordenação decrescente
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].hierarchicalScore).toBeGreaterThanOrEqual(
        result[i].hierarchicalScore
      )
    }
  })

  it("deve aplicar boost de 1.2x para operadoras priorizadas", () => {
    const result = combineWithWeights([], specificDocs, 0.3, 0.7, ["amil"])

    const amilDoc = result.find(d => d.metadata?.operator === "Amil")
    const bradescoDoc = result.find(d => d.metadata?.operator === "Bradesco")

    expect(amilDoc?.operatorPrioritized).toBe(true)
    expect(bradescoDoc?.operatorPrioritized).toBe(false)

    // Amil tem boost 1.2x
    expect(amilDoc?.hierarchicalScore).toBeCloseTo(0.92 * 0.7 * 1.2, 4)
    // Bradesco não tem boost
    expect(bradescoDoc?.hierarchicalScore).toBeCloseTo(0.88 * 0.7, 4)
  })

  it("deve remover IDs duplicados", () => {
    const duplicateDoc = createMockDoc("doc-duplicate", "Duplicado", 0.9, {
      documentType: "general"
    })
    const duplicateSpecific = createMockDoc(
      "doc-duplicate",
      "Duplicado",
      0.85,
      {
        documentType: "product"
      }
    )

    const result = combineWithWeights(
      [duplicateDoc],
      [duplicateSpecific],
      0.3,
      0.7,
      []
    )

    const duplicates = result.filter(d => d.id === "doc-duplicate")
    expect(duplicates).toHaveLength(1)
  })

  it("deve manter hierarchyLevel correto para cada documento", () => {
    const result = combineWithWeights(
      [generalDocs[0]],
      [specificDocs[0]],
      0.3,
      0.7,
      []
    )

    const generalResult = result.find(d => d.id === "doc-general-1")
    const specificResult = result.find(d => d.id === "doc-amil-400")

    expect(generalResult?.hierarchyLevel).toBe("general")
    expect(specificResult?.hierarchyLevel).toBe("specific")
  })

  it("deve funcionar com pesos customizados", () => {
    const result = combineWithWeights(
      [generalDocs[0]],
      [specificDocs[0]],
      0.5,
      0.5,
      []
    )

    const generalResult = result.find(d => d.id === "doc-general-1")
    const specificResult = result.find(d => d.id === "doc-amil-400")

    expect(generalResult?.hierarchicalScore).toBeCloseTo(0.85 * 0.5, 4)
    expect(specificResult?.hierarchicalScore).toBeCloseTo(0.92 * 0.5, 4)
  })

  it("deve lidar com docs sem score", () => {
    const docSemScore: SearchDocument = {
      id: "no-score",
      content: "Documento sem score",
      metadata: { documentType: "general" }
    }

    const result = combineWithWeights([docSemScore], [], 0.3, 0.7, [])

    expect(result[0].hierarchicalScore).toBe(0)
  })
})

// =============================================================================
// Tests: createDebugHeaders
// =============================================================================

describe("createDebugHeaders", () => {
  it("deve criar headers corretos", () => {
    const mockResult: HierarchicalRetrieveResult = {
      documents: [],
      generalDocs: generalDocs,
      specificDocs: specificDocs,
      extractedOperators: ["amil", "bradesco", "sulamerica"],
      metadata: {
        generalDocsCount: 3,
        specificDocsCount: 5,
        totalDocsCount: 8,
        operatorsExtracted: 3,
        executionTimeMs: 150
      }
    }

    const headers = createDebugHeaders(mockResult)

    expect(headers["X-General-Docs"]).toBe("3")
    expect(headers["X-Specific-Docs"]).toBe("5")
    expect(headers["X-Total-Docs"]).toBe("8")
    expect(headers["X-Operators-Extracted"]).toBe("amil,bradesco,sulamerica")
    expect(headers["X-Execution-Time-Ms"]).toBe("150")
  })

  it("deve retornar 'none' quando não há operadoras", () => {
    const mockResult: HierarchicalRetrieveResult = {
      documents: [],
      generalDocs: [],
      specificDocs: [],
      extractedOperators: [],
      metadata: {
        generalDocsCount: 0,
        specificDocsCount: 0,
        totalDocsCount: 0,
        operatorsExtracted: 0,
        executionTimeMs: 50
      }
    }

    const headers = createDebugHeaders(mockResult)

    expect(headers["X-Operators-Extracted"]).toBe("none")
  })
})

// =============================================================================
// Tests: Cenários de Integração
// =============================================================================

describe("Cenários de Integração", () => {
  it("cenário: busca para família em SP com Amil priorizada", () => {
    // Simula cenário onde docs gerais mencionam Amil
    const generalWithAmil: SearchDocument[] = [
      createMockDoc(
        "g1",
        "Para famílias em SP, a Amil oferece boa cobertura.",
        0.88,
        { documentType: "general" }
      )
    ]

    // Extrair operadoras
    const operators = extractOperatorsFromDocs(generalWithAmil)
    expect(operators).toContain("amil")

    // Combinar com Amil priorizada
    const result = combineWithWeights(
      generalWithAmil,
      specificDocs,
      0.3,
      0.7,
      operators
    )

    // Amil deve estar no topo por ter boost
    const topSpecific = result.filter(d => d.hierarchyLevel === "specific")[0]
    expect(topSpecific.metadata?.operator).toBe("Amil")
    expect(topSpecific.operatorPrioritized).toBe(true)
  })

  it("cenário: muitos docs específicos devem dominar ranking", () => {
    const manySpecific: SearchDocument[] = Array.from({ length: 10 }, (_, i) =>
      createMockDoc(`specific-${i}`, `Plano específico ${i}`, 0.9 - i * 0.05, {
        documentType: "product",
        operator: `Op${i}`
      })
    )

    const result = combineWithWeights(generalDocs, manySpecific, 0.3, 0.7, [])

    // Com peso 0.7 vs 0.3, específicos com score alto devem estar no topo
    const topDocs = result.slice(0, 5)
    const specificCount = topDocs.filter(
      d => d.hierarchyLevel === "specific"
    ).length

    expect(specificCount).toBeGreaterThanOrEqual(3)
  })

  it("cenário: docs gerais podem aparecer se específicos tiverem baixo score", () => {
    const lowScoreSpecific: SearchDocument[] = [
      createMockDoc("low-1", "Plano ruim", 0.3, { documentType: "product" })
    ]

    const highScoreGeneral: SearchDocument[] = [
      createMockDoc("high-gen", "Excelente guia geral", 0.95, {
        documentType: "general"
      })
    ]

    const result = combineWithWeights(
      highScoreGeneral,
      lowScoreSpecific,
      0.3,
      0.7,
      []
    )

    // 0.95 * 0.3 = 0.285 vs 0.3 * 0.7 = 0.21
    // General deve estar primeiro
    expect(result[0].hierarchyLevel).toBe("general")
  })
})

// =============================================================================
// Tests: Edge Cases
// =============================================================================

describe("Edge Cases", () => {
  it("deve lidar com arrays vazios", () => {
    const result = combineWithWeights([], [], 0.3, 0.7, [])
    expect(result).toHaveLength(0)
  })

  it("deve lidar com apenas docs gerais", () => {
    const result = combineWithWeights(generalDocs, [], 0.3, 0.7, [])
    expect(result).toHaveLength(generalDocs.length)
    expect(result.every(d => d.hierarchyLevel === "general")).toBe(true)
  })

  it("deve lidar com apenas docs específicos", () => {
    const result = combineWithWeights([], specificDocs, 0.3, 0.7, [])
    expect(result).toHaveLength(specificDocs.length)
    expect(result.every(d => d.hierarchyLevel === "specific")).toBe(true)
  })

  it("deve lidar com docs sem metadata", () => {
    const noMetadata: SearchDocument = {
      id: "no-meta",
      content: "Documento sem metadata",
      score: 0.8
    }

    const result = combineWithWeights([noMetadata], [], 0.3, 0.7, [])
    expect(result).toHaveLength(1)
    expect(result[0].operatorPrioritized).toBe(false)
  })

  it("deve lidar com score undefined", () => {
    const undefinedScore: SearchDocument = {
      id: "undef-score",
      content: "Score undefined"
    }

    const result = combineWithWeights([undefinedScore], [], 0.3, 0.7, [])
    expect(result[0].hierarchicalScore).toBe(0)
  })

  it("deve lidar com múltiplas operadoras priorizadas", () => {
    const result = combineWithWeights([], specificDocs, 0.3, 0.7, [
      "amil",
      "bradesco",
      "unimed"
    ])

    const prioritized = result.filter(d => d.operatorPrioritized)
    expect(prioritized.length).toBeGreaterThanOrEqual(3)
  })
})
