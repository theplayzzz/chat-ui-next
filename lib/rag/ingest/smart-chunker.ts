import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import type { PDFAnalysisResult, ChunkingPlan } from "./pdf-analyzer"

// =============================================================================
// TYPES
// =============================================================================

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

export interface SmartChunkWithChildren extends SmartChunk {
  children?: SmartChunk[]
  isParent: boolean
}

export interface SmartChunkerConfig {
  chunkSize: number
  chunkOverlap: number
  sections?: string[]
}

// =============================================================================
// CONSTANTS
// =============================================================================

const EMBEDDING_CHAR_LIMIT = 8000

const CHUNK_SIZE_DEFAULTS: Record<string, { size: number; overlap: number }> = {
  tabela_precos: { size: 1500, overlap: 100 },
  contrato: { size: 3000, overlap: 300 },
  rede_credenciada: { size: 2000, overlap: 150 },
  marketing: { size: 2500, overlap: 200 },
  default: { size: 3000, overlap: 200 }
}

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

// =============================================================================
// HELPERS
// =============================================================================

export function getDefaultChunkConfig(tipoPlano?: string): {
  size: number
  overlap: number
} {
  if (tipoPlano && CHUNK_SIZE_DEFAULTS[tipoPlano]) {
    return CHUNK_SIZE_DEFAULTS[tipoPlano]
  }
  return CHUNK_SIZE_DEFAULTS["default"]
}

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

function estimatePageNumber(offset: number): number {
  return Math.floor(offset / 3000) + 1
}

// =============================================================================
// ORIGINAL CHUNKING (backward compatible)
// =============================================================================

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

// =============================================================================
// PLAN-BASED CHUNKING (new — respects section boundaries + table integrity)
// =============================================================================

/**
 * Chunks document using a ChunkingPlan from the PDF analyzer.
 * Tabular sections are kept as single large chunks.
 * Narrative sections are split with standard RecursiveCharacterTextSplitter.
 */
export async function smartChunkWithPlan(
  text: string,
  chunkingPlan: ChunkingPlan,
  fallbackConfig: SmartChunkerConfig
): Promise<SmartChunk[]> {
  const chunks: SmartChunk[] = []
  let chunkIndex = 0

  console.log(
    `[smart-chunker] Plan-based chunking: ${chunkingPlan.sections.length} sections`
  )

  for (const section of chunkingPlan.sections) {
    // Clamp offsets to valid range
    const start = Math.max(0, Math.min(section.startOffset, text.length))
    const end = Math.max(start, Math.min(section.endOffset, text.length))
    const sectionText = text.slice(start, end)

    if (sectionText.length === 0) continue

    if (
      section.isTabular ||
      sectionText.length <= section.recommendedChunkSize
    ) {
      // Keep tabular/small sections as single chunks
      chunks.push({
        content: sectionText,
        index: chunkIndex++,
        section_type: section.sectionType,
        page_number: estimatePageNumber(start),
        metadata: { start_offset: start, end_offset: end }
      })

      console.log(
        `[smart-chunker] Section "${section.sectionType}": 1 chunk (${sectionText.length} chars, tabular=${section.isTabular})`
      )
    } else {
      // Split narrative sections with standard splitter
      const chunkSize = Math.min(
        section.recommendedChunkSize,
        fallbackConfig.chunkSize
      )
      const chunkOverlap = Math.min(200, Math.floor(chunkSize * 0.1))

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ["\n\n", "\n", ". ", " ", ""]
      })

      const docs = await splitter.createDocuments([sectionText])
      let subOffset = 0

      for (const doc of docs) {
        const contentIdx = sectionText.indexOf(doc.pageContent, subOffset)
        const absoluteOffset = start + Math.max(0, contentIdx)

        chunks.push({
          content: doc.pageContent,
          index: chunkIndex++,
          section_type: section.sectionType,
          page_number: estimatePageNumber(absoluteOffset),
          metadata: {
            start_offset: absoluteOffset,
            end_offset: absoluteOffset + doc.pageContent.length
          }
        })

        if (contentIdx >= 0) {
          subOffset = contentIdx + doc.pageContent.length - chunkOverlap
        }
      }

      console.log(
        `[smart-chunker] Section "${section.sectionType}": ${docs.length} chunks (narrative, ~${chunkSize} chars each)`
      )
    }
  }

  console.log(`[smart-chunker] Total chunks: ${chunks.length} (plan-based)`)
  return chunks
}

// =============================================================================
// PARENT/CHILD HIERARCHY
// =============================================================================

/**
 * For chunks larger than the embedding limit (8K chars), creates child sub-chunks
 * that can be embedded precisely. The parent chunk is kept for full LLM context.
 */
export async function createParentChildChunks(
  chunks: SmartChunk[]
): Promise<SmartChunkWithChildren[]> {
  const result: SmartChunkWithChildren[] = []

  for (const chunk of chunks) {
    if (chunk.content.length > EMBEDDING_CHAR_LIMIT) {
      // Large chunk — becomes parent with children
      const childSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 3000,
        chunkOverlap: 200,
        separators: ["\n\n", "\n", ". ", " ", ""]
      })

      const childDocs = await childSplitter.createDocuments([chunk.content])
      const children: SmartChunk[] = childDocs.map((doc, i) => {
        const contentIdx = chunk.content.indexOf(doc.pageContent)
        const childOffset =
          chunk.metadata.start_offset + Math.max(0, contentIdx)

        return {
          content: doc.pageContent,
          index: chunk.index * 1000 + i,
          section_type: chunk.section_type,
          page_number: estimatePageNumber(childOffset),
          metadata: {
            start_offset: childOffset,
            end_offset: childOffset + doc.pageContent.length
          }
        }
      })

      result.push({
        ...chunk,
        isParent: true,
        children
      })

      console.log(
        `[smart-chunker] Parent chunk ${chunk.index}: ${chunk.content.length} chars → ${children.length} children`
      )
    } else {
      result.push({ ...chunk, isParent: false })
    }
  }

  return result
}
