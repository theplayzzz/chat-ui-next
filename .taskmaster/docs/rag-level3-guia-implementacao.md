# Guia de Implementação — RAG Nível 3

**Referência:** `rag-level3-maturity-prd.md` (PRD completo)
**Data:** 2026-03-20
**Última atualização:** 2026-03-20

---

## Estratégia de Execução Recomendada

### Ordem Otimizada

```
Semana 1:  Fase 0 (Schema + RPCs + CRUD tags)
              │
              ├─────────────────────────────────────┐
              ▼                                     ▼
Semana 2-3: Fase 1 (Pipeline Ingestão)       Fase 3A (UI: Tags + Chunks viewer)
              │                                     │
              ▼                                     │
Semana 3-4: Fase 2 (Pipeline Busca)          Fase 3B (UI: Upload pré-análise)
              │                                     │
              ├─────────────────────────────────────┘
              ▼
Semana 5:   Fase 4 (Migração + Go-Live)
```

### Por que dividir Fase 3 em 3A e 3B?

A Fase 3 original diz "pode ser paralela com Fases 1 e 2", mas isso só é parcialmente verdade:

- **3A (Tags + Chunks viewer)** — depende apenas do schema (Fase 0). Pode começar na semana 2.
- **3B (Upload com pré-análise)** — depende da API `analyze/route.ts` que é Fase 1. Só pode começar após Fase 1.

Isso maximiza paralelismo real sem criar bloqueios.

### Princípio: Cada fase tem um "gate" de validação

Nenhuma fase seguinte começa sem que os testes de validação da fase anterior passem. Os testes são desenhados para serem executados pelo Claude Code automaticamente (via `npm test` ou scripts de validação) E manualmente pelo operador no frontend.

---

## Fase 0: Schema e Infraestrutura de Banco

**PRD ref:** Seção 6 (linha 537) + Fases de Implementação (linha 1224)
**Duração estimada:** 1 semana
**Dependências:** Nenhuma (base para tudo)

### Entregas

| # | Tarefa | Arquivos | PRD ref |
|---|--------|----------|---------|
| 0.1 | Migration: campos novos em `file_items` (section_type, tags, weight, page_number, document_context) | `supabase/migrations/YYYYMMDD_add_chunk_metadata.sql` | Seção 6, linha 550 |
| 0.2 | Migration: tabela `chunk_tags` com 9 tags pré-inseridas | `supabase/migrations/YYYYMMDD_create_chunk_tags.sql` | Seção 3, linha 300 + Seção 6, linha 600 |
| 0.3 | Migration: campos em `files` (file_embedding, file_tags, ingestion_status) | `supabase/migrations/YYYYMMDD_add_file_metadata.sql` | Seção 6, linha 630 |
| 0.4 | Migration: campos em `collections` (collection_embedding, collection_tags) | `supabase/migrations/YYYYMMDD_add_collection_metadata.sql` | Seção 6, linha 660 |
| 0.5 | Migration: RPC `match_file_items_weighted` | `supabase/migrations/YYYYMMDD_create_weighted_search.sql` | Seção 6, linha 700 |
| 0.6 | Migration: RPC `match_files_by_embedding` | `supabase/migrations/YYYYMMDD_create_file_search.sql` | Seção 6, linha 740 |
| 0.7 | Regenerar tipos + CRUD de tags | `npm run db-types` + `lib/db/chunk-tags.ts` | Seção 6, linha 1238 |

### Testes de Validação — Fase 0

#### Testes Automatizados (Claude Code executa)

**Arquivo:** `__tests__/phases/phase0-schema.test.ts`

```
TESTE 0.1 — Migrations executam sem erro
  Comando: npm run db-reset
  Esperado: Exit code 0, sem erros SQL
  Valida: Todas as migrations (inclusive as novas) aplicam em sequência

TESTE 0.2 — Colunas novas existem em file_items
  Query: SELECT column_name FROM information_schema.columns WHERE table_name = 'file_items'
  Esperado: section_type, tags, weight, page_number, document_context existem
  Valida: Migration 0.1 aplicou corretamente

TESTE 0.3 — Tabela chunk_tags existe com 9 tags do sistema
  Query: SELECT count(*) FROM chunk_tags WHERE is_system = true
  Esperado: 9 tags (por workspace existente)
  Valida: Migration 0.2 + seed data

TESTE 0.4 — Colunas novas em files
  Query: SELECT column_name FROM information_schema.columns WHERE table_name = 'files'
  Esperado: file_embedding, file_tags, ingestion_status, ingestion_metadata existem
  Valida: Migration 0.3

TESTE 0.5 — Colunas novas em collections
  Query: SELECT column_name FROM information_schema.columns WHERE table_name = 'collections'
  Esperado: collection_embedding, collection_tags existem
  Valida: Migration 0.4

TESTE 0.6 — RPC match_file_items_weighted existe
  Query: SELECT proname FROM pg_proc WHERE proname = 'match_file_items_weighted'
  Esperado: 1 resultado
  Valida: Migration 0.5

TESTE 0.7 — RPC match_files_by_embedding existe
  Query: SELECT proname FROM pg_proc WHERE proname = 'match_files_by_embedding'
  Esperado: 1 resultado
  Valida: Migration 0.6

TESTE 0.8 — Tipos TypeScript regenerados
  Comando: npm run db-types && npm run type-check
  Esperado: Exit code 0
  Valida: Tipos incluem novos campos, sem erros de compilação

TESTE 0.9 — CRUD de chunk_tags funciona
  Arquivo de teste: __tests__/lib/db/chunk-tags.test.ts
  Cenários:
    - Criar tag customizada → retorna UUID, slug único por workspace
    - Listar tags do workspace → retorna 9 tags do sistema + customizadas
    - Atualizar weight_boost de tag → valor atualizado
    - Deletar tag customizada → sucesso
    - Deletar tag do sistema (is_system=true) → ERRO (proteção)
    - Criar tag com slug duplicado no mesmo workspace → ERRO (unique constraint)

TESTE 0.10 — Sistema Nível 1 continua funcionando (regressão)
  Comando: npm test (todos os testes existentes)
  Esperado: Todos os testes existentes passam sem alteração
  Valida: Campos nullable com defaults não quebram nada
```

