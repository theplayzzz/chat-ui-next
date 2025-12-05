# Análise de Viabilidade: Agentic RAG & Corrective RAG para Health Plan Agent

**Versão:** 1.0
**Data:** 2025-12-04
**Autor:** Claude Code
**Status:** Análise Técnica

---

## 1. Resumo Executivo

Este documento analisa a viabilidade de implementar padrões avançados de RAG (Agentic RAG, Corrective RAG, Multi-Query RAG) no Health Plan Agent v2, com base na estrutura atual do projeto e nas melhores práticas da comunidade LangChain/LangGraph.

### Conclusão Principal

**VIABILIDADE: ALTA** - A implementação é viável e recomendada. A estrutura atual fornece ~70% da infraestrutura necessária. Os 30% restantes envolvem:
- Refatoração do pipeline de busca (de flat para hierárquico)
- Implementação de novos nós no grafo LangGraph
- Enriquecimento do `plan_metadata` nos documentos

### Esforço Estimado

| Componente | Esforço | Prioridade |
|------------|---------|------------|
| Multi-Query RAG | 3-4 dias | Alta |
| Document Grading | 2-3 dias | Alta |
| Corrective RAG (Query Rewriting) | 2 dias | Média |
| Hierarquia de Documentos | 2-3 dias | Alta |
| LangSmith Evaluation | 2-3 dias | Média |
| **Total** | **11-15 dias** | - |

---

## 2. Padrões Identificados na Pesquisa

### 2.1 Agentic RAG

