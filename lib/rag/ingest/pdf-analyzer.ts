import { ChatOpenAI } from "@langchain/openai"

export interface PDFAnalysisResult {
  sugerir_nome: string
  sugerir_descricao: string
  operadora: string
  tipo_plano: "individual" | "familiar" | "empresarial" | "outro"
  abrangencia: "nacional" | "regional" | "municipal"
  secoes_detectadas: string[]
  tags_sugeridas: string[]
  chunk_size_recomendado: number
  chunk_overlap_recomendado: number
  justificativa_chunking: string
}

export async function analyzePDF(text: string): Promise<PDFAnalysisResult> {
  try {
    // Truncate to first ~8000 tokens (rough estimate: 4 chars per token)
    const truncated = text.slice(0, 32000)

    const llm = new ChatOpenAI({
      modelName: "gpt-5-mini",
      temperature: 1,
      timeout: 30000,
      maxRetries: 2,
      maxCompletionTokens: 4096,
      tags: ["pdf-analyzer", "health-plan-v2", "rag", "level3"],
      modelKwargs: {
        reasoning_effort: "medium"
      }
    })

    const prompt = `Você é um especialista em planos de saúde brasileiros.
Analise este documento e responda em JSON:

{
  "sugerir_nome": "Nome descritivo do arquivo",
  "sugerir_descricao": "Descrição de 1-2 frases do que este documento cobre",
  "operadora": "Nome da operadora de saúde",
  "tipo_plano": "individual|familiar|empresarial|outro",
  "abrangencia": "nacional|regional|municipal",
  "secoes_detectadas": ["preço", "cobertura", "rede_credenciada", ...],
  "tags_sugeridas": ["tag1", "tag2"],
  "chunk_size_recomendado": 3000,
  "chunk_overlap_recomendado": 200,
  "justificativa_chunking": "Motivo para tamanho recomendado"
}

Documento:
${truncated}`

    const response = await llm.invoke([{ role: "user", content: prompt }])
    const content = typeof response.content === "string" ? response.content : ""

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from PDF analysis response")
    }

    return JSON.parse(jsonMatch[0]) as PDFAnalysisResult
  } catch (error) {
    console.error("[pdf-analyzer] Analysis failed, using defaults:", error)
    return {
      sugerir_nome: "Documento de Plano de Saúde",
      sugerir_descricao: "Documento não analisado automaticamente",
      operadora: "desconhecida",
      tipo_plano: "outro",
      abrangencia: "nacional",
      secoes_detectadas: [],
      tags_sugeridas: ["regras_gerais"],
      chunk_size_recomendado: 3000,
      chunk_overlap_recomendado: 200,
      justificativa_chunking: "Configuração padrão (análise automática falhou)"
    }
  }
}
