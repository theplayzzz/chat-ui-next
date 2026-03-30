# QA Test Plan — RAG Level 4

## Ferramentas de Teste

| Ferramenta | Finalidade |
|------------|-----------|
| **Playwright** | Automacao de testes no frontend (headless Chromium) |
| **Supabase MCP** | Validacao direta no banco de dados (queries SQL) |
| **Screenshots** | Evidencia visual de cada etapa |

### Como rodar Playwright

```bash
cd __tests__/playwright-test
npx playwright test <arquivo>.spec.ts --project=chromium --reporter=list
```

Screenshots sao salvos em `__tests__/playwright-test/screenshots/`.

### Como usar Supabase MCP

Via Claude Code, usar o tool `mcp__supabase__execute_sql` com queries SQL para validar dados no banco.

---

## Mapa da Interface (Coordenadas Playwright)

```
URL base: https://chat-ui-next.vercel.app
Login: play-felix@hotmail.com (magic link, sem senha)

Landing Page:
  [Start Chatting] → /login

Login Page:
  input email → preencher → [Entrar] → /78fb784a-.../chat

Chat Page:
  ┌─────────┬──────────────────────────────────────┐
  │ Icons   │ Sidebar (aparece apos clicar >)      │
  │ laterais│                                      │
  │         │ [+ New File] / [+ New Chat] etc      │
  │ y=12  ◉ │ Chat list / Files list / etc         │
  │ y=68  ◎ │                                      │
  │ y=124 ◎ │                                      │
  │ y=180 ◎ │                                      │
  │ y=236 ◎ │ ← FILES (icon 3, y=236)              │
  │ y=292 ◎ │ ← COLLECTIONS (icon 4, y=292)        │
  │ y=348 ◎ │                                      │
  │ y=396 ◎ │                                      │
  │         │                                      │
  │ y=660 ◎ │ ← PROFILE                            │
  ├─────────┤                                      │
  │ [>]     │ Toggle sidebar (x=20, y=375)         │
  └─────────┴──────────────────────────────────────┘
  │                                                │
  │              Chatbot UI (area central)         │
  │                                                │
  │  ┌─[⊕]─────────────────────────────────[▶]─┐  │
  │  │ Ask anything. Type @ / # !               │  │
  │  └──────────────────────────────────────────┘  │
  │   ⊕ = upload via chat (x=455, y=657)          │
  └────────────────────────────────────────────────┘
```

### Navegacao Playwright

```typescript
// Login
await page.goto(BASE_URL);
await page.locator('text=Start Chatting').click();
await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
await page.locator('button:has-text("Entrar")').click();
await page.waitForTimeout(5000);

// Abrir sidebar
await page.mouse.click(20, 375);

// Ir para Files
await page.mouse.click(28, 236);

// Ir para Collections
await page.mouse.click(28, 292);

// Clicar "+ New File"
await page.locator('button:has-text("New File")').click();

// Upload via chat (+)
await page.locator('input[type="file"]').first().setInputFiles(filePath);
```

---

## PROBLEMA CRITICO ENCONTRADO

**Migrations Level 3 NAO aplicadas no banco hosted.**

Colunas FALTANDO na tabela `file_items`:
- `section_type` (TEXT)
- `weight` (NUMERIC)
- `page_number` (INTEGER)
- `document_context` (TEXT)

Tabela FALTANDO:
- `chunk_tags`

Colunas FALTANDO em `files`:
- `file_embedding` (vector)

Colunas FALTANDO em `collections`:
- `collection_embedding` (vector)

**Impacto:** O Level 3 enrichment (tags, contexto, peso, embeddings por arquivo/collection) NAO funciona. Os chunks sao criados apenas com conteudo + embedding basico.

**Migrations pendentes** (devem ser aplicadas antes dos testes):
```
supabase/migrations/20260321000001_add_rag_level3_file_items.sql
supabase/migrations/20260321000002_create_chunk_tags.sql
supabase/migrations/20260321000003_add_file_embedding.sql
supabase/migrations/20260321000004_add_collection_embedding.sql
```

**Acao:** Rodar essas 4 migrations no banco hosted via `psql` ou Supabase MCP `execute_sql`.

---

## Teste 0: Aplicar Migrations Pendentes

**Objetivo:** Aplicar todas as migrations que faltam no banco hosted.

