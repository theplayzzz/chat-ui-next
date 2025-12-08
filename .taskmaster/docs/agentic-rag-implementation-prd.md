# PRD: Agentic RAG - Nova Estrutura de Busca

**Versão:** 2.0
**Data:** 2025-12-08
**Autor:** Claude Code
**Status:** ✅ IMPLEMENTADO
**Dependência:** health-plan-agent-v2-langgraph-prd.md (Fase 6)

---

## 1. Resumo Executivo

### 1.1 Objetivo

Implementar nova estrutura de RAG para o Health Plan Agent v2 baseada em **busca por arquivo** com **grading contextual**, substituindo a busca flat por análise de arquivos como unidades.

### 1.2 Decisões de Design (ATUALIZADAS)

| Decisão | Escolha Original | **Implementação Final** | Justificativa |
|---------|------------------|-------------------------|---------------|
| **Estratégia de Busca** | Multi-Query + RRF | **Top 5 por arquivo** | Simplicidade, melhor contexto por documento |
| **Grading** | Chunk por chunk | **Arquivo como unidade** | Contexto completo do documento |
| **Contexto** | Apenas perfil cliente | **Perfil + Conversa** | Respostas mais precisas |
| **Saída** | JSON estruturado | **Texto formatado** | Pronto para LLM usar |
| **Modelo LLM** | GPT-5-mini | GPT-4o-mini | Estabilidade |

### 1.3 PIVOT: O que Mudou

A arquitetura original (Multi-Query → RRF → Grading chunk a chunk → Rewrite) foi **substituída** por uma abordagem mais simples e eficaz:

| Componente | Planejado | Implementado |
|------------|-----------|--------------|
| Query | 3-5 queries via LLM | Query única do perfil + conversa |
| Retrieval | Hierárquico (geral→específico) | Top 5 chunks por arquivo |
| Grading | Por chunk individual | Por arquivo completo |
| Fallback | Rewrite query (max 2x) | Contexto de conversa no prompt |
| Output | `searchResults[]` | `ragAnalysisContext` (texto) |

---

## 2. Escopo

### 2.1 Implementado ✅

- ✅ Busca top 5 chunks POR ARQUIVO (não top 20 global)
- ✅ Grading do arquivo como unidade (5 chunks juntos)
- ✅ Contexto completo da conversa no grading
- ✅ Saída como texto formatado (`ragAnalysisContext`)
- ✅ Sub-grafo `searchPlansGraph` no LangGraph
- ✅ Campo `rag_model` na tabela `collections`

### 2.2 Não Implementado (PIVOTADO)

- ⏭️ Multi-Query generation (generate-queries.ts existe mas não usado)
- ⏭️ RRF Fusion (result-fusion.ts existe mas não usado)
- ⏭️ Rewrite Query loop
- ⏭️ filter-by-budget separado (integrado no grading)

### 2.3 Fora do Escopo

- ❌ Web search fallback
- ❌ Mudanças no frontend
- ❌ Novos endpoints de API

---

## 3. Arquitetura IMPLEMENTADA

### 3.1 Fluxo do Sub-Grafo searchPlans (ATUAL)

```
START
  │
  ▼
initialize ──► Carrega fileIds do assistantId
  │
  ▼
retrieveByFile ──► Para CADA arquivo: busca top 5 chunks (pgvector)
  │                (paralelo em batches de 10)
  ▼
gradeByFile ──► Para CADA arquivo: GPT-4o-mini avalia como unidade
  │             (paralelo em batches de 3)
  │             Recebe: chunks + clientInfo + conversationMessages
  │             Retorna: analysisText por arquivo
  ▼
formatResults ──► Concatena análises em ragAnalysisContext
  │               Ordena: high → medium → low relevância
  ▼
END ──► State.ragAnalysisContext = texto formatado
```

### 3.2 Estrutura de Arquivos (ATUAL)

```
lib/agents/health-plan-v2/
├── graphs/
│   └── search-plans-graph.ts        # Sub-grafo: initialize → retrieveByFile → gradeByFile → formatResults
├── nodes/
│   ├── rag/
│   │   ├── retrieve-simple.ts       # Busca top 5 chunks POR ARQUIVO
│   │   ├── grade-documents.ts       # Grading arquivo como unidade + conversa
│   │   └── index.ts                 # Exports
│   └── capabilities/
│       └── search-plans.ts          # Capability que invoca o grafo
├── state/
│   └── state-annotation.ts          # ragAnalysisContext field
└── schemas/
    └── rag-schemas.ts               # Tipos legacy para compatibilidade
```

