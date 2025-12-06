# PRD: Agentic RAG - Nova Estrutura de Busca

**Versão:** 1.4
**Data:** 2025-12-05
**Autor:** Claude Code
**Status:** Draft
**Dependência:** health-plan-agent-v2-langgraph-prd.md (Fase 6)

---

## 1. Resumo Executivo

### 1.1 Objetivo

Implementar nova estrutura de RAG para o Health Plan Agent v2 baseada em padrões **Agentic RAG** e **Corrective RAG**, substituindo a busca flat atual por busca hierárquica inteligente.

### 1.2 Decisões de Design

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| **Modelo LLM** | GPT-5-mini | Consistência com outros agentes |
| **Web Search Fallback** | ❌ NÃO | Foco em documentos internos |
| **Modelo configurável** | Por collection | Campo `rag_model` na tabela |

### 1.3 Documentos de Referência

- **Análise de Viabilidade:** `.taskmaster/docs/agentic-rag-viability-analysis.md` - Contém diagramas, pseudo-código detalhado e análise técnica completa
- **PRD Principal:** `.taskmaster/docs/health-plan-agent-v2-langgraph-prd.md` - Contexto do agente v2

---

## 2. Escopo

### 2.1 Incluído

- Popular `plan_metadata` nos 102 chunks existentes
- Adicionar campo `rag_model` na tabela `collections`
- Multi-Query: gerar múltiplas queries por busca
- RRF: Reciprocal Rank Fusion para combinar resultados
- Document Grading: LLM avalia relevância
- Query Rewriting: reformular queries quando insuficiente
- Busca hierárquica: geral → específico
- Sub-grafo `searchPlansGraph` no LangGraph

### 2.2 Fora do Escopo

- ❌ Web search fallback
- ❌ Mudanças no frontend
- ❌ Novos endpoints de API

---

## 3. Arquitetura

### 3.1 Fluxo do Sub-Grafo searchPlans

```
START
  │
  ▼
generateQueries ──► GPT-5-mini: 3-5 queries do clientInfo
  │
  ▼
retrieveGeneral ──► Busca docs type="general" (Top-K: 5)
  │
  ▼
retrieveSpecific ──► Busca docs type="operator"|"product" (Top-K: 10)
  │
  ▼
fusionResults ──► RRF (k=60) combina resultados
  │
  ▼
gradeDocuments ──► GPT-5-mini: avalia relevância semântica
  │
  ▼
filterByBudget ──► Filtro matemático: preço(faixaEtária) ≤ orçamento
  │
  ├──► >= 3 docs compatíveis ──► formatResults ──► END
  │
  └──► < 3 docs ──► rewriteQuery (max 2x) ──► volta para retrieveGeneral
                         │
                         └──► após 2 tentativas ──► formatResults ──► END

⚠️ SEM WEB SEARCH FALLBACK
```

> 📐 **Diagrama completo:** Ver seção 5.1 de `agentic-rag-viability-analysis.md`

### 3.2 Estrutura de Arquivos

```
lib/agents/health-plan-v2/
├── graphs/
│   └── search-plans-graph.ts        # Sub-grafo LangGraph
├── nodes/rag/
│   ├── generate-queries.ts          # Multi-Query
│   ├── retrieve-hierarchical.ts     # Busca hierárquica
│   ├── grade-documents.ts           # LLM grading (relevância semântica)
│   ├── filter-by-budget.ts          # Filtro matemático (preço × faixa etária)
│   ├── rewrite-query.ts             # Query rewriting
│   └── result-fusion.ts             # RRF
├── schemas/
│   └── rag-schemas.ts               # Schemas Zod
└── prompts/
    └── rag-prompts.ts               # Prompts grading/rewriting
```

### 3.3 Isolamento de Dados e Multi-tenant

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

### Fase 6B: Grading & Rewriting (2-3 dias)
**🎯 QA pode testar:** Debug mostra documentos sendo avaliados e queries reescritas

#### 6B.1 Implementar grade-documents.ts
- [ ] Criar `lib/agents/health-plan-v2/nodes/rag/grade-documents.ts`
- [ ] Prompt para avaliar relevância
- [ ] Batch processing (5 docs por vez)
- [ ] Retornar: relevant, partially_relevant, irrelevant
- [ ] Filtrar irrelevantes
- [ ] Testes unitários (> 12 casos)