### Execucao (Supabase MCP)

Rodar cada migration SQL via `mcp__supabase__execute_sql`.

### Validacao (Supabase MCP)

```sql
-- Verificar colunas Level 3
SELECT column_name FROM information_schema.columns
WHERE table_name = 'file_items'
AND column_name IN ('section_type','weight','page_number','document_context','plan_type','content_tsvector');

-- Verificar colunas de embedding
SELECT column_name FROM information_schema.columns
WHERE table_name = 'files' AND column_name = 'file_embedding';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'collections' AND column_name = 'collection_embedding';

-- Verificar tabela chunk_tags
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'chunk_tags');

-- Verificar tabela rag_pipeline_logs
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'rag_pipeline_logs');

-- Verificar RPCs
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('match_file_items_hybrid','match_file_items_weighted','match_file_items_enriched','match_files_by_embedding');
```

**Resultado esperado:** Todas as colunas, tabelas e RPCs existem.

---

## Teste 1: Delete de Arquivos Existentes (Limpeza)

**Objetivo:** Limpar arquivos de testes anteriores antes de iniciar.

### Execucao (Playwright)

```
1. Login → Abrir sidebar (x=20,y=375) → Files (x=28,y=236)
2. Para cada arquivo na lista:
   a. Clicar no arquivo → abre Sheet lateral
   b. Procurar botao de delete (icone lixeira ou "Delete")
   c. Confirmar delete
   d. Verificar que arquivo sumiu da lista
```

### Validacao (Supabase MCP)

```sql
-- Antes do delete: contar arquivos
SELECT name, id, tokens, created_at::date FROM files ORDER BY created_at DESC;

-- Apos cada delete: verificar que arquivo e chunks foram removidos
SELECT count(*) FROM files WHERE name = '<nome_arquivo>';
SELECT count(*) FROM file_items WHERE file_id = '<id_arquivo>';

-- Verificar que nao ha orfaos
SELECT count(*) FROM file_items fi
WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = fi.file_id);
```

**Resultado esperado:** Arquivos e chunks deletados. Zero orfaos.

---

## Teste 2: Upload de Arquivo via Wizard (Sidebar)

**Objetivo:** Validar o fluxo completo do Upload Wizard (5 steps).

### Execucao (Playwright)

```
1. Login → Sidebar → Files (x=28,y=236)
2. Clicar [+ New File]
3. STEP 1 (FILE_SELECT):
   - Selecionar PDF: "Manual_de_Vendas_PME AMIL.pdf"
   - input[data-testid="file-upload-input"].setInputFiles(path)
   - Clicar [Proximo]
4. STEP 2/3 (ANALYZING/CONFIRMATION):
   - Aguardar analise (ate 30s)
   - Verificar campos: nome sugerido, descricao, operadora, tipo_plano
   - Verificar tags sugeridas (botoes toggleaveis)
   - Verificar chunk_size e chunk_overlap recomendados
   - Clicar [Confirmar e Processar]
5. STEP 4 (PROCESSING):
   - Observar progresso por etapa:
     [x] Quebrando documento em chunks
     [x] Gerando embeddings
     [x] Classificando tags
     [x] Gerando contexto
     [x] Embedding do arquivo
6. STEP 5 (SUMMARY):
   - Tabela com: nome, tipo, tamanho, chunks, tags, tempo
   - Clicar [Fechar]
```

### Validacao (Supabase MCP)

```sql
-- Verificar arquivo criado
SELECT id, name, tokens, type, chunk_size, chunk_overlap,
       ingestion_metadata
FROM files WHERE name LIKE '%amil%' ORDER BY created_at DESC LIMIT 1;

-- Verificar chunks criados
SELECT count(*) as total_chunks,
       count(openai_embedding) as with_embedding,
       count(content_tsvector) as with_tsvector,
       count(section_type) as with_section_type,
       count(document_context) as with_context,
       count(plan_type) as with_plan_type,
       avg(tokens) as avg_tokens,
       min(tokens) as min_tokens,
       max(tokens) as max_tokens
FROM file_items WHERE file_id = '<id_arquivo>';

-- Verificar tags dos chunks
SELECT DISTINCT section_type, plan_type, weight
FROM file_items WHERE file_id = '<id_arquivo>';

-- Verificar logs do pipeline
SELECT stage, status, duration_ms, chunks_processed, chunks_created, model_used
FROM rag_pipeline_logs
WHERE correlation_id = '<correlation_id>'
ORDER BY created_at;
```

