/**
 * Tool: searchHealthPlans
 *
 * Busca inteligente em múltiplas collections de planos de saúde usando RAG
 * com aggregação e re-ranking global
 *
 * Referência: PRD RF-003 - Busca em múltiplas collections
 */

import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"
import type { PartialClientInfo } from "./schemas/client-info-schema"
import type {
  SearchHealthPlansParams,
  SearchHealthPlansResponse,
  HealthPlanSearchResult
} from "./types"

/**
 * Interface para resultado bruto da busca vetorial
 */
interface RawSearchResult {
  content: string
  similarity: number
  file_id: string
  metadata?: Record<string, any>
}

/**
 * Interface para collection com seus arquivos
 */
interface CollectionWithFiles {
  id: string
  name: string
  collection_type: string | null
  files: Array<{
    id: string
    name: string
    type: string
  }>
}

/**
 * Obtém collections de planos de saúde do assistente
 *
 * @param assistantId - ID do assistente
 * @param supabaseAdmin - Cliente Supabase admin
 * @returns Collections de planos de saúde com seus arquivos
 */
async function getHealthPlanCollections(
  assistantId: string,
  supabaseAdmin: ReturnType<typeof createClient<Database>>
): Promise<CollectionWithFiles[]> {
  console.log(
    `[searchHealthPlans] Buscando collections do assistente ${assistantId}`
  )

  // Buscar assistente com suas collections
  const { data: assistant, error: assistantError } = await supabaseAdmin
    .from("assistants")
    .select(
      `
      id,
      name,
      collections (
        id,
        name,
        collection_type,
        files (
          id,
          name,
          type
        )
      )
    `
    )
    .eq("id", assistantId)
    .single()

  if (assistantError || !assistant) {
    throw new Error(
      `Falha ao buscar assistente: ${assistantError?.message || "Assistente não encontrado"}`
    )
  }

  console.log(
    `[searchHealthPlans] Assistente encontrado: ${assistant.name} com ${assistant.collections?.length || 0} collections`
  )

  // Filtrar apenas collections de planos de saúde
  const healthPlanCollections = (assistant.collections || []).filter(
    (collection): collection is CollectionWithFiles =>
      collection.collection_type === "health_plan"
  )

  if (healthPlanCollections.length === 0) {
    console.log(
      "[searchHealthPlans] Nenhuma collection com collection_type='health_plan' encontrada"
    )
  }

  // Validar que cada collection tem arquivos
  const collectionsWithFiles = healthPlanCollections.filter(collection => {
    const hasFiles = collection.files && collection.files.length > 0
    if (!hasFiles) {
      console.log(
        `[searchHealthPlans] Collection ${collection.name} não possui arquivos, será ignorada`
      )
    }
    return hasFiles
  })

  console.log(
    `[searchHealthPlans] ${collectionsWithFiles.length} collections com arquivos e tipo 'health_plan'`
  )

  return collectionsWithFiles
}

/**
 * Tool principal para busca de planos de saúde
 *
 * @param params - Parâmetros incluindo assistantId, clientInfo e filtros
 * @param apiKey - OpenAI API key para geração de embeddings
 * @returns Resultados ranqueados de planos de saúde
 */
