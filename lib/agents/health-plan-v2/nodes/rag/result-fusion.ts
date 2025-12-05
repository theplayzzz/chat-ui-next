/**
 * Result Fusion - Reciprocal Rank Fusion (RRF)
 *
 * Combina resultados de múltiplas queries usando o algoritmo RRF.
 * Documentos que aparecem em múltiplas queries recebem pontuação maior.
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: RF-004, Fase 6A.5
 *
 * Fórmula RRF: score(d) = Σ 1/(k + rank(d, q))
 * onde k é uma constante (default: 60) e rank é a posição do documento na query
 */

import { z } from "zod"

/**
 * Schema para documento de busca
 */
export const SearchDocumentSchema = z.object({
  id: z.string(),
  content: z.string(),
  score: z.number().optional(),
  metadata: z
    .object({
      documentType: z.string().optional(),
      operator: z.string().optional(),
      planCode: z.string().optional(),
      tags: z.array(z.string()).optional(),
      fileId: z.string().optional(),
      fileName: z.string().optional()
    })
    .optional()
})

export type SearchDocument = z.infer<typeof SearchDocumentSchema>

/**
 * Schema para resultado de uma query individual
 */
export const QueryResultSchema = z.object({
  query: z.string(),
  documents: z.array(SearchDocumentSchema)
})

export type QueryResult = z.infer<typeof QueryResultSchema>

/**
 * Documento com score RRF calculado
 */
export interface FusedDocument extends SearchDocument {
  rrfScore: number
  appearances: number // Em quantas queries o doc apareceu
  queryMatches: string[] // Quais queries retornaram este doc
}

/**
 * Opções para o algoritmo RRF
 */
export interface RRFOptions {
  /** Constante k do algoritmo RRF (default: 60) */
  k?: number
  /** Número máximo de documentos a retornar (default: 15) */
  topK?: number
  /** Aplicar boost para docs que aparecem em múltiplas queries (default: true) */
  multiQueryBoost?: boolean
  /** Fator de boost por aparição adicional (default: 0.1) */
  boostFactor?: number
}

const DEFAULT_OPTIONS: Required<RRFOptions> = {
  k: 60,
  topK: 15,
  multiQueryBoost: true,
  boostFactor: 0.1
}

/**
 * Aplica Reciprocal Rank Fusion em resultados de múltiplas queries
 *
 * @param queryResults - Array de resultados de cada query
 * @param options - Configurações do algoritmo
 * @returns Top K documentos ordenados por score RRF
 */
export function reciprocalRankFusion(
  queryResults: QueryResult[],
  options: RRFOptions = {}
): FusedDocument[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Mapa para acumular scores: docId -> { doc, score, appearances, queries }
  const scoreMap = new Map<
    string,
    {
      document: SearchDocument
      score: number
      appearances: number
      queryMatches: string[]
    }
  >()

  // Processar cada resultado de query
  for (const queryResult of queryResults) {
    const { query, documents } = queryResult

    // Calcular RRF score para cada documento
    for (let rank = 0; rank < documents.length; rank++) {
      const doc = documents[rank]
      const rrfScore = 1 / (opts.k + rank + 1) // rank é 0-indexed, então +1

      const existing = scoreMap.get(doc.id)
      if (existing) {
        // Documento já existe - acumular score
        existing.score += rrfScore
        existing.appearances += 1
        existing.queryMatches.push(query)
      } else {
        // Novo documento
        scoreMap.set(doc.id, {
          document: doc,
          score: rrfScore,
          appearances: 1,
          queryMatches: [query]
        })
      }
    }
  }

  // Converter para array e aplicar boost (se habilitado)
  const fusedDocs: FusedDocument[] = Array.from(scoreMap.values()).map(
    entry => {
      let finalScore = entry.score

      // Boost para documentos que aparecem em múltiplas queries
      if (opts.multiQueryBoost && entry.appearances > 1) {
        const boost = 1 + opts.boostFactor * (entry.appearances - 1)
        finalScore *= boost
      }

      return {
        ...entry.document,
        rrfScore: finalScore,
        appearances: entry.appearances,
        queryMatches: entry.queryMatches
      }
    }
  )

  // Ordenar por score RRF (maior primeiro) e retornar top K
  fusedDocs.sort((a, b) => b.rrfScore - a.rrfScore)

  const result = fusedDocs.slice(0, opts.topK)

  console.log(
    `[RRF] Fusão de ${queryResults.length} queries → ${fusedDocs.length} docs únicos → Top ${result.length} retornados`
  )

  return result
}

/**
 * Versão simplificada que recebe apenas arrays de documentos
 * (útil quando não precisa rastrear qual query retornou qual doc)
 */
export function fusionSimple(
  documentArrays: SearchDocument[][],
  options: RRFOptions = {}
): FusedDocument[] {
  const queryResults: QueryResult[] = documentArrays.map((docs, i) => ({
    query: `query_${i}`,
    documents: docs
  }))

  return reciprocalRankFusion(queryResults, options)
}

/**
 * Calcula estatísticas sobre a fusão
 */
export interface FusionStats {
  totalQueries: number
  totalDocuments: number
  uniqueDocuments: number
  avgAppearances: number
  maxAppearances: number
  topDocId: string | null
  topDocScore: number
}

export function calculateFusionStats(
  queryResults: QueryResult[],
  fusedDocs: FusedDocument[]
): FusionStats {
  const totalDocs = queryResults.reduce(
    (sum, qr) => sum + qr.documents.length,
    0
  )

  const avgAppearances =
    fusedDocs.length > 0
      ? fusedDocs.reduce((sum, d) => sum + d.appearances, 0) / fusedDocs.length
      : 0

  const maxAppearances =
    fusedDocs.length > 0 ? Math.max(...fusedDocs.map(d => d.appearances)) : 0

  return {
    totalQueries: queryResults.length,
    totalDocuments: totalDocs,
    uniqueDocuments: fusedDocs.length,
    avgAppearances: Math.round(avgAppearances * 100) / 100,
    maxAppearances,
    topDocId: fusedDocs[0]?.id || null,
    topDocScore: fusedDocs[0]?.rrfScore || 0
  }
}

/**
 * Filtra documentos fusionados por tipo de documento
 */
export function filterByDocumentType(
  docs: FusedDocument[],
  types: string[]
): FusedDocument[] {
  return docs.filter(doc => {
    const docType = doc.metadata?.documentType
    return docType && types.includes(docType)
  })
}

/**
 * Agrupa documentos por operadora
 */
export function groupByOperator(
  docs: FusedDocument[]
): Map<string, FusedDocument[]> {
  const groups = new Map<string, FusedDocument[]>()

  for (const doc of docs) {
    const operator = doc.metadata?.operator || "unknown"
    const existing = groups.get(operator) || []
    existing.push(doc)
    groups.set(operator, existing)
  }

  return groups
}
