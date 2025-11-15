export * from "./csv"
export * from "./docx"
export * from "./json"
export * from "./md"
export * from "./pdf"
export * from "./txt"

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"

// Default chunk configuration
export const DEFAULT_CHUNK_SIZE = 4000
export const DEFAULT_CHUNK_OVERLAP = 200

// Legacy constants for backward compatibility
export const CHUNK_SIZE = DEFAULT_CHUNK_SIZE
export const CHUNK_OVERLAP = DEFAULT_CHUNK_OVERLAP

/**
 * Configuration for text chunking
 */
export interface ChunkConfig {
  chunkSize: number
  chunkOverlap: number
}

/**
 * Creates a configurable RecursiveCharacterTextSplitter
 * @param config - Chunk configuration (optional, uses defaults if not provided)
 * @returns Configured text splitter
 */
export function createConfigurableTextSplitter(
  config?: Partial<ChunkConfig>
): RecursiveCharacterTextSplitter {
  const chunkSize = config?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const chunkOverlap = config?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP

  // Validate configuration
  if (chunkSize <= 0) {
    throw new Error(`chunk_size must be positive, got ${chunkSize}`)
  }

  if (chunkOverlap < 0) {
    throw new Error(`chunk_overlap must be non-negative, got ${chunkOverlap}`)
  }

  if (chunkOverlap >= chunkSize) {
    throw new Error(
      `chunk_overlap (${chunkOverlap}) must be less than chunk_size (${chunkSize})`
    )
  }

  return new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap
  })
}
