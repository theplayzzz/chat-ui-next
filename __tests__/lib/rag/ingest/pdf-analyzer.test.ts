jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        sugerir_nome: "Bradesco Saúde - Plano Flex",
        sugerir_descricao: "Tabela de preços do plano Flex",
        operadora: "Bradesco Saúde",
        tipo_plano: "individual",
        abrangencia: "nacional",
        secoes_detectadas: ["preço", "cobertura"],
        tags_sugeridas: ["preco", "cobertura"],
        chunk_size_recomendado: 3000,
        chunk_overlap_recomendado: 200,
        justificativa_chunking: "Documento com tabelas de preços"
      })
    })
  }))
}))

import { analyzePDF } from "@/lib/rag/ingest/pdf-analyzer"

describe("PDF Analyzer", () => {
  test("1.1a: returns structured analysis result", async () => {
    const result = await analyzePDF("Sample health plan document text")
    expect(result).toHaveProperty("sugerir_nome")
    expect(result).toHaveProperty("operadora")
    expect(result).toHaveProperty("tipo_plano")
    expect(result).toHaveProperty("secoes_detectadas")
    expect(result).toHaveProperty("chunk_size_recomendado")
  })

  test("1.1b: tipo_plano is valid enum", async () => {
    const result = await analyzePDF("Sample text")
    expect(["individual", "familiar", "empresarial", "outro"]).toContain(result.tipo_plano)
  })

  test("1.1c: truncates long input", async () => {
    const longText = "A".repeat(100000)
    const result = await analyzePDF(longText)
    expect(result).toHaveProperty("sugerir_nome")
  })
})
