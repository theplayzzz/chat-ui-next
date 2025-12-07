# Health Plan Agent v2 - LangGraph.js

Agente conversacional adaptativo para recomendação de planos de saúde, implementado com LangGraph.js.

## Arquitetura

```
lib/agents/health-plan-v2/
├── nodes/                    # Nós do grafo
│   ├── orchestrator.ts       # Nó principal que interpreta intenções
│   ├── router.ts             # Router de intenções para capacidades
│   ├── capabilities/         # Capacidades executáveis
│   │   ├── update-client-info.ts
│   │   ├── search-plans.ts
│   │   ├── analyze-compatibility.ts
│   │   ├── fetch-prices.ts
│   │   ├── generate-recommendation.ts
│   │   ├── respond-to-user.ts
│   │   └── end-conversation.ts
│   └── rag/                  # Agentic RAG (Fase 6)
│       ├── generate-queries.ts     # Multi-Query Generation
│       ├── retrieve-hierarchical.ts # Busca hierárquica
│       ├── result-fusion.ts        # RRF Fusion
│       ├── grade-documents.ts      # Document Grading
│       ├── rewrite-query.ts        # Query Rewriting
│       ├── filter-by-budget.ts     # Budget Filter
│       └── index.ts
├── graphs/                   # Sub-grafos
│   └── search-plans-graph.ts # Sub-grafo Agentic RAG
├── state/                    # Gerenciamento de estado
│   ├── state-annotation.ts   # HealthPlanStateAnnotation
│   ├── state-manager.ts      # Gerenciador de estado mutável
│   └── cache-invalidation.ts # Lógica de invalidação de cache
├── workflow/                 # Workflow principal
│   └── workflow.ts           # StateGraph com loop conversacional
├── intents/                  # Classificação de intenções
│   ├── intent-classifier.ts  # Classificador via GPT
│   └── prompts/              # Prompts para classificação
├── monitoring/               # Observabilidade (Fase 6D)
│   ├── rag-evaluation.ts     # Avaliadores RAG
│   └── index.ts
├── checkpointer/             # Persistência de estado
│   └── postgres-checkpointer.ts
├── schemas/                  # Schemas de validação
│   └── rag-schemas.ts        # Schemas RAG
├── prompts/                  # Prompts do agente
│   └── rag-prompts.ts        # Prompts RAG
├── templates/                # Templates de resposta
├── core/                     # Lógica de negócio
├── __tests__/                # Testes unitários
├── types.ts                  # Definições de tipos
└── index.ts                  # Exports centralizados
```

## Capacidades

| Capacidade | Trigger | Pode Repetir? | Invalida Cache? |
|------------|---------|---------------|-----------------|
| `updateClientInfo` | Usuário fornece dados pessoais | Sim | Sim |
| `searchPlans` | Dados suficientes OU usuário pede | Sim | Sim |
| `analyzeCompatibility` | Planos encontrados OU usuário pede | Sim | Não |
| `fetchPrices` | Usuário pede explicitamente | Sim | Não |
| `generateRecommendation` | Análise pronta OU usuário pede | Sim | Não |
| `respondToUser` | Conversa geral, dúvidas | Sim | Não |
| `endConversation` | Usuário diz "finalizar" | Não | N/A |

## Uso

```typescript
import { createHealthPlanWorkflow } from '@/lib/agents/health-plan-v2'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

const checkpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL_POOLER!,
  { schema: 'langgraph' }
)

const workflow = createHealthPlanWorkflow()
const app = workflow.compile({ checkpointer })

// Executar com streaming
const stream = app.stream(
  { messages: [{ role: 'user', content: 'Preciso de um plano de saúde' }] },
  { configurable: { thread_id: chatId } }
)
```

## Agentic RAG (Fase 6)

O sistema de busca de planos utiliza um sub-grafo Agentic RAG com as seguintes características:

### Fluxo de Busca

```
┌─────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│  initialize │──▶│  generateQueries │──▶│ retrieveHierarchical │
└─────────────┘   │   (3-5 queries)  │   │ (general + specific) │
                  └──────────────────┘   └──────────┬───────────┘
                                                    │
                                                    ▼
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐
│ filterByBudget  │◀──│  gradeDocuments  │◀──│  fusionResults  │
│ (preço×idade×$) │   │  (LLM grading)   │   │    (RRF k=60)   │
└───────┬─────────┘   └──────────────────┘   └─────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│  effectiveCount < 3 &&               │
│  rewriteCount < 2 ?                  │
└────────────────┬─────────────────────┘
                 │
       ┌─────────┴─────────┐
       │ não               │ sim
       ▼                   ▼
┌─────────────┐   ┌─────────────────┐
│ formatResult│   │  rewriteQuery   │──▶ (volta para retrieve)
└──────┬──────┘   └─────────────────┘
       │
       ▼
    [END]
```

**Etapas do Pipeline:**