#### Validação Manual (Operador no frontend)

```
MANUAL 0.1 — Abrir o app normalmente → tudo funciona como antes
MANUAL 0.2 — Fazer upload de um arquivo → processamento normal (Nível 1)
MANUAL 0.3 — Fazer uma busca no chat → resultados iguais ao antes
```

#### Gate de Aprovação — Fase 0

- [ ] Todos os TESTES 0.1 a 0.10 passam
- [ ] Todas as validações MANUAL 0.1 a 0.3 confirmadas
- [ ] `npm run type-check` passa sem erros
- [ ] `npm test` (suite existente) passa sem regressão

---

## Fase 1: Pipeline de Ingestão

**PRD ref:** Seção 1 (linha 102) + Fases de Implementação (linha 1247)
**Duração estimada:** 2 semanas
**Dependências:** Fase 0 completa (gate aprovado)

### Ordem de implementação interna

```
1.1 pdf-analyzer.ts        (sem dependência interna)
1.2 smart-chunker.ts       (sem dependência interna)
1.3 contextual-retrieval.ts (depende de 1.2 — recebe chunks)
1.4 tag-inferencer.ts       (depende de 1.2 — recebe chunks)
1.5 embedding-generator.ts  (depende de 1.3 e 1.4 — chunks enriquecidos)
1.6 API analyze/route.ts    (depende de 1.1)
1.7 API rechunk/route.ts    (depende de 1.2, 1.3, 1.4, 1.5)
1.8 Atualizar process/route.ts (depende de 1.1-1.5, integração final)
```

**Paralelismo possível:** 1.1 e 1.2 podem ser feitos em paralelo. 1.3 e 1.4 podem ser feitos em paralelo após 1.2.

### Entregas

| # | Tarefa | Arquivos | PRD ref |
|---|--------|----------|---------|
| 1.1 | Pré-análise de PDF com GPT-5-mini (detectar seções, sugerir nome/descrição/tags) | `lib/rag/ingest/pdf-analyzer.ts` | Seção 1, linha 110 |
| 1.2 | Chunking inteligente por seção (respeita cabeçalhos, tabelas) | `lib/rag/ingest/smart-chunker.ts` | Seção 1, linha 150 |
| 1.3 | Contextual Retrieval — cada chunk recebe parágrafo de contexto posicional | `lib/rag/ingest/contextual-retrieval.ts` | Seção 1, linha 170 |
| 1.4 | Inferência automática de tags por chunk | `lib/rag/ingest/tag-inferencer.ts` | Seção 1, linha 190 |
| 1.5 | Geração de embeddings multi-nível (chunk + file + collection) | `lib/rag/ingest/embedding-generator.ts` | Seção 1, linha 200 |
| 1.6 | API de pré-análise | `app/api/files/analyze/route.ts` | Seção 1, linha 210 |
| 1.7 | API de re-chunking | `app/api/files/rechunk/route.ts` | Seção 2, linha 280 |
| 1.8 | Atualizar pipeline de upload existente (compatibilidade com arquivos antigos) | `app/api/retrieval/process/route.ts` | Seção 1, linha 215 |

### Testes de Validação — Fase 1

#### Testes Unitários (Claude Code executa)

**Arquivo:** `__tests__/lib/rag/ingest/pdf-analyzer.test.ts`

```
TESTE 1.1a — pdf-analyzer retorna JSON estruturado
  Input: Mock de texto extraído de PDF de plano de saúde (primeiras 10 páginas)
  Esperado: JSON com campos: sugerir_nome, sugerir_descricao, operadora,
            tipo_plano, secoes_detectadas (array), tags_sugeridas,
            chunk_size_recomendado (number), chunk_overlap_recomendado (number)
  Valida: Estrutura de saída, tipos corretos, campos obrigatórios preenchidos

TESTE 1.1b — pdf-analyzer detecta operadoras conhecidas
  Input: Texto contendo "Bradesco Saúde", "Unimed", "SulAmérica"
  Esperado: campo operadora preenchido corretamente
  Valida: Detecção de operadoras brasileiras

TESTE 1.1c — pdf-analyzer lida com PDF sem texto
  Input: String vazia ou texto < 100 caracteres
  Esperado: Retorna defaults seguros (nome genérico, tags vazias, chunk_size=3000)
  Valida: Graceful degradation
```

**Arquivo:** `__tests__/lib/rag/ingest/smart-chunker.test.ts`

```
TESTE 1.2a — smart-chunker respeita limites de seção
  Input: Texto com headers markdown (## Preço, ## Cobertura), chunk_size=3000
  Esperado: Chunks não cruzam limites de seção; cada chunk tem section_type correto
  Valida: Chunking semântico por seção

TESTE 1.2b — smart-chunker atribui page_number
  Input: Texto com marcadores de página (ex: \f ou marcadores explícitos)
  Esperado: Cada chunk tem page_number correto
  Valida: Rastreamento de página

TESTE 1.2c — smart-chunker respeita chunk_size e overlap configurados
  Input: Texto longo, chunk_size=1500, overlap=100
  Esperado: Nenhum chunk excede 1500 tokens (+10% tolerância); overlap presente
  Valida: Parâmetros de chunking por arquivo

TESTE 1.2d — smart-chunker com tabelas
  Input: Texto contendo tabela markdown ou ASCII
  Esperado: Tabela não é quebrada no meio de uma linha
  Valida: Preservação de estruturas tabulares
```

**Arquivo:** `__tests__/lib/rag/ingest/contextual-retrieval.test.ts`