**Resultado esperado:**
- Arquivo criado com tokens > 0
- Todos chunks tem embedding e tsvector
- Logs mostram todas etapas completed

---

## Teste 3: Upload via Chat (+)

**Objetivo:** Upload alternativo pelo botao (+) no chat input.

### Execucao (Playwright)

```
1. Login → Chat page
2. Localizar input[type="file"] (hidden, no chat area)
3. setInputFiles("Material de Apoio ao Corretor Linha Porto SaUDE.pdf")
4. Aguardar ate "Hide files" aparecer (arquivo processado)
5. Verificar pill azul com nome do arquivo no chat area
```

### Validacao (Supabase MCP)

```sql
SELECT id, name, tokens FROM files
WHERE name LIKE '%porto%' ORDER BY created_at DESC LIMIT 1;

SELECT count(*) as chunks,
       count(openai_embedding) as with_embedding
FROM file_items WHERE file_id = '<id>';
```

**Resultado esperado:** Arquivo criado e processado com chunks + embeddings.

---

## Teste 4: Upload de Multiplos Arquivos

**Objetivo:** Subir os 5 PDFs e verificar todos no banco.

### Arquivos de Teste

| # | Arquivo | Tamanho |
|---|---------|---------|
| 1 | Manual_de_Vendas_PME AMIL.pdf | 1.3 MB |
| 2 | Material de Apoio ao Corretor Linha Porto SaUDE.pdf | 2.1 MB |
| 3 | PLANOS BASICO.pdf | 1.4 MB |
| 4 | PLANOS COM EINSTEIN.pdf | 4.9 MB |
| 5 | Treinamento todas as linhas.pdf | 6.3 MB |

Localicacao: `__tests__/documentos/`

### Execucao (Playwright)

Upload sequencial via chat (+), um arquivo por vez, aguardando processamento entre cada.

### Validacao (Supabase MCP)

```sql
-- Resumo geral de todos os arquivos
SELECT f.name, f.tokens,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id) as chunks,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.openai_embedding IS NOT NULL) as embeddings,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.content_tsvector IS NOT NULL) as tsvectors,
       (SELECT count(DISTINCT fi.section_type) FROM file_items fi WHERE fi.file_id = f.id AND fi.section_type IS NOT NULL) as section_types,
       (SELECT count(DISTINCT fi.plan_type) FROM file_items fi WHERE fi.file_id = f.id AND fi.plan_type IS NOT NULL) as plan_types,
       f.created_at::date
FROM files f
ORDER BY f.created_at DESC LIMIT 10;

-- Verificar integridade: todos chunks tem embedding?
SELECT f.name,
       count(*) as total,
       count(*) FILTER (WHERE fi.openai_embedding IS NULL) as missing_embedding
FROM file_items fi JOIN files f ON f.id = fi.file_id
GROUP BY f.name
HAVING count(*) FILTER (WHERE fi.openai_embedding IS NULL) > 0;

-- Total de chunks e tokens
SELECT count(*) as total_chunks, sum(tokens) as total_tokens
FROM file_items fi
JOIN files f ON f.id = fi.file_id
WHERE f.created_at::date = CURRENT_DATE;
```

**Resultado esperado:**
- 5 arquivos com chunks > 0
- 0 chunks sem embedding
- Total de tokens > 100K

---

## Teste 5: Validacao de Logs do Pipeline

**Objetivo:** Verificar que o sistema de logging registrou todas as etapas.

### Validacao (Supabase MCP)

```sql
-- Resumo de logs por correlation
SELECT correlation_id,
       count(*) as total_stages,
       count(*) FILTER (WHERE status = 'completed') as completed,
       count(*) FILTER (WHERE status = 'failed') as failed,
       sum(duration_ms) as total_ms,
       array_agg(stage ORDER BY created_at) as stages
FROM rag_pipeline_logs
WHERE created_at::date = CURRENT_DATE
GROUP BY correlation_id
ORDER BY min(created_at) DESC;

-- Verificar se houve falhas
SELECT stage, status, error_details, model_used, duration_ms
FROM rag_pipeline_logs
WHERE status = 'failed'
ORDER BY created_at DESC LIMIT 10;

-- Logs por arquivo especifico
SELECT rpl.stage, rpl.status, rpl.duration_ms, rpl.chunks_processed,
       rpl.chunks_created, rpl.model_used, rpl.tokens_used
FROM rag_pipeline_logs rpl
JOIN files f ON f.id = rpl.file_id
WHERE f.name LIKE '%amil%'
ORDER BY rpl.created_at;
```