**QA - O que testar:** (via headers debug ou console)
```
Enviar: "Tenho 35 anos, moro em SP, orçamento R$500"
```
**Resposta esperada:** Headers/logs mostram `X-Docs-Graded: 15`, `X-Docs-Relevant: 8`

---

#### 6B.2 Implementar rewrite-query.ts
- [ ] Criar `lib/agents/health-plan-v2/nodes/rag/rewrite-query.ts`
- [ ] Prompt para reformular query
- [ ] Identificar problema (nenhum resultado, baixa similaridade, etc.)
- [ ] Limite de 2 tentativas
- [ ] Flag `limitedResults` após limite
- [ ] Testes unitários (> 8 casos)

**QA - O que testar:** (forçar cenário com busca sem resultados)
```
Enviar: "Plano que cubra tratamento experimental de câncer raro"
```
**Resposta esperada:** Headers mostram `X-Query-Rewrites: 2`, `X-Limited-Results: true`

---

#### 6B.3 Criar rag-schemas.ts
- [ ] Criar `lib/agents/health-plan-v2/schemas/rag-schemas.ts`
- [ ] Schema `QueryItem` (query, focus, priority)
- [ ] Schema `GradeResult` (score, reason, missingInfo)
- [ ] Schema `SearchMetadata` (queryCount, rewriteCount, etc.)

**QA - O que testar:** Validação TypeScript - sem erros de tipo no build

---

#### 6B.4 Criar rag-prompts.ts
- [ ] Criar `lib/agents/health-plan-v2/prompts/rag-prompts.ts`
- [ ] `MULTI_QUERY_PROMPT`
- [ ] `GRADE_DOCUMENT_PROMPT`
- [ ] `REWRITE_QUERY_PROMPT`

**QA - O que testar:** Prompts existem e são usados nos nodes

---

#### 6B.5 Testes unitários grading/rewriting
- [ ] `__tests__/grade-documents.test.ts` (12+ casos)
- [ ] `__tests__/rewrite-query.test.ts` (8+ casos)
- [ ] Mocks para GPT-5-mini
- [ ] Cobertura > 85%

**QA - O que testar:** `npm test` passa sem erros

**Entregável Fase 6B:** Grading filtrando irrelevantes, Rewriting reformulando queries

---

### Fase 6C: Hierarquia & Grafo (3-4 dias)
**🎯 QA pode testar:** Busca completa funciona no frontend com planos retornados

#### 6C.1 Implementar retrieve-hierarchical.ts
- [ ] Criar `lib/agents/health-plan-v2/nodes/rag/retrieve-hierarchical.ts`
- [ ] Buscar `documentType="general"` primeiro (Top-K: 5)
- [ ] Extrair operadoras mencionadas
- [ ] Buscar `documentType IN ("operator", "product")` (Top-K: 10)
- [ ] Combinar com peso: gerais 0.3, específicos 0.7

**QA - O que testar:** (via debug headers)
```
Enviar: "Quero plano Amil para família"
```
**Resposta esperada:** Headers mostram `X-General-Docs: 5`, `X-Specific-Docs: 10`, operadora "Amil" priorizada

---

#### 6C.2 Refatorar search-health-plans.ts
- [ ] Modificar `lib/tools/health-plan/search-health-plans.ts`
- [ ] Usar `plan_metadata` para filtrar por tipo
- [ ] Implementar busca hierárquica
- [ ] Manter compatibilidade com v1

**QA - O que testar:** Busca v1 continua funcionando (regressão)

---

#### 6C.3 Criar search-plans-graph.ts
- [ ] Criar `lib/agents/health-plan-v2/graphs/search-plans-graph.ts`
- [ ] StateGraph com estado próprio
- [ ] Nós: generateQueries, retrieveGeneral, retrieveSpecific, fusionResults, gradeDocuments, rewriteQuery, formatResults
- [ ] Edges condicionais após gradeDocuments
- [ ] Loop de rewrite (max 2x)

**QA - O que testar:** (via LangSmith)
Trace mostra todos os nós executando em sequência correta

---