```
TESTE 1.3a — contextual-retrieval gera parágrafo de contexto
  Input: Chunk de texto + metadados do arquivo (nome, operadora, tipo)
  Esperado: String de 50-150 palavras começando com "[CONTEXTO:" ou similar
  Valida: Contexto posicional gerado

TESTE 1.3b — contexto menciona arquivo e seção
  Input: Chunk da seção "Preço" do arquivo "Bradesco Flex Nacional"
  Esperado: Contexto contém "Bradesco" e "preço" ou "Preço"
  Valida: Contexto é específico, não genérico

TESTE 1.3c — processamento em batch
  Input: Array de 15 chunks
  Esperado: Todos os 15 recebem contexto; processamento em batches de 10
  Valida: Batching funciona sem perder chunks
```

**Arquivo:** `__tests__/lib/rag/ingest/tag-inferencer.test.ts`

```
TESTE 1.4a — tag-inferencer classifica chunk de preço
  Input: "Faixa etária 29-33 anos: R$ 487,90/mês"
  Esperado: tag = "preco"
  Valida: Classificação correta para preço

TESTE 1.4b — tag-inferencer classifica chunk de cobertura
  Input: "Cobertura ambulatorial inclui consultas com especialistas..."
  Esperado: tag = "cobertura"
  Valida: Classificação correta para cobertura

TESTE 1.4c — tag-inferencer retorna slug válido
  Input: Qualquer chunk
  Esperado: tag retornada está na lista de slugs válidos do sistema
  Valida: Não inventa tags novas

TESTE 1.4d — tag-inferencer com chunk ambíguo
  Input: "O preço inclui cobertura dental e hospitalar"
  Esperado: Retorna uma tag (a mais relevante) + confidence < 1.0
  Valida: Lida com ambiguidade sem falhar
```

**Arquivo:** `__tests__/lib/rag/ingest/embedding-generator.test.ts`

```
TESTE 1.5a — gera embedding de chunk (content + document_context)
  Input: Chunk com content e document_context
  Esperado: Vetor de 1536 dimensões (ou 384 se text-embedding-3-small com dimensions param)
  Valida: Embedding gerado sobre texto enriquecido

TESTE 1.5b — gera file_embedding (nome + descrição + tags)
  Input: { name: "Bradesco Flex", description: "Plano individual", tags: ["preco", "cobertura"] }
  Esperado: Vetor armazenado em files.file_embedding
  Valida: Embedding de nível de arquivo

TESTE 1.5c — gera collection_embedding
  Input: { name: "Bradesco Saúde", description: "Operadora Bradesco", tags: ["preco"] }
  Esperado: Vetor armazenado em collections.collection_embedding
  Valida: Embedding de nível de collection

TESTE 1.5d — embeddings de arquivo e collection são distintos
  Input: Dois arquivos com nomes/tags diferentes
  Esperado: cosine_similarity(embedding1, embedding2) < 0.95
  Valida: Embeddings têm discriminabilidade (risco identificado no PRD)
```

#### Testes de Integração (Claude Code executa)

**Arquivo:** `__tests__/lib/rag/ingest/pipeline-integration.test.ts`

```
TESTE 1.6 — Pipeline completo: texto → chunks enriquecidos no banco
  Input: Texto simulado de PDF de plano de saúde (~5 páginas)
  Fluxo: pdf-analyzer → smart-chunker → contextual-retrieval + tag-inferencer → embedding-generator
  Esperado:
    - file_items criados com: content, document_context, tags (não vazio),
      section_type (não null), page_number, weight (default 1.0), openai_embedding (não null)
    - files atualizado com: file_embedding (não null), file_tags (não vazio),
      ingestion_status = 'done'
    - collections atualizado com: collection_embedding (não null)
  Valida: Pipeline end-to-end funciona

TESTE 1.7 — API /api/files/analyze retorna pré-análise
  Input: POST com texto de PDF
  Esperado: HTTP 200, JSON com campos de pré-análise
  Valida: Endpoint funcional

TESTE 1.8 — API /api/files/rechunk processa corretamente
  Input: POST com file_id + novos parâmetros de chunking
  Esperado: HTTP 200, chunks antigos deletados, novos criados com tags e contexto
  Valida: Re-chunking funcional

TESTE 1.9 — Compatibilidade: upload sem pré-análise (Nível 1)
  Input: Upload de arquivo pela rota existente (process/route.ts) sem dados Nível 3
  Esperado: Arquivo processado normalmente, campos Nível 3 ficam null/default
  Valida: Regressão zero para fluxo existente
```

#### Testes de Validação em Banco (Claude Code executa via SQL)

```
TESTE 1.10 — Após upload Nível 3, verificar dados no banco
  Queries:
    SELECT count(*) FROM file_items WHERE file_id = :id AND tags != '{}'
      → Esperado: > 80% dos chunks têm tags
    SELECT count(*) FROM file_items WHERE file_id = :id AND document_context IS NOT NULL
      → Esperado: 100% dos chunks têm contexto
    SELECT file_embedding IS NOT NULL FROM files WHERE id = :id
      → Esperado: true
    SELECT ingestion_status FROM files WHERE id = :id
      → Esperado: 'done'
```

#### Validação Manual (Operador)

```
MANUAL 1.1 — Upload de PDF real de plano de saúde
  Ação: Fazer upload de um PDF real pela rota de processamento
  Verificar: No banco, file_items têm tags, document_context, section_type preenchidos

MANUAL 1.2 — Upload de arquivo antigo (não-PDF, ex: TXT)
  Ação: Upload de arquivo .txt simples
  Verificar: Processamento funciona como antes (Nível 1), sem erros

MANUAL 1.3 — Chat com busca funciona igual
  Ação: Fazer uma pergunta no chat sobre planos
  Verificar: Resultados normais, sem degradação
```

#### Gate de Aprovação — Fase 1

