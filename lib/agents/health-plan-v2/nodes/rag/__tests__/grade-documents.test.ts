/**
 * A1.8 - Testes para grade-documents.ts (gradeByFile)
 * Cobre: grading com LLM, arquivos vazios, batch processing, extração de relevância, stats
 */

// Mocks dos módulos externos - ANTES dos imports
const mockLLMInvoke = jest.fn()

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockLLMInvoke
  }))
}))

import {
  gradeByFile,
  type FileGradingResult,
  type GradeByFileOptions
} from "../grade-documents"
import type { RetrieveByFileResult } from "../retrieve-simple"

// =============================================================================
// Factories
// =============================================================================

function makeFileResult(
  fileId: string,
  chunkCount = 2,
  collectionName = "Einstein Saúde"
): RetrieveByFileResult {
  return {
    fileId,
    fileName: `plano-${fileId}.pdf`,
    fileDescription: `Plano ${fileId}`,
    collection: {
      id: "col1",
      name: collectionName,
      description: "Operadora Einstein"
    },
    chunks: Array.from({ length: chunkCount }, (_, i) => ({
      id: `${fileId}-chunk-${i}`,
      content: `Conteúdo do chunk ${i} para o plano ${fileId}`,
      tokens: 50,
      similarity: 0.85,
      file: { id: fileId, name: `plano-${fileId}.pdf`, description: "" },
      collection: { id: "col1", name: collectionName, description: "" }
    })),
    totalChunks: chunkCount
  }
}

const highCompatResponse = `**COMPATIBILIDADE:** Alta

**ATENDE AO PERFIL:**
- Faixa etária: Sim - Cobre todas as idades
- Localização: Sim - Disponível em SP
- Orçamento: Sim - Preço acessível
- Dependentes: N/A

**DESTAQUES DO PLANO:**
- Cobertura ambulatorial completa
- Rede credenciada ampla

**ALERTAS:**
- Carência de 180 dias para cirurgias

**RESPOSTA À PERGUNTA DO CLIENTE:**
Nenhuma pergunta específica identificada.

**RESUMO:**
Este plano é altamente recomendado para o perfil do cliente.`

const lowCompatResponse = `**COMPATIBILIDADE:** Inadequado

**ATENDE AO PERFIL:**
- Faixa etária: Não - Não aceita acima de 60 anos
- Localização: Não - Não disponível em SP
- Orçamento: Não - Preço acima do orçamento
- Dependentes: N/A

**DESTAQUES DO PLANO:**
- Nenhum destaque relevante

**ALERTAS:**
- Não disponível na região

**RESPOSTA À PERGUNTA DO CLIENTE:**
Nenhuma pergunta específica identificada.

**RESUMO:**
Plano não recomendado para este perfil.`

const clientInfo = {
  age: 30,
  city: "SP",
  budget: 500
}

// =============================================================================
// Tests
// =============================================================================

describe("gradeByFile", () => {
  beforeEach(() => {
    mockLLMInvoke.mockReset()
  })

  it("1. should grade files with LLM and return structured results", async () => {
    mockLLMInvoke.mockResolvedValue({ content: highCompatResponse })

    const files = [makeFileResult("f1"), makeFileResult("f2")]
    const result = await gradeByFile(files, clientInfo, [
      "Que planos têm menor carência?"
    ])

    expect(result.fileGradingResults).toHaveLength(2)
    expect(result.fileGradingResults[0].fileId).toBe("f1")
    expect(result.fileGradingResults[0].relevance).toBe("high")
    expect(result.analysisText).toBeDefined()
    expect(result.analysisText.length).toBeGreaterThan(0)
  })

  it("2. should return empty result when no files have chunks", async () => {
    const emptyFiles = [makeFileResult("f1", 0), makeFileResult("f2", 0)]
    const result = await gradeByFile(emptyFiles, clientInfo, [])

    expect(result.fileGradingResults).toHaveLength(0)
    expect(result.stats.totalFiles).toBe(0)
    expect(mockLLMInvoke).not.toHaveBeenCalled()
  })

  it("3. should process files in batches (parallelBatchSize)", async () => {
    // 5 files, batch size 2 means 3 batches
    mockLLMInvoke.mockResolvedValue({ content: highCompatResponse })

    const files = Array.from({ length: 5 }, (_, i) => makeFileResult(`f${i}`))
    const result = await gradeByFile(files, clientInfo, [], {
      parallelBatchSize: 2
    })

    expect(result.fileGradingResults).toHaveLength(5)
    expect(mockLLMInvoke).toHaveBeenCalledTimes(5)
  })

  it("4. should extract relevance='high' from Alta COMPATIBILIDADE", async () => {
    mockLLMInvoke.mockResolvedValue({ content: highCompatResponse })

    const result = await gradeByFile([makeFileResult("f1")], clientInfo, [])
    expect(result.fileGradingResults[0].relevance).toBe("high")
  })

  it("5. should extract relevance='irrelevant' from Inadequado COMPATIBILIDADE", async () => {
    mockLLMInvoke.mockResolvedValue({ content: lowCompatResponse })

    const result = await gradeByFile([makeFileResult("f1")], clientInfo, [])
    expect(result.fileGradingResults[0].relevance).toBe("irrelevant")
  })

  it("6. should calculate stats correctly (high/medium/low/irrelevant counts)", async () => {
    mockLLMInvoke
      .mockResolvedValueOnce({ content: highCompatResponse }) // f1 → high
      .mockResolvedValueOnce({ content: lowCompatResponse }) // f2 → irrelevant
      .mockResolvedValueOnce({ content: "**COMPATIBILIDADE:** Baixa\n..." }) // f3 → low

    const files = [
      makeFileResult("f1"),
      makeFileResult("f2"),
      makeFileResult("f3")
    ]
    const result = await gradeByFile(files, clientInfo, [])

    expect(result.stats.totalFiles).toBe(3)
    expect(result.stats.highRelevance).toBe(1)
    expect(result.stats.irrelevant).toBe(1)
    expect(result.stats.lowRelevance).toBe(1)
  })

  it("7. should use fallback result when LLM fails for a file", async () => {
    mockLLMInvoke.mockRejectedValue(new Error("LLM crash"))

    const result = await gradeByFile([makeFileResult("f1")], clientInfo, [])

    // Should return fallback (medium relevance) instead of throwing
    expect(result.fileGradingResults).toHaveLength(1)
    expect(result.fileGradingResults[0].relevance).toBe("medium")
    expect(result.fileGradingResults[0].analysisText).toContain(
      "análise automática não disponível"
    )
  })

  it("8. should include collectionName in results", async () => {
    mockLLMInvoke.mockResolvedValue({ content: highCompatResponse })

    const file = makeFileResult("f1", 2, "Einstein Saúde")
    const result = await gradeByFile([file], clientInfo, [])

    expect(result.fileGradingResults[0].collectionName).toBe("Einstein Saúde")
  })

  it("should filter irrelevant plans from analysisText", async () => {
    mockLLMInvoke
      .mockResolvedValueOnce({ content: highCompatResponse }) // included
      .mockResolvedValueOnce({ content: lowCompatResponse }) // excluded (irrelevant)

    const files = [makeFileResult("f1"), makeFileResult("f2")]
    const result = await gradeByFile(files, clientInfo, [])

    // f1 (high) should be in text, f2 (irrelevant) should NOT
    expect(result.analysisText).toContain("plano-f1.pdf")
    expect(result.analysisText).not.toContain("plano-f2.pdf")
  })
})