#### 6C.4 Integrar no workflow v2
- [ ] Modificar `lib/agents/health-plan-v2/workflow/workflow.ts`
- [ ] Importar e invocar `searchPlansGraph`
- [ ] Passar resultado para `HealthPlanState.searchResults`

**QA - O que testar:** (frontend completo)
```
1. Abrir chat com assistente v2
2. Enviar: "Tenho 35 anos, moro em SP, orçamento R$800"
3. Aguardar coleta de dados adicional
4. Quando agente tiver dados suficientes...
```
**Resposta esperada:** Agente retorna resumo de planos encontrados com nomes e características

---

#### 6C.5 Atualizar search-plans.ts capability
- [ ] Modificar `lib/agents/health-plan-v2/nodes/capabilities/search-plans.ts`
- [ ] Invocar `compiledSearchGraph`
- [ ] Retornar `searchResults` e `searchMetadata`
- [ ] Adicionar AIMessage com resumo dos planos

**QA - O que testar:** (frontend)
```
Enviar dados completos do cliente
```
**Resposta esperada:** Mensagem mostra "Encontrei X planos compatíveis: [lista]"

---

#### 6C.6 Testes de integração
- [ ] `__tests__/search-plans-graph.test.ts`
- [ ] Fluxo completo: clientInfo → queries → busca → grading → resultado
- [ ] Cenário de rewrite
- [ ] Cenário limitedResults
- [ ] Cobertura > 80%

**QA - O que testar:** `npm test` passa, todos os cenários cobertos

---

#### 6C.7 Implementar filter-by-budget.ts
- [ ] Criar `lib/agents/health-plan-v2/nodes/rag/filter-by-budget.ts`
- [ ] Função `getAgeBand(age)` - determina faixa ANS (1-5)
- [ ] Função `extractPricesFromContent(content)` - extrai preços de tabelas Markdown
- [ ] Função `filterByBudget(docs, clientInfo)` - filtra por compatibilidade
- [ ] Integrar no grafo após `gradeDocuments`
- [ ] Testes unitários (> 10 casos)
- [ ] Testar cenário: 35 anos, R$500 → apenas 3 planos compatíveis

**Justificativa:** O grading semântico (RF-005) avalia relevância, mas não compatibilidade matemática de preço. Um plano de R$850 é "relevante" para quem busca cobertura completa, mas incompatível com orçamento de R$500.

**QA - O que testar:**
```
Input: { age: 35, budget: 500, city: "São Paulo" }
```
**Resposta esperada:**
- Apenas planos com preço Faixa 2 ≤ R$500 retornados
- Headers: `X-Compatible-Plans: 3`, `X-Incompatible-Plans: 6`

**Entregável Fase 6C:** Busca hierárquica completa funcionando no frontend com filtro de orçamento

---

### Fase 6D: Evaluation & Polish (2-3 dias)
**🎯 QA pode testar:** Métricas de qualidade visíveis no LangSmith, fluxo estável

#### 6D.1 Implementar rag-evaluation.ts
- [ ] Criar `lib/agents/health-plan-v2/monitoring/rag-evaluation.ts`
- [ ] Avaliadores: relevance, groundedness, retrieval_quality
- [ ] Integração com LangSmith evaluate()
- [ ] Exportar métricas

**QA - O que testar:** Dashboard LangSmith mostra métricas de RAG

---

#### 6D.2 Criar dataset de testes
- [ ] 20+ casos de teste variados
- [ ] Perfis: individual, familiar, idoso, condições pré-existentes
- [ ] Expected outputs definidos
- [ ] Salvar em `__tests__/fixtures/rag-test-cases.json`

**QA - O que testar:** Arquivo existe com 20+ casos documentados

---

#### 6D.3 Executar evaluation baseline
- [ ] Rodar evaluation com dataset
- [ ] Documentar baseline metrics
- [ ] Identificar casos problemáticos
- [ ] Ajustar prompts se necessário

**QA - O que testar:** Relatório de baseline gerado e compartilhado

---

#### 6D.4 Configurar dashboards LangSmith
- [ ] Dashboard: RAG Quality (docs relevantes, rewrite rate)
- [ ] Dashboard: Performance (latência por nó)
- [ ] Alertas para métricas fora do target

**QA - O que testar:** Dashboards acessíveis e populados com dados

---