- [ ] Todos os TESTES 1.1a a 1.10 passam
- [ ] `npm run type-check` passa
- [ ] `npm test` (suite existente + novos testes) passa
- [ ] MANUAL 1.1 a 1.3 confirmados
- [ ] Ao menos 1 arquivo processado com dados Nível 3 no banco (necessário para Fase 2)

---

## Fase 2: Pipeline de Busca Nível 3

**PRD ref:** Seção 4 (linha 372) + Seção 5 (linha 440) + Fases de Implementação (linha 1274)
**Duração estimada:** 2 semanas
**Dependências:** Fase 1 completa (gate aprovado) + ao menos 1 arquivo com dados Nível 3

### Ordem de implementação interna

```
2.1 query-classifier.ts        (sem dependência interna)
2.2 collection-selector.ts     (sem dependência interna)
2.3 file-selector.ts           (sem dependência interna)
2.4 retrieve-adaptive.ts       (depende de 2.1, 2.2, 2.3)
2.5 rerank-chunks.ts           (depende de 2.4)
2.6 search-plans-graph.ts mod  (depende de 2.4, 2.5 — integração)
2.7 benchmark de latência      (depende de 2.6)
```

**Paralelismo possível:** 2.1, 2.2 e 2.3 podem ser feitos em paralelo.

### Entregas

| # | Tarefa | Arquivos | PRD ref |
|---|--------|----------|---------|
| 2.1 | Classificador de query (extrair tags e collection_hint da pergunta do usuário) | `lib/agents/health-plan-v2/intent/query-classifier.ts` | Seção 5, linha 450 |
| 2.2 | Seletor de collections (filtrar collections por embedding similarity) | `lib/rag/search/collection-selector.ts` | Seção 4, linha 400 |
| 2.3 | Seletor de arquivos (filtrar arquivos por file_tags e file_embedding) | `lib/rag/search/file-selector.ts` | Seção 4, linha 410 |
| 2.4 | Retrieve adaptativo (busca vetorial apenas nos chunks filtrados, com boost por tag) | `lib/agents/health-plan-v2/nodes/rag/retrieve-adaptive.ts` | Seção 5, linha 470 |
| 2.5 | Re-ranking (top-20 → top-8 com relevância para o perfil do cliente) | `lib/agents/health-plan-v2/nodes/rag/rerank-chunks.ts` | Seção 5, linha 500 |
| 2.6 | Atualizar search-plans-graph com feature flag `USE_RAG_LEVEL3` | `lib/agents/health-plan-v2/graphs/search-plans-graph.ts` | Seção 5, linha 520 |
| 2.7 | Benchmark de latência (meta: <15s com 2-3 chamadas LLM) | Teste E2E | Seção 5, linha 530 |

### Testes de Validação — Fase 2

#### Testes Unitários (Claude Code executa)

**Arquivo:** `__tests__/lib/agents/health-plan-v2/intent/query-classifier.test.ts`

```
TESTE 2.1a — query sobre preço extrai tag correta
  Input: "Quanto custa o plano Bradesco Flex?"
  Esperado: { tags: ["preco"], collection_hint: "Bradesco", intent: "busca_preco" }
  Valida: Extração de tags + collection hint

TESTE 2.1b — query sobre cobertura
  Input: "O plano cobre dentista?"
  Esperado: { tags: ["cobertura"] ou ["cobertura_dental"], intent: "busca_cobertura" }
  Valida: Tags de cobertura

TESTE 2.1c — query genérica sem hint
  Input: "Me fale sobre os planos disponíveis"
  Esperado: { tags: [], collection_hint: null, intent: "busca_geral" }
  Valida: Graceful handling de query ampla

TESTE 2.1d — query com contexto de conversa
  Input: query "E o preço?" + mensagens anteriores mencionando "Unimed"
  Esperado: collection_hint: "Unimed" (inferido do contexto)
  Valida: Contexto da conversa influencia classificação

TESTE 2.1e — latência < 2s
  Input: Qualquer query
  Esperado: Resposta em < 2000ms
  Valida: Performance aceitável (budget: 1s no PRD)
```

**Arquivo:** `__tests__/lib/rag/search/collection-selector.test.ts`

```
TESTE 2.2a — seleciona collection por embedding similarity
  Input: Query embedding + 3 collections com embeddings
  Esperado: Collections acima do threshold retornadas, ordenadas por score
  Valida: Filtragem por cosine similarity

TESTE 2.2b — collection_hint prioriza collection correta
  Input: Query embedding + collection_hint: "Bradesco" + collections ["Bradesco Saúde", "Unimed", "SulAmérica"]
  Esperado: "Bradesco Saúde" no topo, independente do score
  Valida: Hint sobrescreve score

TESTE 2.2c — sem collections acima do threshold
  Input: Query muito específica, embeddings distantes
  Esperado: Threshold relaxado (fallback), retorna ao menos 1 collection
  Valida: Fallback adaptativo (PRD seção 5.3)

TESTE 2.2d — zero chamadas LLM
  Input: Qualquer cenário
  Esperado: Nenhuma chamada a OpenAI Chat API (apenas embedding)
  Valida: Passo 2 é puramente vetorial
```

**Arquivo:** `__tests__/lib/rag/search/file-selector.test.ts`

```
TESTE 2.3a — seleciona arquivos por embedding + tags
  Input: Query embedding + tags ["preco"] + 5 arquivos com file_embedding
  Esperado: Arquivos com file_tags contendo "preco" recebem boost
  Valida: Tag boost funciona no nível de arquivo

TESTE 2.3b — limita a top-10 arquivos
  Input: 20 arquivos disponíveis
  Esperado: Máximo 10 retornados
  Valida: Limite de pré-filtragem

TESTE 2.3c — chama RPC match_files_by_embedding
  Input: Dados válidos
  Esperado: RPC chamada com parâmetros corretos (query_embedding, assistant_id, min_similarity)
  Valida: Integração com banco
```

