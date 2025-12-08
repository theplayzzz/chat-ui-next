/**
 * Types para Fase 6E - Análise por Collection
 *
 * Define tipos para identificação de planos reais dentro de collections.
 *
 * REGRAS IMPORTANTES:
 * - A LLM NÃO deve inventar informações
 * - Campos opcionais só devem ser preenchidos se encontrados nos documentos
 * - Foco em extrair REGRAS e CARACTERÍSTICAS reais
 */

// =============================================================================
// Plano Identificado
// =============================================================================

/**
 * Plano de saúde identificado dentro de uma collection
 *
 * IMPORTANTE: Todos os campos são opcionais exceto planName, sourceFileNames,
 * clientRelevance e relevanceJustification.
 * A LLM NÃO deve inventar informações - só preencher o que está nos documentos.
 */
export interface IdentifiedPlan {
  /** Nome do plano identificado nos documentos (OBRIGATÓRIO) */
  planName: string
  /** Arquivos que contêm informações sobre este plano (OBRIGATÓRIO) */
  sourceFileNames: string[]

  // === CAMPOS OPCIONAIS - só preencher se encontrado nos documentos ===

  /** Tipo do plano (se identificado) */
  planType?: "individual" | "familiar" | "empresarial"
  /** Resumo baseado APENAS no que está nos documentos */
  summary?: string
  /** Preço base (se encontrado na tabela de preços) */
  basePrice?: {
    value: number
    currency: "BRL"
    period: "mensal" | "anual"
    /** Faixa etária do preço (ex: "30-39 anos") */
    ageRange?: string
  }
  /** Cobertura geográfica (se especificada) */
  coverage?: string[]

  // === REGRAS E CARACTERÍSTICAS EXTRAÍDAS ===

  /** Regras importantes encontradas nos documentos */
  importantRules?: string[]
  /** Carências identificadas */
  waitingPeriods?: string[]
  /** Coparticipação (se mencionada) */
  coparticipation?: string
  /** Rede credenciada (se mencionada) */
  network?: string[]

  /** Relevância para o cliente baseada na análise (OBRIGATÓRIO) */
  clientRelevance: "high" | "medium" | "low" | "irrelevant"
  /** Justificativa da relevância baseada em fatos dos documentos (OBRIGATÓRIO) */
  relevanceJustification: string
}

// =============================================================================
// Resultado da Análise por Collection
// =============================================================================

/**
 * Resumo da collection com foco em regras e informações faltantes
 */
export interface CollectionSummary {
  /** Regras que afetam o cliente especificamente */
  rulesAffectingClient: string[]
  /** Informações que NÃO foram encontradas nos documentos */
  missingInformation: string[]
}

/**
 * Arquivo analisado dentro de uma collection
 */
export interface AnalyzedFile {
  fileId: string
  fileName: string
  fileDescription: string
  relevance: "high" | "medium" | "low" | "irrelevant"
}

/**
 * Resultado da análise de uma collection
 */
export interface CollectionAnalysisResult {
  /** ID da collection */
  collectionId: string
  /** Nome da collection */
  collectionName: string
  /** Descrição da collection */
  collectionDescription: string
  /** Planos identificados nesta collection */
  identifiedPlans: IdentifiedPlan[]
  /** Total de planos identificados */
  totalPlans: number
  /** Arquivos analisados */
  analyzedFiles: AnalyzedFile[]
  /** Resumo da collection com foco em regras */
  collectionSummary: CollectionSummary
  /** Análise geral considerando perfil do cliente */
  overallAnalysis: string
  /** Modelo usado para análise */
  modelUsed: string
  /** Timestamp da análise */
  timestamp: string
}

// =============================================================================
// Resultado Completo do Grading por Collection
// =============================================================================

/**
 * Estatísticas do grading por collection
 */
export interface GradeByCollectionStats {
  totalCollections: number
  totalPlansIdentified: number
  highRelevancePlans: number
  mediumRelevancePlans: number
  lowRelevancePlans: number
  irrelevantPlans: number
  executionTimeMs: number
}

/**
 * Resultado completo do grading por collection
 */
export interface GradeByCollectionResult {
  /** Análises por collection */
  collectionAnalyses: CollectionAnalysisResult[]
  /** Texto formatado consolidado para ragAnalysisContext */
  consolidatedAnalysisText: string
  /** Estatísticas */
  stats: GradeByCollectionStats
}

// =============================================================================
// Dados Agregados por Collection (Input interno)
// =============================================================================

/**
 * Arquivo agregado com chunks e análise anterior
 */
export interface AggregatedFile {
  fileId: string
  fileName: string
  fileDescription: string
  /** Chunks do arquivo (conteúdo) */
  chunks: string[]
  /** Total de tokens */
  totalTokens: number
  /** Relevância da análise anterior (gradeByFile) */
  relevance: "high" | "medium" | "low" | "irrelevant"
  /** Texto da análise anterior (gradeByFile) */
  previousAnalysisText: string
}

/**
 * Dados agregados de uma collection para análise
 */
export interface CollectionAggregatedData {
  collectionId: string
  collectionName: string
  collectionDescription: string
  collectionType: string
  /** Arquivos da collection com chunks e análises anteriores */
  files: AggregatedFile[]
  /** Total de tokens de todos os arquivos */
  totalTokens: number
}

// =============================================================================
// Response do LLM (JSON Schema)
// =============================================================================

/**
 * Schema da resposta esperada do GPT-5-mini
 */
export interface LLMCollectionAnalysisResponse {
  identifiedPlans: Array<{
    planName: string
    sourceFileNames: string[]
    planType?: "individual" | "familiar" | "empresarial"
    summary?: string
    importantRules?: string[]
    waitingPeriods?: string[]
    coparticipation?: string
    coverage?: string[]
    basePrice?: {
      value: number
      currency: "BRL"
      period: "mensal" | "anual"
      ageRange?: string
    }
    network?: string[]
    clientRelevance: "high" | "medium" | "low" | "irrelevant"
    relevanceJustification: string
  }>
  collectionSummary: {
    totalPlansIdentified: number
    rulesAffectingClient: string[]
    missingInformation: string[]
  }
  overallAnalysis: string
}