### 3.3 Tipos Principais

```typescript
// retrieve-simple.ts
interface RetrieveByFileResult {
  fileId: string
  fileName: string
  fileDescription: string
  collection: { id, name, description } | null
  chunks: EnrichedChunk[]
  totalChunks: number
}

// grade-documents.ts
interface FileGradingResult {
  fileId: string
  fileName: string
  collectionName: string
  relevance: "high" | "medium" | "low" | "irrelevant"
  analysisText: string  // Análise textual do LLM
}

// state-annotation.ts
ragAnalysisContext: Annotation<string>  // Texto formatado com todas análises
```

### 3.4 Isolamento de Dados e Multi-tenant

O sistema garante isolamento completo de dados entre usuários através do fluxo:

```
API Route (auth) → HealthPlanState.assistantId → searchPlansGraph → getHealthPlanCollections(assistantId)
```

**Fluxo detalhado:**

1. **Autenticação:** `route.ts` valida JWT via `getServerProfile()` antes de qualquer operação
2. **assistantId no State:** O `assistantId` é injetado no `HealthPlanState` inicial pelo route
3. **Sub-grafo recebe contexto:** Quando `searchPlansGraph` é invocado, ele recebe o state completo incluindo `assistantId`
4. **Busca filtrada:** `getHealthPlanCollections(assistantId)` retorna apenas collections do assistente do usuário
5. **RLS como backup:** Tabelas têm policies `user_id = auth.uid()` como segunda camada de proteção

**Referência de código:**
- Autenticação: `app/api/chat/health-plan-agent-v2/route.ts:58-76`
- Busca por assistente: `lib/tools/health-plan/search-health-plans.ts:59-127`
- Função de similaridade: `supabase/migrations/20240108234545_add_file_items.sql:89-116`

> ⚠️ **Importante:** O sub-grafo `searchPlansGraph` DEVE receber `assistantId` do state pai para filtrar corretamente. Novos arquivos/collections adicionados pelo usuário são automaticamente incluídos nas buscas (sem cache estático).

---

## 4. Schema de Dados

### 4.1 plan_metadata (file_items.plan_metadata JSONB)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `documentType` | enum | `"general"` \| `"operator"` \| `"product"` \| `"clause"` \| `"faq"` |
| `operator` | string? | Nome da operadora (Amil, Bradesco, etc.) |
| `planCode` | string? | Código do plano |
| `tags` | string[] | Tags para busca |
| `version` | string | Versão do documento |

> 📋 **Schema completo:** Ver seção 4.1 de `agentic-rag-viability-analysis.md`

### 4.2 Nova Coluna: collections.rag_model

```sql
ALTER TABLE collections
ADD COLUMN rag_model TEXT DEFAULT 'gpt-5-mini'
  CHECK (rag_model IN ('gpt-5-mini', 'gpt-4o', 'gpt-4-turbo'));
```

### 4.3 Índices Necessários

```sql
CREATE INDEX idx_file_items_doc_type ON file_items ((plan_metadata->>'documentType'));
CREATE INDEX idx_file_items_operator ON file_items ((plan_metadata->>'operator'));
CREATE INDEX idx_file_items_tags ON file_items USING GIN ((plan_metadata->'tags'));
```

---

## 5. Requisitos Funcionais

| ID | Requisito | Modelo | Referência |
|----|-----------|--------|------------|
| RF-001 | Gerar 3-5 queries especializadas do clientInfo | GPT-5-mini | Seção 3.3.3 viability |
| RF-002 | Buscar docs gerais primeiro (Top-K: 5) | - | Seção 3.2.1 viability |
| RF-003 | Buscar docs específicos por plano (Top-K: 10) | - | Seção 3.2.1 viability |
| RF-004 | Combinar resultados via RRF (k=60) | - | Seção 3.2.3 viability |
| RF-005 | Avaliar relevância semântica de cada documento | GPT-5-mini | Seção 3.3.1 viability |
| RF-006 | Reformular query se < 3 docs (max 2x) | GPT-5-mini | Seção 3.3.2 viability |
| RF-007 | Modelo LLM configurável por collection | - | Nova feature |
| RF-008 | Popular plan_metadata em 100% dos chunks | - | Seção 4 viability |
| RF-009 | Filtrar docs por compatibilidade matemática preço × faixa etária | - | Seção 5.2 |