**Arquivo:** `__tests__/lib/agents/health-plan-v2/nodes/rag/retrieve-adaptive.test.ts`

```
TESTE 2.4a — pipeline completo: query → chunks filtrados
  Input: Query + assistantId com collections/files com dados Nível 3
  Esperado: Retorna chunks APENAS dos arquivos pré-filtrados (não de todos)
  Valida: Pré-filtragem funciona end-to-end

TESTE 2.4b — weighted score aplicado
  Input: Chunks com tags ["preco"], query com tag "preco", tag_weight preco=2.0
  Esperado: weighted_score > base_similarity para esses chunks
  Valida: Boost por tag funciona

TESTE 2.4c — retorna máximo 20 chunks
  Input: Muitos arquivos com muitos chunks
  Esperado: Exatamente top-20 por weighted_score
  Valida: Limite de retrieval
```

**Arquivo:** `__tests__/lib/agents/health-plan-v2/nodes/rag/rerank-chunks.test.ts`

```
TESTE 2.5a — re-rank top-20 → top-8
  Input: 20 chunks + query + perfil do cliente (idade: 30, cidade: "São Paulo")
  Esperado: 8 chunks retornados, reordenados por relevância contextual
  Valida: Redução e reordenação

TESTE 2.5b — perfil do cliente influencia ranking
  Input: 20 chunks (mix de preço e cobertura) + perfil com orçamento baixo
  Esperado: Chunks de preço tendem a ficar mais altos no ranking
  Valida: Personalização por perfil

TESTE 2.5c — latência < 3s
  Input: 20 chunks
  Esperado: Resposta em < 3000ms
  Valida: Budget de 2s no PRD para re-ranking
```

#### Testes de Integração (Claude Code executa)

**Arquivo:** `__tests__/lib/agents/health-plan-v2/graphs/search-plans-graph-v3.test.ts`

```
TESTE 2.6a — feature flag USE_RAG_LEVEL3=true usa pipeline Nível 3
  Setup: env USE_RAG_LEVEL3=true + arquivo com dados Nível 3 no banco
  Input: Query de busca de plano
  Esperado: Pipeline de 7 passos executado (classificação → seleção → retrieve → rerank → grade → format)
  Valida: Integração completa do novo pipeline

TESTE 2.6b — feature flag USE_RAG_LEVEL3=false usa pipeline Nível 1
  Setup: env USE_RAG_LEVEL3=false
  Input: Mesma query
  Esperado: Pipeline antigo (retrieve-simple → grade-documents → grade-by-collection)
  Valida: Fallback funciona

TESTE 2.6c — arquivo sem dados Nível 3 faz fallback automático
  Setup: USE_RAG_LEVEL3=true, mas arquivo sem tags/document_context
  Input: Query que atingiria esse arquivo
  Esperado: Sistema detecta ausência de dados Nível 3 e usa pipeline Nível 1
  Valida: Graceful degradation para dados legados

TESTE 2.6d — contagem de chamadas LLM ≤ 3
  Setup: USE_RAG_LEVEL3=true + dados Nível 3
  Input: Query padrão
  Esperado: Máximo 3 chamadas LLM (classificação + re-rank + grading)
  Valida: Meta de eficiência do PRD (vs 8-10 no Nível 1)
```

#### Benchmark de Latência (Claude Code executa)

**Arquivo:** `__tests__/benchmarks/search-latency.test.ts`

```
TESTE 2.7a — latência end-to-end < 15s (P50)
  Setup: 5+ arquivos com dados Nível 3
  Input: 10 queries variadas (preço, cobertura, rede, genérica)
  Esperado: Mediana das latências < 15.000ms
  Valida: Meta principal do PRD

TESTE 2.7b — latência end-to-end < 20s (P95)
  Setup: Mesmo
  Esperado: P95 < 20.000ms
  Valida: Tail latency aceitável

TESTE 2.7c — comparação Nível 1 vs Nível 3
  Setup: Mesmos arquivos, mesmas queries
  Esperado: Nível 3 é ao menos 3x mais rápido que Nível 1
  Valida: Melhoria mensurável
  Nota: Este teste é informativo, não bloqueante
```

#### Validação Manual (Operador)

```
MANUAL 2.1 — Busca sobre preço de operadora específica
  Ação: No chat, perguntar "Quanto custa o plano da Bradesco?"
  Verificar: Resposta em < 15s, menciona preços corretos, não inclui dados de outras operadoras

MANUAL 2.2 — Busca genérica
  Ação: "Me recomende um plano para uma pessoa de 30 anos em São Paulo"
  Verificar: Resposta em < 20s, considera múltiplas operadoras

MANUAL 2.3 — Busca sequencial (contexto)
  Ação: Perguntar "Me fale da Unimed" → depois "E o preço?"
  Verificar: Segunda resposta usa contexto (fala de preço da Unimed, não genérico)

MANUAL 2.4 — Fallback para Nível 1
  Ação: Setar USE_RAG_LEVEL3=false, repetir busca
  Verificar: Busca funciona (mais lenta, mas funcional)
```

#### Gate de Aprovação — Fase 2

- [ ] Todos os TESTES 2.1a a 2.7c passam
- [ ] `npm run type-check` passa
- [ ] `npm test` passa (inclusive testes existentes — zero regressão)
- [ ] Benchmark: P50 < 15s, LLM calls ≤ 3
- [ ] MANUAL 2.1 a 2.4 confirmados
- [ ] Feature flag testada em ambos os estados (on/off)

---

## Fase 3A: Interface de Gestão (Tags + Chunks Viewer)

**PRD ref:** Seção 2 (linha 219) + Seção 7 (linha 771)
**Duração estimada:** 1 semana
**Dependências:** Fase 0 completa (schema de tags)
**Pode ser paralela com:** Fase 1 e início da Fase 2

### Entregas