export async function searchHealthPlans(
  params: SearchHealthPlansParams,
  apiKey: string
): Promise<SearchHealthPlansResponse> {
  const startTime = Date.now()

  try {
    console.log("[searchHealthPlans] Iniciando busca de planos de saúde")
    console.log(
      `[searchHealthPlans] AssistantId: ${params.assistantId}, TopK: ${params.topK || 10}`
    )

    // 1. Configurar Supabase admin client
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 2. Obter collections do assistente
    const healthPlanCollections = await getHealthPlanCollections(
      params.assistantId,
      supabaseAdmin
    )

    if (healthPlanCollections.length === 0) {
      console.log(
        "[searchHealthPlans] Nenhuma collection de planos de saúde encontrada"
      )
      return {
        results: [],
        metadata: {
          totalCollectionsSearched: 0,
          query: "",
          executionTimeMs: Date.now() - startTime
        }
      }
    }

    console.log(
      `[searchHealthPlans] Encontradas ${healthPlanCollections.length} collections de planos de saúde`
    )

    // 3. Construir query de busca
    const searchQuery = buildSearchQuery(params.clientInfo)
    console.log(`[searchHealthPlans] Query construída: ${searchQuery}`)

    // 4. Configurar OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey
    })

    // 5. Gerar embedding da query
    const embedding = await generateEmbedding(searchQuery, openai)

    // 6. Executar busca em todas collections
    const topK = params.topK || 10
    const rawResults = await searchAcrossCollections(
      healthPlanCollections,
      embedding,
      topK,
      supabaseAdmin
    )

    console.log(
      `[searchHealthPlans] Total de resultados brutos: ${rawResults.length}`
    )

    // 7. Aplicar filtros (se fornecidos)
    const filteredResults = applyFilters(rawResults, params.filters)

    // 8. Re-ranking global
    const rankedResults = rankResults(filteredResults)

    const executionTimeMs = Date.now() - startTime

    console.log(
      `[searchHealthPlans] Busca concluída em ${executionTimeMs}ms com ${rankedResults.length} resultados`
    )

    return {
      results: rankedResults,
      metadata: {
        totalCollectionsSearched: healthPlanCollections.length,
        query: searchQuery,
        executionTimeMs,
        totalResultsBeforeFiltering: rawResults.length
      }
    }
  } catch (error) {
    console.error("[searchHealthPlans] Error:", error)

    throw new Error(
      `Falha ao buscar planos de saúde: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Constrói query otimizada a partir do perfil do cliente
 *
 * @param clientInfo - Informações estruturadas do cliente
 * @returns Query de busca otimizada
 */
function buildSearchQuery(clientInfo: PartialClientInfo): string {
  const queryParts: string[] = []

  // Adicionar informações básicas
  if (clientInfo.age) {
    queryParts.push(`Idade: ${clientInfo.age} anos`)
  }

  if (clientInfo.city && clientInfo.state) {
    queryParts.push(`Localização: ${clientInfo.city}, ${clientInfo.state}`)
  }

  if (clientInfo.budget) {
    queryParts.push(`Orçamento mensal: até R$ ${clientInfo.budget}`)
  }

  // Adicionar informações sobre dependentes
  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const dependentsSummary = clientInfo.dependents
      .map(d => `${d.relationship} (${d.age} anos)`)
      .join(", ")
    queryParts.push(`Dependentes: ${dependentsSummary}`)
  }

  // Adicionar condições pré-existentes
  if (
    clientInfo.preExistingConditions &&
    clientInfo.preExistingConditions.length > 0
  ) {
    queryParts.push(
      `Condições pré-existentes: ${clientInfo.preExistingConditions.join(", ")}`
    )
  }

  // Adicionar medicamentos
  if (clientInfo.medications && clientInfo.medications.length > 0) {
    queryParts.push(
      `Medicamentos de uso contínuo: ${clientInfo.medications.join(", ")}`
    )
  }

  // Adicionar preferências
  if (clientInfo.preferences) {
    if (clientInfo.preferences.networkType) {
      queryParts.push(
        `Preferência de rede: ${clientInfo.preferences.networkType === "broad" ? "ampla" : "restrita"}`
      )
    }

    if (clientInfo.preferences.coParticipation !== undefined) {
      queryParts.push(
        `Coparticipação: ${clientInfo.preferences.coParticipation ? "aceita" : "não aceita"}`
      )
    }

    if (
      clientInfo.preferences.specificHospitals &&
      clientInfo.preferences.specificHospitals.length > 0
    ) {
      queryParts.push(
        `Hospitais desejados: ${clientInfo.preferences.specificHospitals.join(", ")}`
      )
    }
  }

  return queryParts.join(". ")
}

/**
 * Gera embedding vetorial usando OpenAI
 *
 * @param text - Texto para gerar embedding
 * @param openai - Cliente OpenAI configurado
 * @returns Vetor de embedding
 */
async function generateEmbedding(
  text: string,
  openai: OpenAI
): Promise<number[]> {
  console.log("[searchHealthPlans] Gerando embedding para query")

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  })

  const embedding = response.data[0].embedding

  console.log(
    `[searchHealthPlans] Embedding gerado: ${embedding.length} dimensões`
  )

  return embedding
}

/**
 * Executa busca vetorial em múltiplas collections em paralelo
 *
 * @param collections - Collections para buscar
 * @param embedding - Vetor de embedding da query
 * @param topK - Número de resultados por collection
 * @param supabaseAdmin - Cliente Supabase admin
 * @returns Resultados agregados de todas collections
 */
async function searchAcrossCollections(
  collections: CollectionWithFiles[],
  embedding: number[],
  topK: number,
  supabaseAdmin: ReturnType<typeof createClient<Database>>
): Promise<
  Array<RawSearchResult & { collectionId: string; collectionName: string }>
> {
  console.log(
    `[searchHealthPlans] Buscando em ${collections.length} collections em paralelo`
  )

  // Executar buscas em paralelo
  const searchPromises = collections.map(async collection => {
    const fileIds = collection.files.map(f => f.id)

    if (fileIds.length === 0) {
      console.log(
        `[searchHealthPlans] Collection ${collection.name} não possui arquivos, pulando`
      )
      return []
    }

    console.log(
      `[searchHealthPlans] Buscando em collection ${collection.name} (${fileIds.length} arquivos)`
    )

    const { data, error } = await supabaseAdmin.rpc("match_file_items_openai", {
      query_embedding: embedding as any,
      match_count: topK,
      file_ids: fileIds
    })

    if (error) {
      console.error(
        `[searchHealthPlans] Erro ao buscar em collection ${collection.name}:`,
        error
      )
      return []
    }

    // Adicionar metadata da collection
    return (data || []).map(result => ({
      ...result,
      collectionId: collection.id,
      collectionName: collection.name
    }))
  })

  const results = await Promise.all(searchPromises)
  const flatResults = results.flat()

  console.log(
    `[searchHealthPlans] Total de resultados encontrados: ${flatResults.length}`
  )

  return flatResults
}

/**
 * Aplica filtros opcionais nos resultados
 *
 * @param results - Resultados brutos da busca
 * @param filters - Filtros a aplicar
 * @returns Resultados filtrados
 */
function applyFilters(
  results: Array<
    RawSearchResult & { collectionId: string; collectionName: string }
  >,
  filters?: SearchHealthPlansParams["filters"]
): Array<RawSearchResult & { collectionId: string; collectionName: string }> {
  if (!filters) {
    return results
  }

  let filtered = results
  const initialCount = results.length

  // Filtrar por região (estado/cidade)
  if (filters.region?.state) {
    const stateBefore = filtered.length
    filtered = filtered.filter(
      r =>
        r.metadata?.state?.toLowerCase() ===
        filters.region?.state?.toLowerCase()
    )
    console.log(
      `[searchHealthPlans] Filtro de estado removeu ${stateBefore - filtered.length} resultados`
    )
  }

  if (filters.region?.city) {
    const cityBefore = filtered.length
    filtered = filtered.filter(
      r =>
        r.metadata?.city?.toLowerCase() === filters.region?.city?.toLowerCase()
    )
    console.log(
      `[searchHealthPlans] Filtro de cidade removeu ${cityBefore - filtered.length} resultados`
    )
  }

  // Filtrar por operadora
  if (filters.operator) {
    const operatorBefore = filtered.length
    filtered = filtered.filter(
      r =>
        r.metadata?.operator?.toLowerCase() === filters.operator?.toLowerCase()
    )
    console.log(
      `[searchHealthPlans] Filtro de operadora removeu ${operatorBefore - filtered.length} resultados`
    )
  }

  // Filtrar por faixa de preço
  if (filters.priceRange) {
    const priceBefore = filtered.length

    if (filters.priceRange.min !== undefined) {
      filtered = filtered.filter(
        r =>
          r.metadata?.price === undefined ||
          r.metadata.price >= filters.priceRange!.min!
      )
    }

    if (filters.priceRange.max !== undefined) {
      filtered = filtered.filter(
        r =>
          r.metadata?.price === undefined ||
          r.metadata.price <= filters.priceRange!.max!
      )
    }

    console.log(
      `[searchHealthPlans] Filtro de preço removeu ${priceBefore - filtered.length} resultados`
    )
  }

  // Filtrar por tipo de plano
  if (filters.planType) {
    const planTypeBefore = filtered.length
    filtered = filtered.filter(
      r =>
        r.metadata?.planType?.toLowerCase() === filters.planType?.toLowerCase()
    )
    console.log(
      `[searchHealthPlans] Filtro de tipo de plano removeu ${planTypeBefore - filtered.length} resultados`
    )
  }

  console.log(
    `[searchHealthPlans] Filtros aplicados: ${initialCount} -> ${filtered.length} resultados`
  )

  return filtered
}

/**
 * Rankeia e ordena resultados globalmente com re-ranking avançado
 *
 * @param results - Resultados filtrados da busca
 * @returns Resultados ranqueados e ordenados (top 50)
 */
function rankResults(
  results: Array<
    RawSearchResult & { collectionId: string; collectionName: string }
  >
): HealthPlanSearchResult[] {
  console.log(`[searchHealthPlans] Ranqueando ${results.length} resultados`)

  if (results.length === 0) {
    return []
  }

  // 1. Normalizar scores de similaridade entre 0-1
  const maxSimilarity = Math.max(...results.map(r => r.similarity))
  const minSimilarity = Math.min(...results.map(r => r.similarity))
  const range = maxSimilarity - minSimilarity || 1

  // 2. Calcular scores ajustados com peso da collection e diversidade
  const operatorCounts = new Map<string, number>()
  const collectionCounts = new Map<string, number>()

  const scoredResults = results.map(result => {
    // Normalizar similaridade
    const normalizedSimilarity = (result.similarity - minSimilarity) / range

    // Peso da collection (planos específicos têm peso maior)
    const collectionWeight = result.collectionName
      .toLowerCase()
      .includes("específico")
      ? 1.1
      : 1.0

    // Boost para diversidade de operadoras
    const operator = result.metadata?.operator?.toLowerCase() || "unknown"
    const operatorCount = operatorCounts.get(operator) || 0
    operatorCounts.set(operator, operatorCount + 1)
    const diversityBoost =
      operatorCount === 0 ? 1.05 : 1.0 / (1 + operatorCount * 0.1)

    // Boost para diversidade de collections
    const collectionId = result.collectionId
    const collectionCount = collectionCounts.get(collectionId) || 0
    collectionCounts.set(collectionId, collectionCount + 1)
    const collectionDiversityBoost =
      collectionCount === 0 ? 1.03 : 1.0 / (1 + collectionCount * 0.05)

    // Score final combinado
    const finalScore =
      normalizedSimilarity *
      collectionWeight *
      diversityBoost *
      collectionDiversityBoost

    return {
      content: result.content,
      similarity: result.similarity, // Manter similarity original
      collectionId: result.collectionId,
      collectionName: result.collectionName,
      fileId: result.file_id,
      metadata: result.metadata,
      _rankingScore: finalScore // Score interno para ordenação
    }
  })

  // 3. Ordenar por score final e pegar top 50
  const rankedResults = scoredResults
    .sort((a, b) => b._rankingScore - a._rankingScore)
    .slice(0, 50) // Limitar a top 50 resultados
    .map(({ _rankingScore, ...result }) => result) // Remover score interno

  console.log(
    `[searchHealthPlans] Re-ranking completo: ${rankedResults.length} resultados ordenados (top 50)`
  )

  // Log de diversidade
  const uniqueOperators = new Set(
    rankedResults.map(r => r.metadata?.operator).filter(Boolean)
  )
  const uniqueCollections = new Set(rankedResults.map(r => r.collectionId))

  console.log(
    `[searchHealthPlans] Diversidade: ${uniqueOperators.size} operadoras, ${uniqueCollections.size} collections`
  )

  return rankedResults
}

/**
 * Cria schema de function calling para registro da tool no OpenAI
 *
 * Este schema é usado quando a tool é registrada como uma função
 * que o GPT pode chamar durante a conversa
 */
export const searchHealthPlansFunctionSchema: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: "searchHealthPlans",
      description:
        "Busca planos de saúde em múltiplas collections usando RAG. Use após coletar informações do cliente com extractClientInfo.",
      parameters: {
        type: "object",
        properties: {
          assistantId: {
            type: "string",
            description: "ID do assistente health-plan"
          },
          clientInfo: {
            type: "object",
            description: "Informações estruturadas do cliente",
            properties: {
              age: {
                type: "number",
                description: "Idade do titular"
              },
              city: {
                type: "string",
                description: "Cidade"
              },
              state: {
                type: "string",
                description: "Estado (sigla)"
              },
              budget: {
                type: "number",
                description: "Orçamento mensal"
              }
            }
          },
          topK: {
            type: "number",
            description: "Número de resultados por collection (default: 10)"
          },
          filters: {
            type: "object",
            description: "Filtros opcionais",
            properties: {
              region: {
                type: "object",
                properties: {
                  state: { type: "string" },
                  city: { type: "string" }
                }
              },
              operator: {
                type: "string",
                description: "Nome da operadora"
              },
              priceRange: {
                type: "object",
                properties: {
                  min: { type: "number" },
                  max: { type: "number" }
                }
              },
              planType: {
                type: "string",
                description: "Tipo de plano (individual, empresarial, etc)"
              }
            }
          }
        },
        required: ["assistantId", "clientInfo"]
      }
    }
  }