**Fonte:** [LangChain Docs - Agentic RAG](https://docs.langchain.com/oss/javascript/langgraph/agentic-rag)

**Conceito:** RAG onde um agente LLM decide dinamicamente:
- SE precisa fazer retrieval (ou pode responder diretamente)
- QUAL fonte de dados usar (vector store, web search, banco SQL)
- QUANDO fazer retrieval adicional

**Estrutura do Grafo:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENTIC RAG GRAPH                           │
│                                                                     │
│   START                                                             │
│     │                                                               │
│     ▼                                                               │
│   ┌─────────────────────────┐                                       │
│   │ generateQueryOrRespond  │  ← LLM decide: responder ou buscar?   │
│   │ (GPT-4o com tools)      │                                       │
│   └───────────┬─────────────┘                                       │
│               │                                                     │
│       ┌───────┴───────┐                                             │
│       │               │                                             │
│       ▼               ▼                                             │
│   ┌───────┐     ┌─────────────┐                                     │
│   │  END  │     │  retrieve   │  ← Executa busca vetorial           │
│   └───────┘     └──────┬──────┘                                     │
│                        │                                            │
│                        ▼                                            │
│                  ┌─────────────┐                                    │
│                  │gradeDocuments│  ← LLM avalia relevância          │
│                  └──────┬──────┘                                    │
│                         │                                           │
│                 ┌───────┴───────┐                                   │
│                 │               │                                   │
│                 ▼               ▼                                   │
│           ┌──────────┐   ┌─────────────┐                            │
│           │ generate │   │   rewrite   │  ← Reformula query         │
│           └────┬─────┘   └──────┬──────┘                            │
│                │                │                                   │
│                ▼                └────────► (volta para retrieve)    │
│              END                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Aplicação no Health Plan Agent:**
- Nó `generateQueryOrRespond` decide se precisa buscar planos ou pode responder direto
- Nó `gradeDocuments` avalia se os planos retornados são relevantes ao perfil
- Nó `rewrite` reformula a busca se documentos forem fracos

---

### 2.2 Corrective RAG (CRAG)

**Fonte:** [LangGraph CRAG Tutorial](https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_crag/)

**Conceito:** RAG com auto-correção que:
1. Avalia qualidade dos documentos recuperados
2. Se qualidade baixa → reformula query e tenta novamente
3. Se ainda baixa → usa fallback (web search)

**Estrutura do Grafo:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                      CORRECTIVE RAG GRAPH                           │
│                                                                     │
│   START                                                             │
│     │                                                               │
│     ▼                                                               │
│   ┌─────────────┐                                                   │
│   │  retrieve   │  ← Busca inicial no vector store                  │
│   └──────┬──────┘                                                   │
│          │                                                          │
│          ▼                                                          │
│   ┌─────────────────┐                                               │
│   │ grade_documents │  ← Avalia: "sim" ou "não" para cada doc       │
│   └────────┬────────┘                                               │
│            │                                                        │
│     ┌──────┴──────┐                                                 │
│     │             │                                                 │
│     ▼             ▼                                                 │
│ Relevantes?   Irrelevantes?                                         │
│     │             │                                                 │
│     ▼             ▼                                                 │
│ ┌────────┐  ┌───────────────┐                                       │
│ │generate│  │transform_query│  ← Reescreve para melhorar            │
│ └────┬───┘  └───────┬───────┘                                       │
│      │              │                                               │
│      ▼              ▼                                               │
│    END        ┌───────────┐                                         │
│               │web_search │  ← Fallback com Tavily/Google           │
│               └─────┬─────┘                                         │
│                     │                                               │
│                     ▼                                               │
│                 ┌────────┐                                          │
│                 │generate│                                          │
│                 └────┬───┘                                          │
│                      │                                              │
│                      ▼                                              │
│                    END                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Aplicação no Health Plan Agent:**
- Grade de documentos: verificar se planos retornados atendem ao perfil (idade, região, orçamento)
- Transform query: se não encontrar planos, reformular com foco diferente
- Fallback: buscar em web (sites de operadoras) se vector store insuficiente

---

### 2.3 Multi-Query RAG

**Fonte:** [LangChain Query Transformations](https://blog.langchain.com/query-transformations/)

**Conceito:** Gerar múltiplas queries a partir de uma pergunta para melhorar recall:
1. **Multi-Query Rewriting**: Gerar N variantes da mesma pergunta
2. **Query Decomposition**: Quebrar pergunta complexa em sub-perguntas
3. **RAG-Fusion**: Unir resultados com Reciprocal Rank Fusion (RRF)

**Exemplo para Health Plan Agent:**

```
Pergunta Original:
"Preciso de um plano para mim (45 anos), minha esposa (42) e dois filhos (10 e 8),
moramos em SP, orçamento de R$1500, tenho diabetes"

Queries Geradas:
1. "Planos de saúde familiar São Paulo 4 pessoas orçamento até R$1500"
2. "Cobertura diabetes planos de saúde condição pré-existente carência"
3. "Planos com pediatria crianças 8 10 anos São Paulo"
4. "Planos casais 40-49 anos São Paulo familiar"

Fusão: RRF combina resultados das 4 queries, priorizando documentos
       que aparecem bem ranqueados em múltiplas buscas
```

---

### 2.4 LangSmith RAG Evaluation

**Fonte:** [LangSmith Evaluate RAG Tutorial](https://docs.langchain.com/langsmith/evaluate-rag-tutorial)

**Métricas Principais:**

| Métrica | O que Avalia | Como Implementar |
|---------|--------------|------------------|
| **Correctness** | Resposta vs Resposta Esperada | LLM-as-judge com referências |
| **Relevance** | Resposta vs Pergunta | LLM-as-judge sem referência |
| **Groundedness** | Resposta vs Documentos | Detecta alucinações |
| **Retrieval Relevance** | Documentos vs Pergunta | Qualidade do retrieval |
| **Faithfulness** | Fração de claims verificáveis | RAGAS metric |

**Implementação com LangSmith:**
```typescript
// Configurar tracing
process.env.LANGCHAIN_TRACING_V2 = "true"
process.env.LANGCHAIN_API_KEY = "lsv2_..."
process.env.LANGCHAIN_PROJECT = "health-plan-rag-eval"

// Criar avaliadores
const evaluators = [
  { name: "correctness", runOn: "all" },
  { name: "relevance", runOn: "all" },
  { name: "groundedness", runOn: "rag" },
  { name: "retrieval_relevance", runOn: "retrieval" }
]

// Executar avaliação
await client.evaluate(targetFunction, {
  data: "health-plan-test-cases",
  evaluators,
  experimentPrefix: "rag-v2"
})
```

---

## 3. Análise da Estrutura Atual

### 3.1 O Que Já Existe (Aproveitável)

| Componente | Status | Arquivo | Aproveitamento |
|------------|--------|---------|----------------|
| Vector Store (pgvector) | ✅ Ativo | `migrations/20240108234545_add_file_items.sql` | 100% |
| Embeddings OpenAI | ✅ Ativo | `lib/embeddings/generate-embeddings.ts` | 100% |
| Busca Multi-Collection | ✅ Ativo | `lib/tools/health-plan/search-health-plans.ts` | 80% |
| Re-ranking Básico | ✅ Ativo | `search-health-plans.ts:549-639` | 70% |
| Índices HNSW | ✅ Ativo | `match_file_items_openai` RPC | 100% |
| LangSmith Tracing | ✅ Ativo | `lib/monitoring/langsmith-setup.ts` | 100% |
| LangGraph Workflow | ✅ Ativo | `lib/agents/health-plan-v2/` | 100% |
| Checkpointer PostgreSQL | ✅ Ativo | `checkpointer/postgres-checkpointer.ts` | 100% |
| Schema `plan_metadata` | ✅ Existe | `file_items.plan_metadata JSONB` | 0% (vazio) |
| Schema `collection_type` | ✅ Existe | `collections.collection_type` | 30% (parcial) |

### 3.2 O Que Precisa Ser Refatorado

#### 3.2.1 Pipeline de Busca (search-health-plans.ts)

**Problema Atual:**
```typescript
// Busca FLAT - todas collections em paralelo, sem ordem
const searchPromises = collections.map(async collection => {
  return await supabaseAdmin.rpc("match_file_items_openai", {...})
})
const results = await Promise.all(searchPromises)  // Tudo junto
```

**Refatoração Necessária:**
```typescript
// Busca HIERÁRQUICA - geral primeiro, depois específico
async function hierarchicalSearch(query: string, clientInfo: ClientInfo) {
  // 1. Buscar documentos GERAIS primeiro
  const generalDocs = await searchByDocumentType("general", query, topK: 5)

  // 2. Identificar planos relevantes nos docs gerais
  const relevantPlans = extractPlanCodes(generalDocs)

  // 3. Buscar documentos ESPECÍFICOS dos planos identificados
  const specificDocs = await searchByPlanCodes(relevantPlans, query, topK: 10)

  // 4. Combinar com peso
  return combineResults(generalDocs, specificDocs, weights: [0.3, 0.7])
}
```

**Arquivos Afetados:**
- `lib/tools/health-plan/search-health-plans.ts` (refatorar ~200 linhas)

#### 3.2.2 Construção de Query (buildSearchQuery)

**Problema Atual:**
```typescript
// Query ÚNICA concatenada
function buildSearchQuery(clientInfo: PartialClientInfo): string {
  const queryParts: string[] = []
  if (clientInfo.age) queryParts.push(`Idade: ${clientInfo.age} anos`)
  if (clientInfo.dependents) queryParts.push(`Dependentes: ...`)
  return queryParts.join(". ")  // Uma query gigante
}
```

**Refatoração Necessária:**
```typescript
// Multi-Query Generation
async function generateMultipleQueries(clientInfo: ClientInfo): Promise<string[]> {
  const queries: string[] = []

  // Query base (sempre)
  queries.push(buildBaseQuery(clientInfo))

  // Query de dependentes (se houver)
  if (clientInfo.dependents?.length > 0) {
    queries.push(buildDependentsQuery(clientInfo.dependents))
  }

  // Query de condições (se houver)
  if (clientInfo.preExistingConditions?.length > 0) {
    queries.push(buildConditionsQuery(clientInfo.preExistingConditions))
  }

  // Query de preferências (se houver)
  if (clientInfo.preferences) {
    queries.push(buildPreferencesQuery(clientInfo.preferences))
  }

  return queries
}
```

**Arquivos Afetados:**
- `lib/tools/health-plan/search-health-plans.ts` (nova função ~100 linhas)
- Novo arquivo: `lib/tools/health-plan/query-generator.ts` (~150 linhas)

#### 3.2.3 Fusão de Resultados

**Problema Atual:**
```typescript
// Re-ranking simples por similaridade
const finalScore = normalizedSimilarity * collectionWeight * diversityBoost
```

**Refatoração Necessária:**
```typescript
// Reciprocal Rank Fusion (RRF)
function reciprocalRankFusion(
  resultSets: SearchResult[][],
  k: number = 60  // Constante de suavização
): SearchResult[] {
  const scores = new Map<string, number>()

  for (const resultSet of resultSets) {
    for (let rank = 0; rank < resultSet.length; rank++) {
      const docId = resultSet[rank].id
      const rrfScore = 1 / (k + rank + 1)
      scores.set(docId, (scores.get(docId) || 0) + rrfScore)
    }
  }

  // Ordenar por score RRF agregado
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, rrfScore: score }))
}
```

**Arquivos Afetados:**
- Novo arquivo: `lib/tools/health-plan/result-fusion.ts` (~100 linhas)

### 3.3 O Que Precisa Ser Implementado do Zero

#### 3.3.1 Nó de Document Grading

**Novo arquivo:** `lib/agents/health-plan-v2/nodes/capabilities/grade-documents.ts`

```typescript
import { z } from "zod"
import { ChatOpenAI } from "@langchain/openai"
import { HealthPlanState } from "../../state/state-annotation"

// Schema de avaliação
const GradeSchema = z.object({
  score: z.enum(["relevant", "partially_relevant", "irrelevant"]),
  reason: z.string(),
  missingInfo: z.array(z.string()).optional()
})

// Prompt de avaliação
const GRADE_PROMPT = `Você é um avaliador de documentos de planos de saúde.

Perfil do Cliente:
{clientInfo}

Documento a Avaliar:
{document}

Avalie se este documento é RELEVANTE para recomendar um plano para este cliente.
Considere: idade, região, orçamento, dependentes, condições pré-existentes.

Responda em JSON com:
- score: "relevant", "partially_relevant" ou "irrelevant"
- reason: explicação breve
- missingInfo: informações que faltam no documento (se houver)`

export async function gradeDocuments(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 })
  const structuredLlm = llm.withStructuredOutput(GradeSchema)

  const gradedDocs = await Promise.all(
    state.searchResults.map(async (doc) => {
      const grade = await structuredLlm.invoke(
        GRADE_PROMPT
          .replace("{clientInfo}", JSON.stringify(state.clientInfo))
          .replace("{document}", doc.content)
      )
      return { ...doc, grade }
    })
  )

  // Filtrar apenas relevantes
  const relevantDocs = gradedDocs.filter(
    d => d.grade.score !== "irrelevant"
  )

  // Decidir se precisa reescrever query
  const needsRewrite = relevantDocs.length < 3

  return {
    searchResults: relevantDocs,
    needsQueryRewrite: needsRewrite
  }
}
```

**Esforço:** ~150 linhas, 2-3 dias

#### 3.3.2 Nó de Query Rewriting

**Novo arquivo:** `lib/agents/health-plan-v2/nodes/capabilities/rewrite-query.ts`

```typescript
import { ChatOpenAI } from "@langchain/openai"
import { HealthPlanState } from "../../state/state-annotation"

const REWRITE_PROMPT = `Você é um especialista em busca de planos de saúde.

A busca anterior retornou poucos resultados relevantes.

Query Original: {originalQuery}
Resultados Encontrados: {resultCount}
Problema Identificado: {problem}

Reescreva a query para melhorar os resultados.
Foque em termos mais genéricos ou mais específicos, dependendo do problema.

Nova Query:`

export async function rewriteQuery(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Limite de tentativas
  if (state.queryRewriteCount >= 2) {
    return {
      shouldFallback: true,
      fallbackReason: "Limite de tentativas de reescrita atingido"
    }
  }

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 })

  const newQuery = await llm.invoke(
    REWRITE_PROMPT
      .replace("{originalQuery}", state.lastQuery)
      .replace("{resultCount}", state.searchResults.length.toString())
      .replace("{problem}", identifyProblem(state))
  )

  return {
    lastQuery: newQuery.content as string,
    queryRewriteCount: state.queryRewriteCount + 1
  }
}

function identifyProblem(state: HealthPlanState): string {
  if (state.searchResults.length === 0) {
    return "Nenhum documento encontrado"
  }
  const avgSimilarity = state.searchResults.reduce(
    (acc, d) => acc + d.similarity, 0
  ) / state.searchResults.length

  if (avgSimilarity < 0.5) {
    return "Documentos com baixa similaridade"
  }
  return "Documentos não cobrem todos os critérios do cliente"
}
```

**Esforço:** ~100 linhas, 1-2 dias

#### 3.3.3 Nó de Multi-Query Generation

**Novo arquivo:** `lib/agents/health-plan-v2/nodes/capabilities/generate-queries.ts`

```typescript
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import { PartialClientInfo } from "@/lib/tools/health-plan/schemas/client-info-schema"

const QueriesSchema = z.object({
  queries: z.array(z.object({
    query: z.string(),
    focus: z.enum(["general", "dependents", "conditions", "price", "coverage"]),
    priority: z.number().min(1).max(5)
  }))
})

const MULTI_QUERY_PROMPT = `Você é um especialista em busca de planos de saúde.

Gere múltiplas queries de busca para encontrar os melhores planos para este cliente.

Perfil do Cliente:
- Idade: {age} anos
- Localização: {city}, {state}
- Orçamento: R$ {budget}/mês
- Dependentes: {dependents}
- Condições Pré-existentes: {conditions}
- Preferências: {preferences}

Gere 3-5 queries diferentes, cada uma focando em um aspecto:
1. Query geral (perfil básico)
2. Query de dependentes (se houver)
3. Query de condições médicas (se houver)
4. Query de preço/orçamento
5. Query de cobertura específica (se houver preferências)

Responda em JSON com array de queries.`

export async function generateQueries(
  clientInfo: PartialClientInfo
): Promise<Array<{ query: string; focus: string; priority: number }>> {
  const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0.2 })
  const structuredLlm = llm.withStructuredOutput(QueriesSchema)

  const prompt = MULTI_QUERY_PROMPT
    .replace("{age}", clientInfo.age?.toString() || "não informada")
    .replace("{city}", clientInfo.city || "não informada")
    .replace("{state}", clientInfo.state || "não informado")
    .replace("{budget}", clientInfo.budget?.toString() || "não informado")
    .replace("{dependents}", formatDependents(clientInfo.dependents))
    .replace("{conditions}", clientInfo.preExistingConditions?.join(", ") || "nenhuma")
    .replace("{preferences}", formatPreferences(clientInfo.preferences))

  const result = await structuredLlm.invoke(prompt)

  return result.queries.sort((a, b) => b.priority - a.priority)
}

function formatDependents(dependents?: Array<{ age: number; relationship: string }>): string {
  if (!dependents?.length) return "nenhum"
  return dependents.map(d => `${d.relationship} (${d.age} anos)`).join(", ")
}

function formatPreferences(preferences?: any): string {
  if (!preferences) return "nenhuma"
  const parts = []
  if (preferences.networkType) parts.push(`Rede: ${preferences.networkType}`)
  if (preferences.coParticipation !== undefined) {
    parts.push(`Coparticipação: ${preferences.coParticipation ? "sim" : "não"}`)
  }
  if (preferences.specificHospitals?.length) {
    parts.push(`Hospitais: ${preferences.specificHospitals.join(", ")}`)
  }
  return parts.join("; ") || "nenhuma"
}
```

**Esforço:** ~120 linhas, 1-2 dias

#### 3.3.4 Integração LangSmith Evaluation

**Novo arquivo:** `lib/monitoring/rag-evaluation.ts`

```typescript
import { Client } from "langsmith"
import { evaluate } from "langsmith/evaluation"

// Avaliador de Relevância
const relevanceEvaluator = {
  name: "relevance",
  evaluatorType: "llm",
  prompt: `Avalie se a resposta é relevante para a pergunta.
Pergunta: {input}
Resposta: {output}
Retorne "relevant" ou "not_relevant" com explicação.`
}

// Avaliador de Groundedness
const groundednessEvaluator = {
  name: "groundedness",
  evaluatorType: "llm",
  prompt: `Avalie se a resposta está fundamentada nos documentos recuperados.
Documentos: {context}
Resposta: {output}
Retorne score de 0 a 1 indicando grau de fundamentação.`
}

// Avaliador de Retrieval
const retrievalEvaluator = {
  name: "retrieval_quality",
  evaluatorType: "llm",
  prompt: `Avalie a qualidade dos documentos recuperados para a pergunta.
Pergunta: {input}
Documentos: {retrieved_docs}
Retorne score de 0 a 1 e liste documentos irrelevantes.`
}

export async function evaluateRAGPipeline(
  datasetName: string,
  experimentName: string
) {
  const client = new Client()

  const results = await evaluate(
    (input) => runRAGPipeline(input),
    {
      data: datasetName,
      evaluators: [
        relevanceEvaluator,
        groundednessEvaluator,
        retrievalEvaluator
      ],
      experimentPrefix: experimentName,
      metadata: {
        version: "v2",
        date: new Date().toISOString()
      }
    }
  )

  return results
}

// Dataset de teste para Health Plan
export const healthPlanTestCases = [
  {
    input: "Tenho 35 anos, moro em SP, orçamento de R$500",
    expected: "Planos individuais básicos em São Paulo",
    tags: ["individual", "basico", "sp"]
  },
  {
    input: "Família com 4 pessoas, preciso cobrir diabetes",
    expected: "Planos familiares com cobertura para diabetes",
    tags: ["familiar", "condicao_preexistente"]
  },
  {
    input: "Quero plano que cubra o Hospital Sírio-Libanês",
    expected: "Planos com rede ampla incluindo hospitais premium",
    tags: ["rede_ampla", "hospital_especifico"]
  }
]
```

**Esforço:** ~150 linhas, 2-3 dias

---

## 4. Migração de Dados: plan_metadata

### 4.1 Estado Atual

```sql
SELECT
  COUNT(*) as total_chunks,
  COUNT(plan_metadata) as with_metadata
FROM file_items;

-- Resultado: 102 chunks, 0 com metadata
```

### 4.2 Schema Proposto

```typescript
interface PlanMetadata {
  // Classificação do documento
  documentType: "general" | "operator" | "product" | "clause" | "faq"

  // Identificação do plano (se específico)
  planCode?: string          // "AMIL-500-QC"
  planName?: string          // "Amil 500 QC Nacional"
  operator?: string          // "Amil"

  // Cobertura geográfica
  region?: {
    states: string[]         // ["SP", "RJ", "MG"]
    cities?: string[]        // ["São Paulo", "Campinas"]
    isNational: boolean
  }

  // Faixa de preço
  priceRange?: {
    min: number
    max: number
    currency: "BRL"
  }

  // Público-alvo
  targetAudience?: {
    ageRange?: { min: number; max: number }
    planType: "individual" | "familiar" | "empresarial" | "adesao"
    hasCoparticipation: boolean
  }

  // Tags para busca
  tags: string[]             // ["diabetes", "carencia", "parto"]

  // Versionamento
  version: string            // "2025.01"
  lastUpdated: string        // ISO date
}
```

### 4.3 Script de Migração

```sql
-- 1. Identificar documentos gerais por nome
UPDATE file_items fi
SET plan_metadata = jsonb_build_object(
  'documentType', 'general',
  'tags', ARRAY['regras', 'ans', 'geral'],
  'version', '2025.01',
  'lastUpdated', NOW()
)
FROM files f
WHERE fi.file_id = f.id
  AND (
    f.name ILIKE '%geral%' OR
    f.name ILIKE '%regras%' OR
    f.name ILIKE '%ans%'
  );

-- 2. Identificar documentos de operadoras
UPDATE file_items fi
SET plan_metadata = jsonb_build_object(
  'documentType', 'operator',
  'operator', CASE
    WHEN f.name ILIKE '%amil%' THEN 'Amil'
    WHEN f.name ILIKE '%bradesco%' THEN 'Bradesco Saúde'
    WHEN f.name ILIKE '%unimed%' THEN 'Unimed'
    WHEN f.name ILIKE '%sulamerica%' THEN 'SulAmérica'
    ELSE 'Outros'
  END,
  'tags', ARRAY[]::text[],
  'version', '2025.01',
  'lastUpdated', NOW()
)
FROM files f
WHERE fi.file_id = f.id
  AND fi.plan_metadata IS NULL;

-- 3. Criar índice para buscas por metadata
CREATE INDEX idx_file_items_doc_type
ON file_items ((plan_metadata->>'documentType'));

CREATE INDEX idx_file_items_operator
ON file_items ((plan_metadata->>'operator'));

CREATE INDEX idx_file_items_tags
ON file_items USING GIN ((plan_metadata->'tags'));
```

**Esforço:** 1 dia (script + validação)

---

## 5. Novo Grafo searchPlans (Proposta)

### 5.1 Estrutura Completa

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SEARCH PLANS - AGENTIC/CORRECTIVE RAG                     │
│                                                                              │
│   ┌─────────────────┐                                                        │
│   │    START        │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────────┐                                                    │
│   │  generateQueries    │  ← Gera 3-5 queries baseadas no clientInfo         │
│   │  (Multi-Query)      │                                                    │
│   └────────┬────────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────────┐                                                    │
│   │  retrieveGeneral    │  ← Busca em docs "general" primeiro                │
│   │  (Hierárquico)      │                                                    │
│   └────────┬────────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────────┐                                                    │
│   │  retrieveSpecific   │  ← Busca em docs específicos dos planos            │
│   │  (Baseado em geral) │     identificados no passo anterior                │
│   └────────┬────────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────────┐                                                    │
│   │  fusionResults      │  ← Combina com Reciprocal Rank Fusion              │
│   │  (RRF)              │                                                    │
│   └────────┬────────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────────┐                                                    │
│   │  gradeDocuments     │  ← LLM avalia relevância de cada doc               │
│   │  (LLM-as-judge)     │                                                    │
│   └────────┬────────────┘                                                    │
│            │                                                                 │
│     ┌──────┴──────┐                                                          │
│     │             │                                                          │
│     ▼             ▼                                                          │
│ Relevantes?   Poucos?                                                        │
│ (>= 3 docs)   (< 3 docs)                                                     │
│     │             │                                                          │
│     │             ▼                                                          │
│     │      ┌─────────────────┐                                               │
│     │      │  rewriteQuery   │  ← Reformula query                            │
│     │      │  (max 2x)       │                                               │
│     │      └────────┬────────┘                                               │
│     │               │                                                        │
│     │        ┌──────┴──────┐                                                 │
│     │        │             │                                                 │
│     │        ▼             ▼                                                 │
│     │    Retry?       Fallback?                                              │
│     │    (count < 2)  (count >= 2)                                           │
│     │        │             │                                                 │
│     │        │             ▼                                                 │
│     │        │      ┌─────────────────┐                                      │
│     │        │      │  webSearch      │  ← Tavily/Google (opcional)          │
│     │        │      │  (Fallback)     │                                      │
│     │        │      └────────┬────────┘                                      │
│     │        │               │                                               │
│     │        └───────┬───────┘                                               │
│     │                │                                                       │
│     │                ▼                                                       │
│     │         (volta para retrieve)                                          │
│     │                                                                        │
│     ▼                                                                        │
│   ┌─────────────────────┐                                                    │
│   │  formatResults      │  ← Prepara output para próximo step                │
│   │                     │                                                    │
│   └────────┬────────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │      END        │  → Retorna searchResults para state                    │
│   └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Implementação do Grafo

**Novo arquivo:** `lib/agents/health-plan-v2/graphs/search-plans-graph.ts`

```typescript
import { StateGraph, Annotation, END } from "@langchain/langgraph"
import { generateQueries } from "../nodes/capabilities/generate-queries"
import { gradeDocuments } from "../nodes/capabilities/grade-documents"
import { rewriteQuery } from "../nodes/capabilities/rewrite-query"

// Estado do sub-grafo de busca
const SearchState = Annotation.Root({
  clientInfo: Annotation<PartialClientInfo>,
  queries: Annotation<string[]>({ default: () => [] }),
  generalResults: Annotation<SearchResult[]>({ default: () => [] }),
  specificResults: Annotation<SearchResult[]>({ default: () => [] }),
  fusedResults: Annotation<SearchResult[]>({ default: () => [] }),
  gradedResults: Annotation<GradedResult[]>({ default: () => [] }),
  queryRewriteCount: Annotation<number>({ default: () => 0 }),
  needsRewrite: Annotation<boolean>({ default: () => false }),
  shouldFallback: Annotation<boolean>({ default: () => false })
})

// Construir o grafo
const searchGraph = new StateGraph(SearchState)
  .addNode("generateQueries", generateQueriesNode)
  .addNode("retrieveGeneral", retrieveGeneralNode)
  .addNode("retrieveSpecific", retrieveSpecificNode)
  .addNode("fusionResults", fusionResultsNode)
  .addNode("gradeDocuments", gradeDocumentsNode)
  .addNode("rewriteQuery", rewriteQueryNode)
  .addNode("formatResults", formatResultsNode)

  // Edges
  .addEdge("__start__", "generateQueries")
  .addEdge("generateQueries", "retrieveGeneral")
  .addEdge("retrieveGeneral", "retrieveSpecific")
  .addEdge("retrieveSpecific", "fusionResults")
  .addEdge("fusionResults", "gradeDocuments")

  // Conditional edges após grading
  .addConditionalEdges("gradeDocuments", (state) => {
    if (state.gradedResults.length >= 3) return "formatResults"
    if (state.queryRewriteCount >= 2) return "formatResults"  // Aceitar o que tem
    return "rewriteQuery"
  })

  .addConditionalEdges("rewriteQuery", (state) => {
    if (state.shouldFallback) return "formatResults"
    return "retrieveGeneral"  // Tentar novamente
  })

  .addEdge("formatResults", END)

export const compiledSearchGraph = searchGraph.compile()
```

**Esforço:** ~300 linhas, 3-4 dias

---

## 6. Integração com LangSmith

### 6.1 Traces Esperados

```
health-plan-agent-v2
├── orchestrator
│   └── intent-classifier
├── searchPlans (sub-graph)
│   ├── generateQueries
│   │   └── gpt-4o (structured output)
│   ├── retrieveGeneral
│   │   └── match_file_items_openai (RPC)
│   ├── retrieveSpecific
│   │   └── match_file_items_openai (RPC)
│   ├── fusionResults
│   │   └── reciprocal_rank_fusion
│   ├── gradeDocuments
│   │   └── gpt-4o-mini (batch grading)
│   ├── rewriteQuery (se necessário)
│   │   └── gpt-4o-mini
│   └── formatResults
├── analyzeCompatibility
└── generateRecommendation
```

### 6.2 Métricas a Monitorar

| Métrica | Target | Como Medir |
|---------|--------|------------|
| Retrieval Latency | < 3s | Span duration de `retrieve*` |
| Grading Latency | < 2s | Span duration de `gradeDocuments` |
| Query Rewrites | < 0.3/request | Count de `rewriteQuery` spans |
| Docs Relevantes | > 5/request | Output de `gradeDocuments` |
| Fallback Rate | < 5% | Count de `shouldFallback: true` |
| RRF Score Médio | > 0.1 | Média de `rrfScore` nos resultados |

### 6.3 Dashboards Sugeridos

1. **RAG Quality Dashboard**
   - Média de docs relevantes por busca
   - Taxa de rewrites
   - Distribuição de similarity scores

2. **Performance Dashboard**
   - P50/P95 latência por nó
   - Tempo total do sub-grafo searchPlans

3. **Content Gap Dashboard**
   - Queries que resultaram em fallback
   - Documentos frequentemente marcados como irrelevantes

---

## 7. Roadmap de Implementação

### Fase 6A: Fundação (3-4 dias)

| Task | Descrição | Prioridade |
|------|-----------|------------|
| 6A.1 | Popular `plan_metadata` nos 102 chunks existentes | Alta |
| 6A.2 | Criar índices GIN para metadata | Alta |
| 6A.3 | Implementar `generateQueries` (Multi-Query) | Alta |
| 6A.4 | Implementar `result-fusion.ts` (RRF) | Alta |

### Fase 6B: Grading & Rewriting (2-3 dias)

| Task | Descrição | Prioridade |
|------|-----------|------------|
| 6B.1 | Implementar `gradeDocuments` capability | Alta |
| 6B.2 | Implementar `rewriteQuery` capability | Média |
| 6B.3 | Testes unitários para grading | Alta |

### Fase 6C: Hierarquia & Grafo (3-4 dias)

| Task | Descrição | Prioridade |
|------|-----------|------------|
| 6C.1 | Refatorar `search-health-plans.ts` para hierárquico | Alta |
| 6C.2 | Criar sub-grafo `searchPlansGraph` | Alta |
| 6C.3 | Integrar sub-grafo no workflow principal | Alta |
| 6C.4 | Testes de integração | Alta |

### Fase 6D: Evaluation & Polish (2-3 dias)

| Task | Descrição | Prioridade |
|------|-----------|------------|
| 6D.1 | Implementar `rag-evaluation.ts` | Média |
| 6D.2 | Criar dataset de testes | Média |
| 6D.3 | Configurar dashboards LangSmith | Média |
| 6D.4 | Documentação | Baixa |

**Total: 10-14 dias**

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **Multi-Query aumenta latência** | Alta | Médio | Executar queries em paralelo, cache agressivo |
| **Grading adiciona custo de tokens** | Alta | Médio | Usar GPT-4o-mini, batch grading |
| **Loop infinito de rewrites** | Média | Alto | Limite de 2 rewrites, fallback após limite |
| **plan_metadata inconsistente** | Média | Alto | Validação com Zod, migration scripts |
| **Fallback web search lento** | Média | Médio | Timeout de 5s, considerar opcional |
| **RRF não melhora resultados** | Baixa | Médio | A/B test com baseline atual |

---

## 9. Conclusão e Recomendações

### 9.1 Viabilidade

A implementação de Agentic RAG / Corrective RAG é **ALTAMENTE VIÁVEL** dado:

1. **Infraestrutura existente** cobre ~70% das necessidades
2. **LangGraph.js** já está integrado no projeto
3. **LangSmith** já está configurado para tracing
4. **Schema de metadata** existe (precisa popular)

### 9.2 Recomendações Prioritárias

1. **FAZER PRIMEIRO:** Popular `plan_metadata` - sem isso, hierarquia não funciona
2. **FAZER SEGUNDO:** Multi-Query + RRF - maior impacto na qualidade de retrieval
3. **FAZER TERCEIRO:** Document Grading - garante relevância antes de gerar
4. **OPCIONAL:** Query Rewriting + Fallback - para casos edge

### 9.3 Métricas de Sucesso

| Métrica | Baseline (v1) | Target (v2) |
|---------|---------------|-------------|
| Docs relevantes por busca | ~5 | > 8 |
| Cobertura de critérios | ~60% | > 85% |
| Taxa de "zero results" | ~10% | < 2% |
| Satisfação (feedback) | - | > 4/5 |

---

## 10. Referências

### Documentação Oficial
- [LangGraph.js Agentic RAG](https://docs.langchain.com/oss/javascript/langgraph/agentic-rag)
- [LangGraph Corrective RAG](https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_crag/)
- [LangSmith RAG Evaluation](https://docs.langchain.com/langsmith/evaluate-rag-tutorial)

### Artigos e Tutoriais
- [Building RAG with LangChain, LangGraph and LangSmith (TypeScript)](https://dev.to/vdrosatos/building-a-retrieval-augmented-generation-rag-system-with-langchain-langgraph-tavily-and-langsmith-in-typescript-mef)
- [Agentic RAG with Qdrant](https://qdrant.tech/documentation/agentic-rag-langgraph/)
- [Comprehensive Agentic RAG Workflow](https://sajalsharma.com/posts/comprehensive-agentic-rag/)
- [LangChain Query Transformations](https://blog.langchain.com/query-transformations/)
- [RAG-Fusion with LangChain](https://medium.com/@nageshmashette32/langchain-rag-fusion-advance-rag-32eefc63da99)

### Métricas e Avaliação
- [RAG Evaluation 2025](https://labelyourdata.com/articles/llm-fine-tuning/rag-evaluation)
- [RAGAS + LangSmith Integration](https://blog.langchain.com/evaluating-rag-pipelines-with-ragas-langsmith/)
- [LangSmith Evaluation Concepts](https://docs.langchain.com/langsmith/evaluation-concepts)

---

**Documento gerado em:** 2025-12-04
**Próxima revisão:** Após implementação da Fase 6A