| # | Tarefa | Arquivos | PRD ref |
|---|--------|----------|---------|
| 3.1 | CRUD de tags (API) | `app/api/tags/route.ts` | Seção 3, linha 340 |
| 3.2 | Tela de gestão de tags (tabela, criação, hierarquia) | `components/tags/TagTable.tsx`, `TagCreateModal.tsx`, `TagHierarchyView.tsx` | Seção 7, linha 800 |
| 3.3 | Página admin de tags | `app/[locale]/[workspaceid]/admin/tags/page.tsx` | Seção 7, linha 810 |
| 3.6 | Visualização de chunks por arquivo (lista, agrupamento por seção, filtro) | `components/files/chunks/ChunkList.tsx`, `ChunkCard.tsx`, `SectionSidebar.tsx` | Seção 2, linha 230 |
| 3.7 | Edição de chunks (trocar tag, ajustar peso, editar conteúdo) | `components/files/chunks/ChunkEditModal.tsx` | Seção 2, linha 260 |
| 3.9 | Página de chunks de um arquivo | `app/[locale]/[workspaceid]/files/[fileId]/chunks/page.tsx` | Seção 7, linha 870 |
| 3.10 | Badges de qualidade na listagem de arquivos | Componente de listagem existente | Seção 7, linha 880 |

### Testes de Validação — Fase 3A

#### Testes Automatizados (Claude Code executa)

**Arquivo:** `__tests__/app/api/tags/route.test.ts`

```
TESTE 3.1a — GET /api/tags retorna tags do workspace
  Input: GET com workspace_id no header/query
  Esperado: HTTP 200, array com 9+ tags (sistema + customizadas)
  Valida: Listagem funcional

TESTE 3.1b — POST /api/tags cria tag customizada
  Input: POST { name: "Dental", slug: "dental", weight_boost: 1.5, color: "#ff0000" }
  Esperado: HTTP 201, tag criada com UUID
  Valida: Criação funcional

TESTE 3.1c — PUT /api/tags/:id atualiza tag
  Input: PUT { weight_boost: 2.0 }
  Esperado: HTTP 200, weight_boost atualizado
  Valida: Atualização

TESTE 3.1d — DELETE /api/tags/:id deleta tag customizada
  Input: DELETE tag customizada
  Esperado: HTTP 200
  Valida: Deleção

TESTE 3.1e — DELETE /api/tags/:id bloqueia deleção de tag do sistema
  Input: DELETE tag com is_system=true
  Esperado: HTTP 403 ou 400
  Valida: Proteção de tags do sistema

TESTE 3.1f — POST com slug duplicado retorna erro
  Input: POST { slug: "preco" } (já existe)
  Esperado: HTTP 409 (conflict)
  Valida: Unicidade de slug
```

**Arquivo:** `__tests__/components/tags/TagTable.test.tsx`

```
TESTE 3.2a — TagTable renderiza lista de tags
  Input: Array de tags mockadas
  Esperado: Tabela com colunas: Nome, Slug, Peso, Tag Pai, Uso (count)
  Valida: Renderização básica

TESTE 3.2b — TagCreateModal submete formulário
  Input: Preencher campos e clicar "Criar"
  Esperado: Callback onSubmit chamado com dados corretos
  Valida: Formulário funcional

TESTE 3.2c — TagHierarchyView mostra árvore
  Input: Tags com parent_tag_id (hierarquia)
  Esperado: Tags filhas indentadas sob tags pai
  Valida: Visualização hierárquica
```

**Arquivo:** `__tests__/components/files/chunks/ChunkList.test.tsx`

```
TESTE 3.6a — ChunkList renderiza chunks agrupados por seção
  Input: Array de chunks com section_type variados
  Esperado: Agrupamento visual por seção, contagem por grupo
  Valida: Agrupamento funciona

TESTE 3.6b — ChunkCard exibe metadados
  Input: Chunk com content, tags, weight, page_number, document_context
  Esperado: Todos os campos visíveis; botão "Ver contexto" mostra document_context
  Valida: Card completo

TESTE 3.7a — ChunkEditModal permite trocar tag
  Input: Chunk com tag "preco", dropdown com todas as tags
  Esperado: Seleção de nova tag dispara callback de atualização
  Valida: Edição de tag inline

TESTE 3.7b — ChunkEditModal permite ajustar peso
  Input: Chunk com weight 1.0, slider
  Esperado: Slider de 0.5 a 3.0, incrementos de 0.1
  Valida: Ajuste de peso
```

#### Validação Manual (Operador)

```
MANUAL 3A.1 — Navegar para /admin/tags
  Ação: Acessar a página de gestão de tags
  Verificar: 9 tags do sistema listadas com cores, pesos, contagem de uso

MANUAL 3A.2 — Criar tag customizada
  Ação: Criar tag "Odontológico" com peso 1.7
  Verificar: Tag aparece na lista, disponível para uso

MANUAL 3A.3 — Visualizar chunks de um arquivo
  Ação: Navegar para /files/:fileId/chunks (arquivo com dados Nível 3)
  Verificar: Chunks agrupados por seção, tags visíveis, sidebar de navegação funciona

MANUAL 3A.4 — Editar tag de um chunk
  Ação: Clicar na tag de um chunk e trocar para outra
  Verificar: Tag atualizada no banco, badge reflete mudança

MANUAL 3A.5 — Ver contexto posicional
  Ação: Clicar "Ver contexto" em um chunk
  Verificar: Parágrafo de document_context exibido
```

#### Gate de Aprovação — Fase 3A

- [ ] Todos os TESTES 3.1a a 3.7b passam
- [ ] `npm run type-check` passa
- [ ] MANUAL 3A.1 a 3A.5 confirmados
- [ ] Páginas novas acessíveis sem erros de runtime

---

## Fase 3B: Interface de Upload com Pré-análise