#### 6D.5 Documentação técnica
- [ ] Atualizar README com nova arquitetura RAG
- [ ] Documentar configuração `rag_model`
- [ ] Documentar troubleshooting

**QA - O que testar:** Documentação existe e está atualizada

**Entregável Fase 6D:** Sistema de evaluation funcionando, métricas de qualidade

---

## 8. Matriz de Testabilidade

| Fase | Funcionalidade | Critério QA | Status |
|------|----------------|-------------|--------|
| 6A.1 | Chunks classificados | SQL retorna 102 com metadata | ✅ |
| 6A.2 | Índices criados | 4 índices GIN criados | ✅ |
| 6A.3 | rag_model adicionado | Collections com default gpt-5-mini | ✅ |
| 6A.4 | Multi-Query | 18 testes passando | ✅ |
| 6A.5 | RRF | 16 testes passando | ✅ |
| 6B.1 | Grading | Headers X-Docs-Graded/Relevant | [ ] |
| 6B.2 | Rewriting | Headers X-Query-Rewrites | [ ] |
| 6B.5 | Testes unit | npm test passa | [ ] |
| 6C.1 | Hierárquico | Headers X-General/Specific-Docs | [ ] |
| 6C.4 | Integração | Frontend mostra planos | [ ] |
| 6C.5 | Capability | Mensagem lista planos | [ ] |
| 6C.7 | Budget Filter | Apenas planos compatíveis retornados | [ ] |
| 6D.4 | LangSmith | Dashboards visíveis | [ ] |

---

## 9. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Multi-Query aumenta latência | Queries em paralelo |
| Grading adiciona custo | GPT-5-mini, batch 5 docs |
| Loop infinito de rewrites | Limite de 2, flag limitedResults |
| plan_metadata inconsistente | Validação Zod, script revisão |

---

## 10. Definition of Done

- [ ] 100% chunks com plan_metadata
- [ ] Campo rag_model em collections
- [ ] Sub-grafo searchPlansGraph funcionando
- [ ] Busca hierárquica (geral → específico)
- [ ] Multi-Query (3-5 queries)
- [ ] Grading filtrando irrelevantes
- [ ] Rewrite com limite de 2
- [ ] Modelo configurável por collection
- [ ] Testes > 85% cobertura
- [ ] LangSmith traces completos
- [ ] QA validou todos os checkpoints

---

## Changelog

| Versão | Data | Mudanças |
|--------|------|----------|
| 1.0 | 2025-12-04 | Versão inicial |
| 1.1 | 2025-12-04 | Simplificado: removido código extenso, adicionado QA por task, modelo GPT-5-mini, checkboxes |
| 1.2 | 2025-12-04 | Adicionado: Seção 3.3 (Isolamento de Dados e Multi-tenant), Seção 5.1 (Fluxo do rag_model), referências de código para autenticação |
| 1.3 | 2025-12-05 | **Fase 6A CONCLUÍDA:** Todos os 5 subtasks implementados e testados. 34 testes passando. Documentação atualizada com notas de implementação GPT-5 (modelKwargs vs temperature). |
| 1.4 | 2025-12-05 | **RF-009 adicionado:** Filtro de compatibilidade matemática preço × faixa etária. Nova subtask 6C.7 (filter-by-budget.ts). Diagrama de fluxo atualizado com nó filterByBudget após gradeDocuments. |

---

## Anexo: Notas Técnicas GPT-5

### Configuração de Modelos GPT-5

Os modelos da família GPT-5 (gpt-5.1, gpt-5-mini, gpt-5-nano) possuem arquitetura diferente e **não suportam** os parâmetros tradicionais `temperature` e `top_p`.

**Parâmetros GPT-5:**
```typescript
modelKwargs: {
  reasoning: { effort: "none" | "low" | "medium" | "high" },
  text: { verbosity: "low" | "medium" | "high" }
}
```

**Implementação no código:**
```typescript
const isGpt5Model = model.startsWith("gpt-5")

const llm = new ChatOpenAI({
  modelName: model,
  ...(isGpt5Model
    ? { modelKwargs: { reasoning: { effort: "low" }, text: { verbosity: "medium" } } }
    : { temperature: 0.3 })
})
```

**Referência:** `lib/agents/health-plan-v2/nodes/rag/generate-queries.ts:101-122`