### 5.1 Detalhamento RF-007: Fluxo do rag_model

O modelo LLM para operações RAG é lido da collection no início da busca:

### 5.2 Detalhamento RF-009: Filtro de Compatibilidade por Orçamento

#### Problema
O grading semântico (RF-005) avalia se um documento é **relevante** para o perfil do cliente, mas não verifica se os planos mencionados são **matematicamente compatíveis** com o orçamento.

Exemplo: Um documento sobre "Plano Executivo Premium R$850/mês" é semanticamente relevante para "cliente busca plano completo em SP", mas matematicamente incompatível com orçamento de R$500.

#### Solução
Adicionar etapa `filterByBudget` após `gradeDocuments` que:

1. **Extrai preços do conteúdo** textual (tabelas Markdown, menções inline)
2. **Determina faixa etária** do cliente baseado na idade (ANS)
3. **Verifica compatibilidade**: `preço(faixaEtária) ≤ orçamento`
4. **Filtra documentos** incompatíveis

#### Faixas Etárias ANS
| Faixa | Idade | Campo |
|-------|-------|-------|
| 1 | 0-18 anos | `band1` |
| 2 | 19-38 anos | `band2` |
| 3 | 39-59 anos | `band3` |
| 4 | 60-75 anos | `band4` |
| 5 | 76+ anos | `band5` |

#### Padrões de Extração de Preços
```
Tabela Markdown: | Plano | R$ 180,00 | R$ 250,00 | ...
Inline: "O plano custa R$450,00 para adultos"
Estruturado: metadata.ageBands (quando disponível)
```

#### Comportamento
- **Sem idade ou orçamento**: Retorna todos os documentos (filtro desabilitado)
- **Sem preço no documento**: Mantém documento (pode ser info geral)
- **Com preço incompatível**: Remove documento dos resultados

#### Referência de Implementação
- Arquivo: `lib/agents/health-plan-v2/nodes/rag/filter-by-budget.ts`
- Funções: `getAgeBand()`, `extractPricesFromContent()`, `filterByBudget()`

---

```
searchPlansGraph.start
  │
  ▼
getHealthPlanCollections(assistantId)
  │
  ├── Retorna: collections[].rag_model (ex: "gpt-5-mini")
  │
  ▼
state.ragModel = collections[0].rag_model || "gpt-5-mini"
  │
  ├──► generateQueries(state.ragModel)
  ├──► gradeDocuments(state.ragModel)
  └──► rewriteQuery(state.ragModel)
```

**Implementação:**
1. `getHealthPlanCollections()` retorna o campo `rag_model` junto com as collections
2. O nó inicial do sub-grafo extrai `rag_model` e injeta no state local
3. Todos os nós LLM (generateQueries, gradeDocuments, rewriteQuery) usam `state.ragModel`
4. Se collection não tiver `rag_model`, usa default `gpt-5-mini`

---

## 6. Requisitos Não-Funcionais

### 6.1 Performance

| Operação | Target | Alerta |
|----------|--------|--------|
| generateQueries | < 2s | > 3s |
| Busca hierárquica | < 3s | > 5s |
| gradeDocuments (15 docs) | < 2s | > 4s |
| **Fluxo completo** | **< 8s** | > 12s |

### 6.2 Qualidade

| Métrica | Target |
|---------|--------|
| Docs relevantes por busca | >= 5 |
| Taxa de rewrite | < 30% |
| Cobertura de critérios | > 85% |

---

## 7. Plano de Implementação

> 📝 **Filosofia:** "Testável First" - Cada fase entrega funcionalidade testável pelo QA no frontend antes de avançar.

---

### Fase 6A: Fundação de Dados (2-3 dias)
**🎯 QA pode testar:** Dados estruturados no banco, queries retornam por tipo de documento

#### 6A.1 Popular plan_metadata ✅ CONCLUÍDO
- [x] Criar script `scripts/populate-plan-metadata.ts`
- [x] Definir regras de classificação por nome de arquivo
- [x] Executar migração nos 102 chunks existentes
- [x] Validar 100% dos chunks com metadata