**Resultado esperado:**
- Cada upload tem stages: chunking, embedding, tag_inference, context_generation, file_embedding
- Todos com status = completed
- 0 falhas

---

## Teste 6: Consulta ao Agente — Busca Geral

**Objetivo:** Verificar que o agente usa os vetores para responder.

### Execucao (Playwright)

```
1. Abrir novo chat (sidebar → [+ New Chat])
2. Verificar assistente "Health Plan v2" selecionado
3. Digitar no input: "Quais planos voces tem disponiveis?"
4. Clicar enviar (botao ▶ ou Enter)
5. Aguardar resposta (ate 30s)
6. Capturar screenshot da resposta
7. Verificar se menciona operadoras dos PDFs (AMIL, Porto Seguro, Einstein)
```

### Validacao (Supabase MCP)

```sql
-- Verificar que houve busca vetorial (agent_workflow_logs)
SELECT intent, routed_capability, search_results_count,
       execution_time_ms, has_recommendation,
       (debug_payload->>'ragLevel') as rag_level
FROM agent_workflow_logs
ORDER BY created_at DESC LIMIT 1;
```

---

## Teste 7: Consulta — Termo Exato (Hybrid Search)

**Objetivo:** Testar que BM25 + vetor encontra termos especificos.

### Execucao (Playwright)

```
1. No chat, enviar: "Qual o valor da coparticipacao do plano AMIL PME?"
2. Aguardar resposta
3. Verificar se resposta contem valores especificos do PDF
```

### Validacao (Supabase MCP)

```sql
-- Testar hybrid search diretamente
-- (requer query embedding, mas podemos verificar FTS)
SELECT id, LEFT(content, 200) as preview,
       ts_rank_cd(content_tsvector, plainto_tsquery('portuguese', 'coparticipacao AMIL PME')) as fts_rank
FROM file_items
WHERE content_tsvector @@ plainto_tsquery('portuguese', 'coparticipacao AMIL')
ORDER BY fts_rank DESC LIMIT 5;
```

---

## Teste 8: Consulta — Scoped Retrieval por Tipo de Plano

**Objetivo:** Quando usuario menciona tipo de plano, agente filtra corretamente.

### Execucao (Playwright)

```
1. Enviar: "Me fale sobre o plano empresarial PME da AMIL"
2. Verificar resposta fala APENAS do plano PME
3. Enviar: "E sobre os planos com Einstein?"
4. Verificar resposta fala dos planos Einstein
5. Verificar que NAO mistura informacoes entre eles
```

### Validacao (Supabase MCP)

```sql
-- Verificar plan_type nos chunks
SELECT DISTINCT plan_type, count(*) as chunks
FROM file_items
WHERE file_id IN (SELECT id FROM files WHERE created_at::date = CURRENT_DATE)
GROUP BY plan_type;
```

---

## Teste 9: Delete de Arquivo e Verificacao de Limpeza

**Objetivo:** Deletar um arquivo e confirmar que chunks e dados relacionados sao removidos.

### Execucao (Playwright)

```
1. Sidebar → Files (x=28, y=236)
2. Clicar no arquivo "manual_de_vendas_pme_amil.pdf"
3. No Sheet que abre, localizar botao de delete
4. Confirmar delete
5. Verificar que arquivo sumiu da lista
```

### Validacao (Supabase MCP)

```sql
-- ANTES do delete: anotar o id do arquivo
SELECT id, name, tokens FROM files WHERE name LIKE '%amil%';

-- APOS o delete: verificar remocao completa
-- 1. Arquivo removido
SELECT count(*) as files FROM files WHERE name LIKE '%amil%';

-- 2. Chunks removidos (cascade ou trigger)
SELECT count(*) as orphan_chunks FROM file_items
WHERE file_id = '<id_anotado>';

-- 3. Logs NAO devem ser removidos (historico)
SELECT count(*) as logs FROM rag_pipeline_logs
WHERE file_id = '<id_anotado>';

-- 4. Storage: verificar se arquivo foi removido do bucket
-- (verificar via Supabase dashboard ou API)

-- 5. File-workspace association removida
SELECT count(*) FROM file_workspaces WHERE file_id = '<id_anotado>';
```

