# Guia de Implementação — RAG Nível 3

**Referência:** `rag-level3-maturity-prd.md` (PRD completo)
**Data:** 2026-03-20

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

**Critério de aceite:** Migrations executam sem erro, sistema atual continua funcionando (campos nullable com defaults).

---

## Fase 1: Pipeline de Ingestão

**PRD ref:** Seção 1 (linha 102) + Fases de Implementação (linha 1247)
**Duração estimada:** 2 semanas
**Dependências:** Fase 0 completa

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

**Critério de aceite:** Upload de PDF real → chunks com tags, contexto posicional, embeddings de file e collection gerados. Arquivos antigos continuam funcionando.

---

## Fase 2: Pipeline de Busca Nível 3

**PRD ref:** Seção 4 (linha 372) + Seção 5 (linha 440) + Fases de Implementação (linha 1274)
**Duração estimada:** 2 semanas
**Dependências:** Fase 1 completa (ao menos 1 arquivo com dados Nível 3)

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

**Critério de aceite:** Busca com documentos Nível 3 em <15s, qualidade igual ou superior ao Nível 1. Feature flag permite fallback para Nível 1.

---

## Fase 3: Interface de Gestão

**PRD ref:** Seção 2 (linha 219) + Seção 7 (linha 771) + Fases de Implementação (linha 1301)
**Duração estimada:** 2 semanas
**Dependências:** Fase 0 completa (schema de tags). Pode ser feita em paralelo com Fases 1 e 2.

### Entregas

| # | Tarefa | Arquivos | PRD ref |
|---|--------|----------|---------|
| 3.1 | CRUD de tags (API) | `app/api/tags/route.ts` | Seção 3, linha 340 |
| 3.2 | Tela de gestão de tags (tabela, criação, hierarquia) | `components/tags/TagTable.tsx`, `TagCreateModal.tsx`, `TagHierarchyView.tsx` | Seção 7, linha 800 |
| 3.3 | Página admin de tags | `app/[locale]/[workspaceid]/admin/tags/page.tsx` | Seção 7, linha 810 |
| 3.4 | Upload com pré-análise (step de revisão antes de confirmar) | `components/files/upload/PreAnalysisStep.tsx`, `ConfirmationStep.tsx` | Seção 7, linha 830 |
| 3.5 | Integrar novos steps no modal de upload existente | `components/sidebar/items/all/sidebar-create-item.tsx` (ou equivalente) | Seção 7, linha 850 |
| 3.6 | Visualização de chunks por arquivo (lista, agrupamento por seção, filtro) | `components/files/chunks/ChunkList.tsx`, `ChunkCard.tsx`, `SectionSidebar.tsx` | Seção 2, linha 230 |
| 3.7 | Edição de chunks (trocar tag, ajustar peso, editar conteúdo) | `components/files/chunks/ChunkEditModal.tsx` | Seção 2, linha 260 |
| 3.8 | Re-chunking por arquivo | `components/files/chunks/ReChunkModal.tsx` | Seção 2, linha 280 |
| 3.9 | Página de chunks de um arquivo | `app/[locale]/[workspaceid]/files/[fileId]/chunks/page.tsx` | Seção 7, linha 870 |
| 3.10 | Badges de qualidade na listagem de arquivos | Componente de listagem existente | Seção 7, linha 880 |

**Critério de aceite:** Operador faz upload com pré-análise, visualiza chunks por arquivo, edita tags/pesos, gerencia tags customizadas.

---

## Fase 4: Migração de Dados e Go-Live

**PRD ref:** Fases de Implementação (linha 1324)
**Duração estimada:** 1 semana
**Dependências:** Fases 1, 2 e 3 completas

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

**Critério de aceite:** Todos os arquivos com embeddings e tags Nível 3, latência <15s em produção, feature flag desativada.

---

## Métricas de Sucesso

| Métrica | Nível 1 (atual) | Meta Nível 3 | PRD ref |
|---------|-----------------|-------------|---------|
| Latência busca | 71-81s | <15s | Linha 1420 |
| Chamadas LLM por busca | 8-10 | 2-3 | Linha 1421 |
| Escala (documentos) | 4-5 | 20-30 | Linha 1422 |
| Chunks com tags | 0% | 100% | Linha 1423 |
| Chunks com contexto posicional | 0% | 100% | Linha 1424 |
| Pre-filtragem ativa | Não | Sim (3 camadas) | Linha 1425 |
| Upload com pré-análise | Não | Sim | Linha 1426 |
| UI de gestão de chunks | Não | Sim | Linha 1427 |

---

## Ordem de execução recomendada

```
Fase 0 (banco) ──────────────────┐
                                  ├──→ Fase 1 (ingestão) ──→ Fase 2 (busca) ──→ Fase 4 (migração)
Fase 3 (UI) pode ser paralela ──┘
```

Fase 3 (UI) pode ser desenvolvida em paralelo com Fases 1 e 2 pois depende apenas do schema (Fase 0), não do pipeline.