**Implementação:** SQL direto no Supabase + script de backup. Resultado: 100 product, 1 faq, 1 general.

**QA - O que testar:**
```sql
-- Executar no Supabase SQL Editor
SELECT
  plan_metadata->>'documentType' as tipo,
  COUNT(*) as total
FROM file_items
WHERE plan_metadata IS NOT NULL
GROUP BY 1;
```
**Resposta esperada:** Todos os 102 chunks categorizados (general, operator, product, etc.)

---

#### 6A.2 Criar índices GIN ✅ CONCLUÍDO
- [x] Criar migration `add_plan_metadata_indexes`
- [x] Índice para `documentType`
- [x] Índice para `operator`
- [x] Índice GIN para `tags`
- [x] Testar performance das queries

**Implementação:** 4 índices criados:
- `idx_file_items_doc_type` (documentType)
- `idx_file_items_operator` (operator)
- `idx_file_items_tags` (GIN tags)
- `idx_file_items_plan_metadata` (GIN geral)

**QA - O que testar:**
```sql
EXPLAIN ANALYZE
SELECT * FROM file_items
WHERE plan_metadata->>'documentType' = 'general';
```
**Nota:** Com 102 rows, PostgreSQL escolhe Seq Scan (mais eficiente). Index Scan será usado com >1000 rows.

---

#### 6A.3 Adicionar rag_model em collections ✅ CONCLUÍDO
- [x] Criar migration `add_rag_model_to_collections`
- [x] Default: `gpt-5-mini`
- [x] Constraint: `gpt-5-mini`, `gpt-4o`, `gpt-4-turbo`

**Implementação:** Campo adicionado com default e CHECK constraint. Valores inválidos são rejeitados.

**QA - O que testar:**
```sql
SELECT id, name, rag_model FROM collections;
```
**Resposta esperada:** Todas collections com `rag_model = 'gpt-5-mini'`

---

#### 6A.4 Implementar generate-queries.ts ✅ CONCLUÍDO
- [x] Criar `lib/agents/health-plan-v2/nodes/rag/generate-queries.ts`
- [x] Prompt para gerar 3-5 queries
- [x] Schema Zod para validação
- [x] Testes unitários (> 10 casos) → **18 testes**

**Implementação:**
- Modelo padrão: `gpt-5-mini` (conforme PRD)
- GPT-5 não suporta `temperature` - usa `modelKwargs`:
  - `reasoning.effort: "low"` (velocidade otimizada)
  - `text.verbosity: "medium"` (balanceamento)
- Outros modelos (gpt-4o): usa `temperature: 0.3`
- Detecção automática via `model.startsWith("gpt-5")`
- Tags LangSmith: `["generate-queries", "health-plan-v2", "rag"]`

**Referência:** `lib/agents/health-plan-v2/nodes/rag/generate-queries.ts`

**QA - O que testar:** (via console/debug)
```
Input: { age: 45, city: "São Paulo", dependents: [{age: 10}] }
```
**Resposta esperada:** 3-5 queries diferentes focando em: perfil geral, dependentes, localização

---

#### 6A.5 Implementar result-fusion.ts ✅ CONCLUÍDO
- [x] Criar `lib/agents/health-plan-v2/nodes/rag/result-fusion.ts`
- [x] Função `reciprocalRankFusion(results, k=60)`
- [x] Testes unitários (> 8 casos) → **16 testes**

**Implementação:**
- Algoritmo RRF: `score(d) = Σ 1/(k + rank(d, q))` com k=60
- Multi-Query Boost: docs em múltiplas queries recebem boost adicional
- Top 15 documentos retornados ordenados por score
- Rastreamento de `appearances` e `queryMatches`
- Helpers: `filterByDocumentType`, `groupByOperator`, `calculateFusionStats`

**Referência:** `lib/agents/health-plan-v2/nodes/rag/result-fusion.ts`

**QA - O que testar:** Teste unitário verifica:
- Docs em múltiplas queries recebem score maior
- Top 15 retornados ordenados por score

---

### ✅ Fase 6A CONCLUÍDA

**Entregável:** Chunks classificados, Multi-Query gerando queries, RRF combinando resultados