**Resultado esperado:**
- 0 files com o nome
- 0 chunks orfaos
- Logs preservados (historico)
- Association removida

---

## Teste 10: Delete de Todos os Arquivos de Teste

**Objetivo:** Limpeza final — remover todos os arquivos de teste.

### Execucao (Playwright)

Repetir Teste 9 para cada arquivo restante.

### Validacao (Supabase MCP)

```sql
-- Estado final limpo
SELECT count(*) as total_files FROM files WHERE created_at::date = CURRENT_DATE;
SELECT count(*) as total_chunks FROM file_items fi
JOIN files f ON f.id = fi.file_id WHERE f.created_at::date = CURRENT_DATE;

-- Verificar zero orfaos globais
SELECT count(*) as orphan_chunks FROM file_items fi
WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = fi.file_id);
```

---

## Loop de Teste Completo

```
┌─────────────────────────────────────────────────────────┐
│                    CICLO DE TESTE                        │
│                                                         │
│  1. PREPARACAO                                          │
│     ├─ Aplicar migrations pendentes (Teste 0)           │
│     ├─ Limpar arquivos existentes (Teste 1)             │
│     └─ Validar banco limpo (MCP)                        │
│                                                         │
│  2. UPLOAD                                              │
│     ├─ Upload via Wizard (Teste 2)                      │
│     ├─ Upload via Chat (Teste 3)                        │
│     ├─ Upload batch 5 PDFs (Teste 4)                    │
│     └─ Validar: arquivos, chunks, embeddings,           │
│        tsvectors, tags, plan_type (MCP)                 │
│                                                         │
│  3. LOGS                                                │
│     ├─ Validar logs pipeline (Teste 5)                  │
│     └─ Verificar: stages, status, duracoes (MCP)        │
│                                                         │
│  4. RETRIEVAL                                           │
│     ├─ Busca geral (Teste 6)                            │
│     ├─ Termo exato / Hybrid Search (Teste 7)            │
│     ├─ Scoped retrieval (Teste 8)                       │
│     └─ Validar: agent_workflow_logs, FTS ranking (MCP)  │
│                                                         │
│  5. DELETE                                              │
│     ├─ Delete individual (Teste 9)                      │
│     ├─ Delete todos (Teste 10)                          │
│     └─ Validar: limpeza completa, zero orfaos (MCP)     │
│                                                         │
│  6. REPETIR do passo 2 se necessario                    │
└─────────────────────────────────────────────────────────┘
```

---

## Checklist de Validacao no Banco (Supabase MCP)

Usar apos cada ciclo de teste:

| Item | Query | Esperado |
|------|-------|----------|
| Arquivos criados | `SELECT count(*) FROM files WHERE created_at::date = CURRENT_DATE` | = numero de uploads |
| Chunks com embedding | `SELECT count(*) FROM file_items WHERE openai_embedding IS NULL` | = 0 |
| Chunks com tsvector | `SELECT count(*) FROM file_items WHERE content_tsvector IS NULL` | = 0 |
| Chunks com section_type | `SELECT count(*) FROM file_items WHERE section_type IS NOT NULL` | > 0 (apos L3) |
| Chunks com document_context | `SELECT count(*) FROM file_items WHERE document_context IS NOT NULL` | > 0 (apos L3) |
| Chunks com plan_type | `SELECT count(*) FROM file_items WHERE plan_type IS NOT NULL` | > 0 |
| Logs sem falhas | `SELECT count(*) FROM rag_pipeline_logs WHERE status = 'failed'` | = 0 |
| Logs completos | `SELECT count(DISTINCT correlation_id) FROM rag_pipeline_logs WHERE created_at::date = CURRENT_DATE` | = numero de uploads |
| Chunks orfaos | `SELECT count(*) FROM file_items fi WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = fi.file_id)` | = 0 |
| Collections com embedding | `SELECT count(*) FROM collections WHERE collection_embedding IS NOT NULL` | > 0 (apos L3) |
| Files com embedding | `SELECT count(*) FROM files WHERE file_embedding IS NOT NULL` | > 0 (apos L3) |
