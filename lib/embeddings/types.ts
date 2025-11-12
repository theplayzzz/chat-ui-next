/**
 * Tipos e interfaces para geração de embeddings
 */

/**
 * Embedding gerado pela OpenAI (1536 dimensões)
 */
export type Embedding = number[]

/**
 * Dimensões do embedding OpenAI text-embedding-3-small
 */
export const EMBEDDING_DIMENSIONS = 1536

/**
 * Modelo de embedding utilizado
 */
export const EMBEDDING_MODEL = "text-embedding-3-small" as const

/**
 * Resultado da geração de embedding com metadados
 */
export interface EmbeddingResult {
  embedding: Embedding
  text: string
  model: typeof EMBEDDING_MODEL
  dimensions: number
  timestamp: Date
}

/**
 * Configuração para geração de embeddings
 */
export interface EmbeddingConfig {
  model?: string
  maxTokens?: number
  retries?: number
  retryDelay?: number
}

/**
 * Resultado de busca por similaridade
 */
export interface SimilaritySearchResult {
  text: string
  similarity: number
  embedding?: Embedding
  metadata?: Record<string, any>
}

/**
 * Erro específico de geração de embeddings
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = "EmbeddingError"
  }
}