| Etapa | Função | Descrição |
|-------|--------|-----------|
| initialize | Carrega fileIds | Obtém arquivos das collections do assistente |
| generateQueries | Multi-Query | GPT gera 3-5 queries multi-perspectiva |
| retrieveHierarchical | Busca 2-fases | General (chunks grandes) + Specific (chunks detalhados) |
| fusionResults | RRF | Reciprocal Rank Fusion combina e ranqueia top 15 |
| gradeDocuments | LLM Grading | Avalia relevância semântica de cada documento |
| filterByBudget | Filtro Matemático | Filtra por preço × faixa etária ANS × orçamento do cliente |
| routeAfterFiltering | Decisão | Formatar resultado ou reescrever query |
| rewriteQuery | Loop max 2x | Reescreve query se poucos docs relevantes |
| formatResults | Prepara output | Gera metadados e resultado final |

### Configuração do Modelo RAG

O modelo usado no RAG pode ser configurado por collection:

```sql
-- Verificar configuração atual
SELECT id, name, rag_model FROM collections WHERE assistant_id = 'SEU_ASSISTANT_ID';

-- Alterar modelo (valores: gpt-5-mini, gpt-4o, gpt-4-turbo)
UPDATE collections
SET rag_model = 'gpt-4o'
WHERE id = 'COLLECTION_ID';
```

**Modelos disponíveis:**
- `gpt-5-mini` (default) - Rápido e econômico, bom para maioria dos casos
- `gpt-4o` - Maior qualidade de grading e geração de queries
- `gpt-4-turbo` - Balanço entre qualidade e custo

### Métricas e Targets

| Métrica | Target | Alerta |
|---------|--------|--------|
| Docs relevantes/busca | >= 5 | < 3 |
| Taxa de rewrite | < 30% | > 50% |
| Latência total | < 8s | > 12s |

## Monitoramento (LangSmith)

### Dashboards

**Dashboard 1: RAG Quality**
- Docs relevantes por busca (média)
- Taxa de rewrite (%)
- Score médio de grading
- Distribuição de scores (relevant/partially_relevant/irrelevant)

**Dashboard 2: Performance**
- Latência por nó (generateQueries, retrieve, grade, filterByBudget, rewrite, formatResults)
- Latência total do fluxo
- Throughput (buscas/minuto)

### Alertas Configurados

- `rag_latency_high`: Latência > 12s
- `rag_low_docs`: Docs relevantes < 3
- `rag_high_rewrite`: Taxa de rewrite > 50%

### Avaliadores Customizados

```typescript
import { evaluateRAG, type RAGEvaluationInput } from './monitoring'

const input: RAGEvaluationInput = {
  clientInfo: { age: 30, city: 'São Paulo', budget: 500 },
  queries: ['plano saúde SP jovem'],
  documents: gradedDocs,
  searchMetadata: { queryCount: 3, rewriteCount: 0, ... }
}

const result = evaluateRAG(input)
// result.relevance: 0-1
// result.groundedness: 0-1
// result.retrievalQuality: 0-1
// result.overallScore: 0-1
```

## Troubleshooting

### Poucos documentos relevantes (< 3)

**Sintomas:** Busca retorna poucos docs, múltiplos rewrites

**Causas possíveis:**
1. `plan_metadata` inconsistente nos chunks
2. Queries muito específicas
3. Embeddings desatualizados

**Soluções:**
```sql
-- Verificar documentType nos chunks
SELECT DISTINCT metadata->>'documentType'
FROM file_items
WHERE file_id IN (SELECT id FROM files WHERE collection_id = 'X');

-- Verificar se há embeddings
SELECT COUNT(*) FROM file_items WHERE embedding IS NOT NULL;
```

### Taxa de rewrite alta (> 50%)

**Sintomas:** Muitos ciclos de rewrite, latência elevada

**Causas possíveis:**
1. Prompts de geração de queries muito específicos
2. Índices não otimizados
3. Dados de treinamento limitados para região/perfil

**Soluções:**
- Ajustar `MULTI_QUERY_PROMPT` em `prompts/rag-prompts.ts`
- Verificar índices: `idx_file_items_embedding`, `idx_file_items_file_id`

### Latência alta (> 8s)

**Sintomas:** Buscas lentas, timeout

**Causas possíveis:**
1. Muitos documentos para grading
2. Modelo pesado configurado
3. Conexão lenta com embedding API

**Soluções:**
```sql
-- Verificar índices
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'file_items';

-- Verificar tamanho das collections
SELECT c.name, COUNT(fi.id) as chunks
FROM collections c
JOIN files f ON f.collection_id = c.id
JOIN file_items fi ON fi.file_id = f.id
GROUP BY c.id;
```

## Scripts de Avaliação

```bash
# Rodar evaluation baseline (dry-run com mock data)
npx tsx scripts/run-rag-evaluation.ts --dry-run

# Rodar evaluation real (requer conexão com Supabase)
npx tsx scripts/run-rag-evaluation.ts --real

# Limitar a N casos
npx tsx scripts/run-rag-evaluation.ts --dry-run --limit=5
```

Os relatórios são gerados em `.taskmaster/reports/rag-baseline-evaluation.md`.

## PRD

- Agentic RAG: `.taskmaster/docs/agentic-rag-implementation-prd.md`
- Health Plan Agent v2: `.taskmaster/docs/health-plan-agent-v2-langgraph-prd.md`
