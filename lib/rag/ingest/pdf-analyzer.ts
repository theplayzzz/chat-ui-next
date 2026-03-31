import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"

// =============================================================================
// TYPES
// =============================================================================

const ChunkingSectionSchema = z.object({
  startOffset: z.number(),
  endOffset: z.number(),
  sectionType: z.enum([
    "tabela_precos",
    "rede_credenciada",
    "texto_narrativo",
    "lista_municipios",
    "carencia",
    "coparticipacao",
    "reembolso",
    "regras",
    "indice",
    "cabecalho"
  ]),
  recommendedChunkSize: z.number().min(500).max(20000),
  isTabular: z.boolean(),
  description: z.string()
})

const ChunkingPlanSchema = z.object({
  sections: z.array(ChunkingSectionSchema)
})

export type ChunkingSection = z.infer<typeof ChunkingSectionSchema>
export type ChunkingPlan = z.infer<typeof ChunkingPlanSchema>

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
  chunking_plan?: ChunkingPlan
}

// =============================================================================
// PASS 1: Basic metadata (fast, uses first 8K chars)
// =============================================================================

async function analyzeBasicMetadata(
  text: string
): Promise<Omit<PDFAnalysisResult, "chunking_plan">> {
  const preview = text.slice(0, 32000)

  const llm = new ChatOpenAI({
    modelName: "gpt-5.4-mini",
    temperature: 1,
    timeout: 30000,
    maxRetries: 2,
    maxCompletionTokens: 4096,
    tags: ["pdf-analyzer", "health-plan-v2", "rag", "level3"],
    modelKwargs: { reasoning_effort: "low" }
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
${preview}`

  const response = await llm.invoke([{ role: "user", content: prompt }])
  const content = typeof response.content === "string" ? response.content : ""

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error("Failed to extract JSON from PDF analysis response")
  }

  return JSON.parse(jsonMatch[0])
}

// =============================================================================
// PASS 2: Structural chunking plan (full document, uses gpt-5.4-mini 400K ctx)
// =============================================================================

async function generateChunkingPlan(
  text: string
): Promise<ChunkingPlan | null> {
  try {
    const textLength = text.length

    console.log(
      `[pdf-analyzer] Generating chunking plan for ${textLength} chars (~${Math.round(textLength / 4)} tokens)`
    )

    const llm = new ChatOpenAI({
      modelName: "gpt-5.4-mini",
      temperature: 1,
      timeout: 90000,
      maxRetries: 2,
      maxCompletionTokens: 8192,
      tags: ["pdf-analyzer", "chunking-plan", "health-plan-v2"],
      modelKwargs: { reasoning_effort: "medium" }
    })

    const prompt = `Você é um especialista em análise estrutural de documentos de planos de saúde.

Analise o documento completo abaixo e identifique TODAS as seções.
Para cada seção, forneça:
- startOffset e endOffset (posição em caracteres no texto, começando em 0)
- sectionType: um dos valores: tabela_precos, rede_credenciada, texto_narrativo, lista_municipios, carencia, coparticipacao, reembolso, regras, indice, cabecalho
- recommendedChunkSize:
  - Para TABELAS DE PREÇOS: 15000-20000 (preservar tabela inteira com cabeçalhos)
  - Para LISTAS DE MUNICÍPIOS ou REDE CREDENCIADA: 10000-15000 (manter lista completa)
  - Para TABELAS DE CARÊNCIA ou COPARTICIPAÇÃO: 10000-15000 (manter tabela completa)
  - Para TEXTO NARRATIVO: 3000-4000
- isTabular: true se a seção contém tabelas, listas estruturadas ou dados numéricos em formato tabular
- description: breve descrição do conteúdo da seção

REGRAS IMPORTANTES:
1. As seções devem cobrir o documento INTEIRO, sem lacunas
2. O startOffset da primeira seção DEVE ser 0
3. O endOffset da última seção DEVE ser ${textLength}
4. O endOffset de uma seção deve ser igual ao startOffset da próxima
5. Seções tabulares com dados de preço, carência, coparticipação ou rede NÃO devem ser divididas
6. Prefira chunks MAIORES para dados estruturados — é melhor ter um chunk grande com contexto completo do que vários pedaços sem cabeçalho

Responda APENAS com JSON no formato: {"sections": [...]}

DOCUMENTO COMPLETO (${textLength} caracteres):
${text}`

    const response = await llm.invoke([{ role: "user", content: prompt }])
    const content = typeof response.content === "string" ? response.content : ""

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[pdf-analyzer] No JSON found in chunking plan response")
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])
    const result = ChunkingPlanSchema.safeParse(parsed)

    if (!result.success) {
      console.warn(
        "[pdf-analyzer] Chunking plan validation failed:",
        result.error.message
      )
      return null
    }

    console.log(
      `[pdf-analyzer] Chunking plan generated: ${result.data.sections.length} sections`,
      result.data.sections.map(s => ({
        type: s.sectionType,
        size: s.endOffset - s.startOffset,
        tabular: s.isTabular
      }))
    )

    return result.data
  } catch (error) {
    console.error("[pdf-analyzer] Chunking plan generation failed:", error)
    return null
  }
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export async function analyzePDF(text: string): Promise<PDFAnalysisResult> {
  try {
    // Pass 1: Basic metadata (fast, truncated)
    const basicResult = await analyzeBasicMetadata(text)

    // Pass 2: Full-document structural analysis for chunking plan
    const chunkingPlan = await generateChunkingPlan(text)

    return {
      ...basicResult,
      chunking_plan: chunkingPlan || undefined
    }
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