**Métricas finais:**
| Componente | Target | Alcançado |
|------------|--------|-----------|
| Chunks com metadata | 100% | ✅ 102/102 |
| Índices GIN | 4 | ✅ 4/4 |
| Testes generate-queries | >10 | ✅ 18 |
| Testes result-fusion | >8 | ✅ 16 |
| **Total testes** | >18 | ✅ **34** |

**Arquivos criados:**
- `lib/agents/health-plan-v2/nodes/rag/generate-queries.ts`
- `lib/agents/health-plan-v2/nodes/rag/result-fusion.ts`
- `lib/agents/health-plan-v2/nodes/rag/index.ts`
- `lib/agents/health-plan-v2/nodes/rag/__tests__/generate-queries.test.ts`
- `lib/agents/health-plan-v2/nodes/rag/__tests__/result-fusion.test.ts`
- `scripts/populate-plan-metadata.ts`

---

### ⏭️ Fase 6B: PIVOTADO

> **Nota:** Esta fase foi substituída pela nova arquitetura de grading por arquivo.
> Ver seção 3.1 para o fluxo implementado.

**O que foi planejado (não implementado):**
- Grading chunk por chunk
- Rewrite query loop (max 2x)
- Prompts separados para cada operação

**O que foi implementado (diferente):**
- ✅ Grading do ARQUIVO como unidade (`gradeByFile`)
- ✅ Contexto de conversa no prompt (substitui rewrite)
- ✅ Análise textual por arquivo (não score numérico)

---

### ✅ Fase 6C: Grafo & Integração - IMPLEMENTADO (com PIVOT)

> **Nota:** Esta fase foi implementada com arquitetura diferente do planejado.

**O que foi implementado:**
- ✅ `search-plans-graph.ts` - Sub-grafo com fluxo: initialize → retrieveByFile → gradeByFile → formatResults
- ✅ `retrieve-simple.ts` - Top 5 chunks por arquivo (não hierárquico)
- ✅ `grade-documents.ts` - Grading por arquivo com `gradeByFile()`
- ✅ `search-plans.ts` - Capability atualizada para passar `ragAnalysisContext`
- ✅ `state-annotation.ts` - Campo `ragAnalysisContext` adicionado
- ✅ `search-health-plans.ts` - Tool atualizada para usar `retrieveSimple`

**O que foi planejado mas NÃO implementado:**
- ⏭️ Busca hierárquica geral→específico (substituída por busca por arquivo)
- ⏭️ filter-by-budget.ts separado (integrado no prompt de grading)
- ⏭️ Loop de rewrite (substituído por contexto de conversa)

---

### Fase 6D: Evaluation & Polish - PARCIALMENTE IMPLEMENTADO

**Implementado:**
- ✅ `rag-evaluation.ts` - Framework de avaliação existe (com tipos legacy)
- ✅ `run-rag-evaluation.ts` - Script de avaliação atualizado

**Pendente:**
- [ ] Adaptar avaliadores para nova arquitetura FileGradingResult
- [ ] Dataset de testes atualizado
- [ ] Dashboards LangSmith configurados

---

## 8. Definition of Done (ATUALIZADO)

- [x] ✅ Sub-grafo searchPlansGraph funcionando
- [x] ✅ Busca top 5 chunks por arquivo
- [x] ✅ Grading do arquivo como unidade
- [x] ✅ Contexto de conversa no grading
- [x] ✅ Saída como `ragAnalysisContext` (texto formatado)
- [x] ✅ Build do Next.js passando
- [ ] ⏳ Testes de integração atualizados para nova arquitetura
- [ ] ⏳ Avaliadores adaptados para FileGradingResult

---

## Changelog

| Versão | Data | Mudanças |
|--------|------|----------|
| 1.0 | 2025-12-04 | Versão inicial |
| 1.1 | 2025-12-04 | Simplificado: removido código extenso, adicionado QA por task, modelo GPT-5-mini |
| 1.3 | 2025-12-05 | **Fase 6A CONCLUÍDA:** 34 testes passando |
| 1.4 | 2025-12-05 | RF-009 adicionado: filter-by-budget |
| **2.0** | **2025-12-08** | **PIVOT ARQUITETURAL:** Substituição da arquitetura Multi-Query+RRF+Rewrite por busca por arquivo com grading contextual. Nova abordagem: top 5 chunks por arquivo, grading arquivo como unidade, contexto de conversa, saída texto formatado (`ragAnalysisContext`). Ver seção 1.3 para detalhes do pivot. |