**PRD ref:** Seção 7 (linha 771)
**Duração estimada:** 1 semana
**Dependências:** Fase 1 completa (API de pré-análise disponível)

### Entregas

| # | Tarefa | Arquivos | PRD ref |
|---|--------|----------|---------|
| 3.4 | Upload com pré-análise (step de revisão antes de confirmar) | `components/files/upload/PreAnalysisStep.tsx`, `ConfirmationStep.tsx` | Seção 7, linha 830 |
| 3.5 | Integrar novos steps no modal de upload existente | `components/sidebar/items/all/sidebar-create-item.tsx` (ou equivalente) | Seção 7, linha 850 |
| 3.8 | Re-chunking por arquivo | `components/files/chunks/ReChunkModal.tsx` | Seção 2, linha 280 |

### Testes de Validação — Fase 3B

#### Testes Automatizados (Claude Code executa)

```
TESTE 3.4a — PreAnalysisStep exibe dados da pré-análise
  Input: Resultado mockado de /api/files/analyze
  Esperado: Nome sugerido, descrição, operadora, seções detectadas, tags sugeridas visíveis
  Valida: Renderização dos dados de pré-análise

TESTE 3.4b — ConfirmationStep permite editar sugestões
  Input: Dados de pré-análise
  Esperado: Campos editáveis (nome, descrição, chunk_size, tags)
  Valida: Operador pode corrigir sugestões do LLM

TESTE 3.5a — Modal de upload integra novos steps
  Input: Fluxo de upload
  Esperado: Fases sequenciais: Upload → Análise (loading) → Confirmação → Processamento
  Valida: Integração no fluxo existente

TESTE 3.8a — ReChunkModal exibe parâmetros atuais e permite alteração
  Input: Arquivo com chunk_size=3000
  Esperado: Mostra valores atuais, permite alterar, estimativa de novo número de chunks
  Valida: Modal funcional
```

#### Validação Manual (Operador)

```
MANUAL 3B.1 — Upload completo com pré-análise
  Ação: Arrastar PDF de plano de saúde no modal de upload
  Verificar:
    - Fase 1 (upload): arquivo enviado
    - Fase 2 (análise): skeleton loading ~5s, depois mostra sugestões
    - Fase 3 (confirmação): nome, descrição, tags editáveis
    - Fase 4 (processamento): progress bar, chunks sendo criados
    - Resultado: arquivo com chunks enriquecidos no banco

MANUAL 3B.2 — Editar sugestões antes de confirmar
  Ação: Na fase de confirmação, mudar o nome e adicionar uma tag
  Verificar: Mudanças refletidas no arquivo criado

MANUAL 3B.3 — Re-chunking de arquivo existente
  Ação: Na tela de chunks, clicar "Re-chunkar", mudar chunk_size de 3000 para 1500
  Verificar: Chunks antigos deletados, novos chunks criados (mais chunks, menores)
```

#### Gate de Aprovação — Fase 3B

- [ ] Testes 3.4a a 3.8a passam
- [ ] MANUAL 3B.1 a 3B.3 confirmados
- [ ] Upload com pré-análise funcional end-to-end
- [ ] Upload simples (sem pré-análise) continua funcionando

---

## Fase 4: Migração de Dados e Go-Live

**PRD ref:** Fases de Implementação (linha 1324)
**Duração estimada:** 1 semana
**Dependências:** Fases 1, 2, 3A e 3B completas (todos os gates aprovados)

### Entregas

| # | Tarefa | Arquivos | PRD ref |
|---|--------|----------|---------|
| 4.1 | Script: inferir tags para chunks existentes | `scripts/migrate-chunks-level3.ts` | Linha 1331 |
| 4.2 | Script: gerar file_embedding para arquivos existentes | `scripts/migrate-file-embeddings.ts` | Linha 1332 |
| 4.3 | Script: gerar collection_embedding | `scripts/migrate-collection-embeddings.ts` | Linha 1333 |
| 4.4 | Desativar feature flag Nível 1 | `search-plans-graph.ts` + env var | Linha 1334 |
| 4.5 | Benchmark latência antes/depois com 20+ documentos | Relatório | Linha 1335 |
| 4.6 | Ajuste de thresholds e pesos baseado em dados reais | Configuração | Linha 1336 |
| 4.7 | Documentação de operação | `.taskmaster/docs/` | Linha 1337 |

### Testes de Validação — Fase 4

#### Testes Automatizados (Claude Code executa)

**Arquivo:** `__tests__/scripts/migration-validation.test.ts`

```
TESTE 4.1a — Todos os chunks existentes têm tags
  Query: SELECT count(*) FROM file_items WHERE tags = '{}' OR tags IS NULL
  Esperado: 0 (nenhum chunk sem tags)
  Valida: Script 4.1 migrou todos os chunks

TESTE 4.1b — Distribuição de tags faz sentido
  Query: SELECT unnest(tags) as tag, count(*) FROM file_items GROUP BY tag ORDER BY count DESC
  Esperado: Pelo menos 5 tags distintas usadas; nenhuma tag com 100% dos chunks
  Valida: Tags diversificadas (não todas "regras_gerais")

TESTE 4.2a — Todos os arquivos têm file_embedding
  Query: SELECT count(*) FROM files WHERE file_embedding IS NULL
  Esperado: 0
  Valida: Script 4.2 migrou todos os arquivos

TESTE 4.3a — Todas as collections têm collection_embedding
  Query: SELECT count(*) FROM collections WHERE collection_embedding IS NULL
  Esperado: 0
  Valida: Script 4.3 migrou todas as collections

TESTE 4.4a — Feature flag desativada = pipeline Nível 3 por padrão
  Setup: USE_RAG_LEVEL3 não definida ou true
  Input: Query de busca
  Esperado: Pipeline Nível 3 executado
  Valida: Default é Nível 3

TESTE 4.4b — Busca funciona sem feature flag de fallback
  Setup: Remover USE_RAG_LEVEL3 do env
  Input: Query variada
  Esperado: Busca funciona, resultados corretos
  Valida: Sistema opera sem necessidade de flag
```

