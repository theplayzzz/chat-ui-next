import OpenAI from "openai"

// Modelo de embeddings da OpenAI (1536 dimensões)
const EMBEDDING_MODEL = "text-embedding-3-small"

// Número máximo de tokens por requisição (8191 para text-embedding-3-small)
const MAX_TOKENS = 8000

/**
 * Gera embedding para um único texto usando OpenAI text-embedding-3-small
 * @param text - Texto para gerar embedding
 * @returns Array de números representando o embedding (1536 dimensões)
 * @throws Error se a API falhar ou OPENAI_API_KEY não estiver configurada
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Texto vazio fornecido para geração de embedding")
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Adicione a chave no arquivo .env.local"
    )
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: "float"
    })

    if (!response.data || response.data.length === 0) {
      throw new Error("Resposta vazia da API OpenAI")
    }

    const embedding = response.data[0].embedding

    // Validar dimensões do embedding
    if (embedding.length !== 1536) {
      throw new Error(
        `Embedding com dimensões incorretas: ${embedding.length} (esperado: 1536)`
      )
    }

    return embedding
  } catch (error) {
    // Tratamento específico para erros da OpenAI
    if (error instanceof OpenAI.APIError) {
      throw new Error(`Erro da API OpenAI (${error.status}): ${error.message}`)
    }

    // Re-throw outros erros
    throw error
  }
}

/**
 * Gera embeddings para múltiplos textos em uma única requisição
 * @param texts - Array de textos para gerar embeddings
 * @returns Array de embeddings (cada um com 1536 dimensões)
 * @throws Error se a API falhar ou OPENAI_API_KEY não estiver configurada
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    throw new Error(
      "Array de textos vazio fornecido para geração de embeddings"
    )
  }

  // Filtrar textos vazios
  const validTexts = texts.filter(t => t && t.trim().length > 0)

  if (validTexts.length === 0) {
    throw new Error("Nenhum texto válido fornecido para geração de embeddings")
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Adicione a chave no arquivo .env.local"
    )
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: validTexts,
      encoding_format: "float"
    })

    if (!response.data || response.data.length !== validTexts.length) {
      throw new Error(
        `Número incorreto de embeddings retornados: ${response.data?.length || 0} (esperado: ${validTexts.length})`
      )
    }

    // Extrair e validar embeddings
    const embeddings = response.data.map((item, index) => {
      const embedding = item.embedding

      // Validar dimensões
      if (embedding.length !== 1536) {
        throw new Error(
          `Embedding ${index} com dimensões incorretas: ${embedding.length} (esperado: 1536)`
        )
      }

      return embedding
    })

    return embeddings
  } catch (error) {
    // Tratamento específico para erros da OpenAI
    if (error instanceof OpenAI.APIError) {
      throw new Error(`Erro da API OpenAI (${error.status}): ${error.message}`)
    }

    // Re-throw outros erros
    throw error
  }
}

/**
 * Gera embedding com retry automático em caso de falha
 * @param text - Texto para gerar embedding
 * @param maxRetries - Número máximo de tentativas (padrão: 3)
 * @param delayMs - Delay entre tentativas em ms (padrão: 1000)
 * @returns Array de números representando o embedding
 */
export async function generateEmbeddingWithRetry(
  text: string,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<number[]> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateEmbedding(text)
    } catch (error) {
      lastError = error as Error
      console.error(
        `Tentativa ${attempt}/${maxRetries} falhou para geração de embedding:`,
        error
      )

      // Não esperar após a última tentativa
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt))
      }
    }
  }

  throw new Error(
    `Falha ao gerar embedding após ${maxRetries} tentativas: ${lastError?.message}`
  )
}

/**
 * Calcula similaridade de cosseno entre dois embeddings
 * @param embedding1 - Primeiro embedding
 * @param embedding2 - Segundo embedding
 * @returns Valor entre -1 e 1 representando a similaridade
 */
export function cosineSimilarity(
  embedding1: number[],
  embedding2: number[]
): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error("Embeddings devem ter o mesmo tamanho")
  }

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i]
    norm1 += embedding1[i] * embedding1[i]
    norm2 += embedding2[i] * embedding2[i]
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2)

  if (magnitude === 0) {
    return 0
  }

  return dotProduct / magnitude
}
