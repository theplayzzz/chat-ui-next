import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import type { PDFAnalysisResult } from "./pdf-analyzer"

export interface SmartChunk {
  content: string
  index: number
  section_type: string | null
  page_number: number | null
  metadata: {
    start_offset: number
    end_offset: number
  }
}

export interface SmartChunkerConfig {
  chunkSize: number
  chunkOverlap: number
  sections?: string[]
}

/**
 * Default chunk sizes by document type
 */
const CHUNK_SIZE_DEFAULTS: Record<string, { size: number; overlap: number }> = {
  tabela_precos: { size: 1500, overlap: 100 },
  contrato: { size: 3000, overlap: 300 },
  rede_credenciada: { size: 2000, overlap: 150 },
  marketing: { size: 2500, overlap: 200 },
  default: { size: 3000, overlap: 200 }
}

export function getDefaultChunkConfig(tipoPlano?: string): {
  size: number
  overlap: number
} {
  if (tipoPlano && CHUNK_SIZE_DEFAULTS[tipoPlano]) {
    return CHUNK_SIZE_DEFAULTS[tipoPlano]
  }
  return CHUNK_SIZE_DEFAULTS["default"]
}

/**
 * Section detection patterns for health plan documents
 */
const SECTION_PATTERNS: Record<string, RegExp[]> = {
  preco: [
    /pre[çc]o/i,
    /tabela.*pre[çc]o/i,
    /mensalidade/i,
    /valor/i,
    /faixa.*et[aá]ria/i
  ],
  cobertura: [/cobertura/i, /procedimento/i, /servi[çc]o/i],
  rede_credenciada: [/rede\s+credenciada/i, /hospital/i, /cl[ií]nica/i],
  exclusao: [/exclus[ãa]o/i, /n[ãa]o\s+cobre/i, /limita[çc][ãa]o/i],
  carencia: [/car[eê]ncia/i, /prazo/i],
  coparticipacao: [/coparticipa[çc][ãa]o/i, /co-participa/i],
  reembolso: [/reembolso/i, /restitui/i],
  documentacao: [/documenta[çc][ãa]o/i, /contrato/i, /cl[aá]usula/i],
  regras_gerais: [/regras?\s+gera/i, /condi[çc][oõ]es?\s+gera/i]
}

/**
 * Detect section type for a chunk based on its content
 */
export function detectSectionType(content: string): string | null {
  for (const [section, patterns] of Object.entries(SECTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return section
      }
    }
  }
  return null
}

/**
 * Estimate page number based on character offset (rough: ~3000 chars per page)
 */
function estimatePageNumber(offset: number): number {
  return Math.floor(offset / 3000) + 1
}

/**
 * Smart chunking with section awareness
 */
export async function smartChunk(
  text: string,
  config: SmartChunkerConfig
): Promise<SmartChunk[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    separators: ["\n\n", "\n", ". ", " ", ""]
  })

  const docs = await splitter.createDocuments([text])

  const chunks: SmartChunk[] = []
  let currentOffset = 0

  for (let i = 0; i < docs.length; i++) {
    const content = docs[i].pageContent
    const startOffset = text.indexOf(content, currentOffset)
    const actualOffset = startOffset >= 0 ? startOffset : currentOffset

    chunks.push({
      content,
      index: i,
      section_type: detectSectionType(content),
      page_number: estimatePageNumber(actualOffset),
      metadata: {
        start_offset: actualOffset,
        end_offset: actualOffset + content.length
      }
    })

    currentOffset = actualOffset + content.length - config.chunkOverlap
  }

  return chunks
}

/**
 * Smart chunk with analysis-informed config
 */
export async function smartChunkWithAnalysis(
  text: string,
  analysis: PDFAnalysisResult
): Promise<SmartChunk[]> {
  return smartChunk(text, {
    chunkSize: analysis.chunk_size_recomendado,
    chunkOverlap: analysis.chunk_overlap_recomendado,
    sections: analysis.secoes_detectadas
  })
}
