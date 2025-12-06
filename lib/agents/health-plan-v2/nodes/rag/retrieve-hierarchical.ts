/**
 * Retrieve Hierarchical - Busca Hierárquica de Documentos
 *
 * Implementa busca em duas fases:
 * 1. Busca documentos gerais (Top-K: 5)
 * 2. Extrai operadoras mencionadas
 * 3. Busca documentos específicos (Top-K: 10)
 * 4. Combina com pesos: gerais 0.3, específicos 0.7
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6C.1
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"
import type { SearchDocument, FusedDocument } from "./result-fusion"

// =============================================================================
// Types
// =============================================================================

/**
 * Opções para busca hierárquica
 */
export interface HierarchicalRetrieveOptions {
  /** Embedding da query de busca */
  queryEmbedding: number[]
  /** IDs dos arquivos para buscar */
  fileIds: string[]
  /** Top-K para documentos gerais (default: 5) */
  generalTopK?: number
  /** Top-K para documentos específicos (default: 10) */
  specificTopK?: number
  /** Peso para documentos gerais (default: 0.3) */
  generalWeight?: number
  /** Peso para documentos específicos (default: 0.7) */
  specificWeight?: number
  /** Operadoras a priorizar (opcional - extraídas dos docs gerais) */
  priorityOperators?: string[]
  /** Cliente Supabase (opcional - cria um novo se não fornecido) */
  supabaseClient?: ReturnType<typeof createClient<Database>>
}

/**
 * Resultado da busca hierárquica
 */
export interface HierarchicalRetrieveResult {
  /** Documentos combinados e ordenados */
  documents: HierarchicalDocument[]
  /** Documentos gerais encontrados */
  generalDocs: SearchDocument[]
  /** Documentos específicos encontrados */
  specificDocs: SearchDocument[]
  /** Operadoras extraídas dos documentos gerais */
  extractedOperators: string[]
  /** Metadados da busca */
  metadata: HierarchicalMetadata
}

/**
 * Documento com score hierárquico
 */
export interface HierarchicalDocument extends SearchDocument {
  /** Score combinado (peso aplicado) */
  hierarchicalScore: number
  /** Tipo de documento na hierarquia */
  hierarchyLevel: "general" | "specific"
  /** Se foi priorizado por operadora */
  operatorPrioritized: boolean
}

/**
 * Metadados da busca hierárquica
 */