#### Benchmark Final (Claude Code executa)

**Arquivo:** `__tests__/benchmarks/final-benchmark.test.ts`

```
TESTE 4.5a — Latência P50 com 20+ documentos < 15s
  Setup: Banco com todos os documentos migrados (20+)
  Input: 20 queries variadas
  Esperado: Mediana < 15.000ms
  Valida: Meta principal do PRD

TESTE 4.5b — Latência P95 com 20+ documentos < 20s
  Esperado: P95 < 20.000ms

TESTE 4.5c — Chamadas LLM por busca ≤ 3
  Input: 20 queries
  Esperado: Média ≤ 3.0 chamadas LLM por query
  Valida: Eficiência de LLM

TESTE 4.5d — Precision@5 > 80%
  Setup: Golden dataset de 10 queries com chunks esperados
  Input: 10 queries do golden dataset
  Esperado: Para cada query, ≥ 4 dos top-5 chunks são relevantes
  Valida: Qualidade de retrieval
  Nota: Requer golden dataset manual (avaliação humana)

TESTE 4.5e — Comparação Nível 1 → Nível 3
  Input: Mesmas 20 queries com ambos pipelines
  Saída: Tabela comparativa de latência e chamadas LLM
  Valida: Melhoria mensurável e documentável
```

#### Validação Manual (Operador — Go-Live Checklist)

```
MANUAL 4.1 — Verificar arquivo legado migrado
  Ação: Abrir um arquivo que existia antes da migração em /files/:id/chunks
  Verificar: Chunks têm tags atribuídas, pesos default, section_type preenchido

MANUAL 4.2 — Busca de plano com 20+ documentos
  Ação: "Preciso de um plano empresarial em São Paulo para 50 funcionários"
  Verificar:
    - Resposta em < 15s
    - Menciona operadoras relevantes
    - Não inclui planos individuais (filtro por tag funciona)

MANUAL 4.3 — Busca sequencial com contexto
  Ação: "Me fale da Unimed" → "E o preço?" → "Tem cobertura dental?"
  Verificar: Cada resposta builds on contexto anterior, latência consistente

MANUAL 4.4 — Novo upload pós-migração
  Ação: Upload de PDF novo
  Verificar: Passa por pré-análise, chunks com tags/contexto, funciona na busca

MANUAL 4.5 — Stress test informal
  Ação: 5 queries em sequência rápida (< 30s entre elas)
  Verificar: Sistema não degrada, cada resposta < 20s
```

#### Gate de Aprovação — Fase 4 (Go-Live)

- [ ] TESTES 4.1a a 4.5e passam
- [ ] Benchmark P50 < 15s confirmado
- [ ] Benchmark LLM calls ≤ 3 confirmado
- [ ] MANUAL 4.1 a 4.5 confirmados
- [ ] Zero regressão: `npm test` completo passa
- [ ] `npm run type-check` passa
- [ ] `npm run build` produção passa sem erros

---

## Métricas de Sucesso

| Métrica | Nível 1 (atual) | Meta Nível 3 | Onde testar | PRD ref |
|---------|-----------------|-------------|-------------|---------|
| Latência busca P50 | 71-81s | <15s | TESTE 4.5a | Linha 1420 |
| Latência busca P95 | >90s | <20s | TESTE 4.5b | Linha 1420 |
| Chamadas LLM por busca | 8-10 | ≤3 | TESTE 4.5c | Linha 1421 |
| Escala (documentos) | 4-5 | 20-30 | TESTE 4.5a (com 20+ docs) | Linha 1422 |
| Chunks com tags | 0% | 100% | TESTE 4.1a | Linha 1423 |
| Chunks com contexto posicional | 0% | 100% | TESTE 1.10 | Linha 1424 |
| Pre-filtragem ativa | Não | Sim (3 camadas) | TESTE 2.6a | Linha 1425 |
| Upload com pré-análise | Não | Sim | MANUAL 3B.1 | Linha 1426 |
| UI de gestão de chunks | Não | Sim | MANUAL 3A.3 | Linha 1427 |
| Precision@5 | não medido | >80% | TESTE 4.5d | Linha 1428 |

---

## Resumo: Ordem de Execução com Gates

```
┌─────────────────────────────────────────────────────────────────────┐
│  Fase 0: Schema (1 semana)                                          │
│  Gate: migrations ok + testes existentes passam + tipo-check ok     │
└─────────────────┬───────────────────────────────────┬───────────────┘
                  │                                   │
                  ▼                                   ▼
┌─────────────────────────────────┐  ┌────────────────────────────────┐
│  Fase 1: Ingestão (2 semanas)   │  │  Fase 3A: UI Tags+Chunks      │
│  Gate: upload Nível 3 funciona  │  │  (1 semana, paralela)          │
│  + arquivo com dados no banco   │  │  Gate: CRUD + viewer funcional │
└─────────────────┬───────────────┘  └────────────────┬───────────────┘
                  │                                   │
                  ▼                                   ▼
┌─────────────────────────────────┐  ┌────────────────────────────────┐
│  Fase 2: Busca (2 semanas)      │  │  Fase 3B: UI Upload            │
│  Gate: P50<15s + LLM≤3         │  │  (1 semana, após Fase 1)       │
│  + feature flag testada         │  │  Gate: upload com pré-análise  │
└─────────────────┬───────────────┘  └────────────────┬───────────────┘
                  │                                   │
                  ├───────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Fase 4: Migração + Go-Live (1 semana)                              │
│  Gate: todos os dados migrados + benchmark final + go-live checklist│
└─────────────────────────────────────────────────────────────────────┘
```

**Total estimado: 5-6 semanas** (vs 6-7 semanas se Fase 3 fosse sequencial)