export interface HierarchicalMetadata {
  /** Total de docs gerais encontrados */
  generalDocsCount: number
  /** Total de docs específicos encontrados */
  specificDocsCount: number
  /** Total de docs combinados */
  totalDocsCount: number
  /** Operadoras extraídas */
  operatorsExtracted: number
  /** Tempo de execução em ms */
  executionTimeMs: number
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_GENERAL_TOP_K = 5
const DEFAULT_SPECIFIC_TOP_K = 10
const DEFAULT_GENERAL_WEIGHT = 0.3
const DEFAULT_SPECIFIC_WEIGHT = 0.7

/**
 * Tipo de retorno do RPC match_file_items_openai
 * Extende o tipo base com campos de metadata
 */
interface FileItemRPCResult {
  content: string
  file_id: string
  id: string
  similarity: number
  tokens: number
  // Campos adicionais que podem estar presentes
  metadata?: Record<string, any>
  plan_metadata?: Record<string, any>
}

/** Operadoras conhecidas para extração */
const KNOWN_OPERATORS = [
  "amil",
  "bradesco",
  "sulamerica",
  "sulamérica",
  "unimed",
  "hapvida",
  "notre dame",
  "notredame",
  "intermédica",
  "intermedica",
  "prevent senior",
  "porto seguro",
  "golden cross",
  "medial",
  "são cristóvão",
  "sao cristovao",
  "assim",
  "gndi"
]

// =============================================================================
// Main Function
// =============================================================================

/**
 * Executa busca hierárquica em duas fases
 *
 * @param options - Configurações da busca
 * @returns Documentos combinados e metadados
 */
export async function retrieveHierarchical(
  options: HierarchicalRetrieveOptions
): Promise<HierarchicalRetrieveResult> {
  const startTime = Date.now()

  const {
    queryEmbedding,
    fileIds,
    generalTopK = DEFAULT_GENERAL_TOP_K,
    specificTopK = DEFAULT_SPECIFIC_TOP_K,
    generalWeight = DEFAULT_GENERAL_WEIGHT,
    specificWeight = DEFAULT_SPECIFIC_WEIGHT,
    priorityOperators = [],
    supabaseClient
  } = options

  console.log("[retrieve-hierarchical] Iniciando busca hierárquica")
  console.log(`[retrieve-hierarchical] fileIds: ${fileIds.length}`)
  console.log(
    `[retrieve-hierarchical] TopK: general=${generalTopK}, specific=${specificTopK}`
  )
  console.log(
    `[retrieve-hierarchical] Pesos: general=${generalWeight}, specific=${specificWeight}`
  )

  // Criar cliente Supabase se não fornecido
  const supabase =
    supabaseClient ||
    createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

  // Fase 1: Buscar documentos gerais
  console.log("[retrieve-hierarchical] Fase 1: Buscando documentos gerais...")
  const generalDocs = await searchByDocumentType(
    supabase,
    queryEmbedding,
    fileIds,
    ["general"],
    generalTopK
  )
  console.log(
    `[retrieve-hierarchical] Fase 1: ${generalDocs.length} docs gerais encontrados`
  )

  // Extrair operadoras dos documentos gerais
  const extractedOperators = extractOperatorsFromDocs(generalDocs)
  const allPriorityOperators = [
    ...new Set([...priorityOperators, ...extractedOperators])
  ]
  console.log(
    `[retrieve-hierarchical] Operadoras extraídas: ${extractedOperators.join(", ") || "nenhuma"}`
  )

  // Fase 2: Buscar documentos específicos
  console.log(
    "[retrieve-hierarchical] Fase 2: Buscando documentos específicos..."
  )
  const specificDocs = await searchByDocumentType(
    supabase,
    queryEmbedding,
    fileIds,
    ["operator", "product"],
    specificTopK
  )
  console.log(
    `[retrieve-hierarchical] Fase 2: ${specificDocs.length} docs específicos encontrados`
  )

  // Fase 3: Combinar com pesos
  console.log("[retrieve-hierarchical] Fase 3: Combinando resultados...")
  const combinedDocs = combineWithWeights(
    generalDocs,
    specificDocs,
    generalWeight,
    specificWeight,
    allPriorityOperators
  )

  const executionTimeMs = Date.now() - startTime

  console.log(
    `[retrieve-hierarchical] Busca completa: ${combinedDocs.length} docs em ${executionTimeMs}ms`
  )

  return {
    documents: combinedDocs,
    generalDocs,
    specificDocs,
    extractedOperators,
    metadata: {
      generalDocsCount: generalDocs.length,
      specificDocsCount: specificDocs.length,
      totalDocsCount: combinedDocs.length,
      operatorsExtracted: extractedOperators.length,
      executionTimeMs
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Busca documentos filtrando por tipo de documento
 */
async function searchByDocumentType(
  supabase: ReturnType<typeof createClient<Database>>,
  queryEmbedding: number[],
  fileIds: string[],
  documentTypes: string[],
  topK: number
): Promise<SearchDocument[]> {
  if (fileIds.length === 0) {
    console.log("[retrieve-hierarchical] Nenhum fileId fornecido")
    return []
  }

  try {
    // Buscar usando match_file_items_openai
    const { data, error } = await supabase.rpc("match_file_items_openai", {
      query_embedding: queryEmbedding as any,
      match_count: topK * 3, // Buscar mais para filtrar depois
      file_ids: fileIds
    })

    if (error) {
      console.error("[retrieve-hierarchical] Erro na busca:", error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // Cast para tipo com campos de metadata
    const typedData = data as unknown as FileItemRPCResult[]

    // Filtrar por tipo de documento
    // IMPORTANTE: Documentos SEM plan_metadata são incluídos em TODAS as buscas
    // Isso garante retrocompatibilidade com dados existentes que não têm metadata
    const filtered = typedData
      .filter(item => {
        const docType =
          item.metadata?.documentType || item.plan_metadata?.documentType

        // Se não tem documentType, incluir o documento (compatibilidade)
        // Isso permite que dados legacy funcionem mesmo sem plan_metadata
        if (!docType) {
          console.log(
            `[retrieve-hierarchical] Doc sem metadata incluído: ${item.id}`
          )
          return true
        }

        return documentTypes.includes(docType.toLowerCase())
      })
      .slice(0, topK)

    // Converter para SearchDocument
    return filtered.map(item => ({
      id:
        item.id ||
        item.file_id ||
        `doc-${Math.random().toString(36).substr(2, 9)}`,
      content: item.content || "",
      score: item.similarity || 0,
      metadata: {
        documentType:
          item.metadata?.documentType || item.plan_metadata?.documentType,
        operator: item.metadata?.operator || item.plan_metadata?.operator,
        planCode: item.metadata?.planCode || item.plan_metadata?.planCode,
        tags: item.metadata?.tags || item.plan_metadata?.tags,
        fileId: item.file_id,
        fileName: item.metadata?.fileName
      }
    }))
  } catch (err) {
    console.error("[retrieve-hierarchical] Exceção na busca:", err)
    return []
  }
}

/**
 * Extrai nomes de operadoras dos documentos
 */
export function extractOperatorsFromDocs(docs: SearchDocument[]): string[] {
  const operators = new Set<string>()

  for (const doc of docs) {
    // 1. Verificar metadata.operator
    if (doc.metadata?.operator) {
      operators.add(doc.metadata.operator.toLowerCase())
    }

    // 2. Buscar operadoras conhecidas no conteúdo
    const contentLower = doc.content.toLowerCase()
    for (const operator of KNOWN_OPERATORS) {
      if (contentLower.includes(operator)) {
        // Normalizar nome da operadora
        const normalizedName = normalizeOperatorName(operator)
        operators.add(normalizedName)
      }
    }
  }

  return Array.from(operators)
}

/**
 * Normaliza nome da operadora
 */
function normalizeOperatorName(name: string): string {
  const normalizations: Record<string, string> = {
    sulamérica: "sulamerica",
    "notre dame": "notredame",
    intermédica: "intermedica",
    "são cristóvão": "sao cristovao",
    "sao cristovao": "sao cristovao"
  }

  return normalizations[name.toLowerCase()] || name.toLowerCase()
}

/**
 * Combina documentos gerais e específicos com pesos
 */
export function combineWithWeights(
  generalDocs: SearchDocument[],
  specificDocs: SearchDocument[],
  generalWeight: number,
  specificWeight: number,
  priorityOperators: string[]
): HierarchicalDocument[] {
  const combined: HierarchicalDocument[] = []
  const seenIds = new Set<string>()

  // Processar docs gerais
  for (const doc of generalDocs) {
    if (seenIds.has(doc.id)) continue
    seenIds.add(doc.id)

    const baseScore = doc.score || 0
    combined.push({
      ...doc,
      hierarchicalScore: baseScore * generalWeight,
      hierarchyLevel: "general",
      operatorPrioritized: false
    })
  }

  // Processar docs específicos
  for (const doc of specificDocs) {
    if (seenIds.has(doc.id)) continue
    seenIds.add(doc.id)

    const baseScore = doc.score || 0
    const docOperator = doc.metadata?.operator?.toLowerCase()

    // Boost para operadoras priorizadas
    const isPrioritized = docOperator && priorityOperators.includes(docOperator)
    const priorityBoost = isPrioritized ? 1.2 : 1.0

    combined.push({
      ...doc,
      hierarchicalScore: baseScore * specificWeight * priorityBoost,
      hierarchyLevel: "specific",
      operatorPrioritized: isPrioritized || false
    })
  }

  // Ordenar por score hierárquico
  combined.sort((a, b) => b.hierarchicalScore - a.hierarchicalScore)

  return combined
}

/**
 * Cria headers de debug para QA
 */
export function createDebugHeaders(
  result: HierarchicalRetrieveResult
): Record<string, string> {
  return {
    "X-General-Docs": String(result.metadata.generalDocsCount),
    "X-Specific-Docs": String(result.metadata.specificDocsCount),
    "X-Total-Docs": String(result.metadata.totalDocsCount),
    "X-Operators-Extracted": result.extractedOperators.join(",") || "none",
    "X-Execution-Time-Ms": String(result.metadata.executionTimeMs)
  }
}

/**
 * Versão simplificada que aceita query string ao invés de embedding
 * Útil para testes e integração com generate-queries
 */
export async function retrieveHierarchicalWithQuery(
  query: string,
  fileIds: string[],
  options?: Partial<
    Omit<HierarchicalRetrieveOptions, "queryEmbedding" | "fileIds">
  >
): Promise<HierarchicalRetrieveResult> {
  // Criar cliente Supabase
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Gerar embedding usando OpenAI
  const OpenAI = (await import("openai")).default
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query
  })

  const queryEmbedding = embeddingResponse.data[0].embedding

  return retrieveHierarchical({
    queryEmbedding,
    fileIds,
    supabaseClient: supabase,
    ...options
  })
}
