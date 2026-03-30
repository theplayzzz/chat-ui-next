# QA Test Plan — RAG Level 4

## Principio Fundamental

> **TODA acao e feita pelo Playwright** (simulando usuario real).
> **Supabase MCP e usado SOMENTE para validacao** (confirmar o que aconteceu no banco).
> Nenhum dado e alterado diretamente no banco. Tudo passa pelo frontend.

---

## Ferramentas

| Ferramenta | Uso | Regra |
|------------|-----|-------|
| **Playwright** | Executa acoes: upload, delete, chat, navegacao | OBRIGATORIO para toda acao |
| **Supabase MCP** | Valida dados: arquivos, chunks, logs, embeddings | SOMENTE leitura/consulta |
| **Screenshots** | Evidencia visual de cada etapa | Gerado automaticamente |

### Comandos

```bash
# Rodar teste especifico
cd __tests__/playwright-test
npx playwright test <arquivo>.spec.ts --project=chromium --reporter=list

# Screenshots salvos em
__tests__/playwright-test/screenshots/
```

---

## Mapa da Interface

```
URL: https://chat-ui-next.vercel.app
Login: play-felix@hotmail.com (magic link, sem senha)

LANDING → [Start Chatting] → LOGIN → [email + Entrar] → CHAT

CHAT PAGE:
┌─────────┬──────────────────────────────────────────┐
│ Icons   │ Sidebar                                  │
│ laterais│                                          │
│         │ Conteudo muda conforme icon clicado       │
│ y=12  ◉ │ Chat (padrao)                            │
│ y=68  ◎ │ Prompts                                  │
│ y=124 ◎ │ Presets                                  │
│ y=180 ◎ │ Assistants                               │
│ y=236 ◎ │ ← FILES   [+ New File]                   │
│ y=292 ◎ │ ← COLLECTIONS [+ New Collection]          │
│ y=348 ◎ │ Models                                   │
│ y=396 ◎ │ Tools                                    │
│ y=660 ◎ │ Profile                                  │
├─────────┤                                          │
│   [>]   │ Toggle sidebar (x=20, y=375)             │
└─────────┴──────────────────────────────────────────┘

CHAT INPUT AREA:
┌──────────────────────────────────────────────────┐
│ ● Hide files  ⚙  ← aparece quando tem arquivo   │
│ ┌───────────┐ ┌───────────┐                      │
│ │ PDF file1 │ │ PDF file2 │ ← pills azuis        │
│ │     ✕     │ │     ✕     │                      │
│ └───────────┘ └───────────┘                      │
│ Talking to Health Plan v2                        │
│ ┌─[⊕]──────────────────────────────────[▶]──┐   │
│ │ Ask anything. Type @ / # !                 │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘

Atalhos:
  ⊕  = Upload arquivo novo (input file hidden)
  #  = Abrir File Picker (selecionar arquivo/collection existente)
  F  = Toggle exibicao de files
  E  = Toggle retrieval on/off
  ⚙  = Source Count (1-10 chunks)
```

---

## Testes

### Teste 1: Deletar Arquivos Existentes (Limpeza)

**Acao (Playwright):**
```
1. Login → Abrir sidebar (click x=20, y=375) → Files (click x=28, y=236)
2. Para cada arquivo na lista:
   a. Clicar no nome do arquivo → abre Sheet lateral com detalhes
   b. Localizar botao de delete (icone lixeira ou texto "Delete")
   c. Clicar delete → confirmar no dialog
   d. Aguardar arquivo sumir da lista
3. Screenshot apos cada delete
4. Screenshot final da lista vazia
```

**Validacao (Supabase MCP):**
```sql
-- Confirmar que todos os arquivos foram removidos
SELECT count(*) as remaining_files FROM files;

-- Confirmar que nao ha chunks orfaos
SELECT count(*) as orphan_chunks FROM file_items fi
WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = fi.file_id);
```

---

### Teste 2: Upload via Wizard (Sidebar → + New File)

**Acao (Playwright):**
```
1. Sidebar → Files (x=28, y=236)
2. Clicar [+ New File]
3. STEP 1: Selecionar "Manual_de_Vendas_PME AMIL.pdf"
   - input[type="file"] ou input[data-testid="file-upload-input"]
   - Clicar [Proximo]
4. STEP 2/3: Tela de confirmacao
   - Verificar campos: nome, descricao, operadora, tipo_plano
   - Verificar tags sugeridas
   - Verificar chunk_size e chunk_overlap
   - Screenshot de todos os campos
   - Clicar [Confirmar e Processar]
5. STEP 4: Tela de processamento
   - Observar progresso (polling)
   - Screenshot durante processamento
6. STEP 5: Tela de resumo
   - Screenshot da tabela resumo
   - Clicar [Fechar]
7. Verificar que arquivo aparece na lista de Files
```

**Validacao (Supabase MCP):**
```sql
-- Arquivo criado
SELECT id, name, tokens, ingestion_status, file_tags,
       (ingestion_metadata->>'enableLevel3')::boolean as level3
FROM files WHERE name LIKE '%amil%' ORDER BY created_at DESC LIMIT 1;

-- Chunks com todas as colunas Level 3
SELECT count(*) as total,
       count(openai_embedding) as embeddings,
       count(content_tsvector) as tsvectors,
       count(section_type) as section_types,
       count(document_context) as contexts,
       count(plan_type) as plan_types,
       count(CASE WHEN array_length(tags, 1) > 0 THEN 1 END) as with_tags
FROM file_items WHERE file_id = '<id>';

-- Logs do pipeline
SELECT stage, status, duration_ms, chunks_created, model_used
FROM rag_pipeline_logs WHERE file_id = '<id>'
ORDER BY created_at;
```

---

### Teste 3: Upload via Chat (+)

**Acao (Playwright):**
```
1. Na pagina de chat, localizar input[type="file"] (hidden)
2. setInputFiles("Material de Apoio ao Corretor Linha Porto SaUDE.pdf")
3. Aguardar pill azul aparecer no chat (ate 60s)
4. Verificar "Hide files" visivel
5. Screenshot
```

**Validacao (Supabase MCP):**
```sql
SELECT id, name, tokens FROM files
WHERE name LIKE '%porto%' ORDER BY created_at DESC LIMIT 1;

SELECT count(*) as chunks, count(openai_embedding) as embeddings
FROM file_items WHERE file_id = '<id>';
```

---

### Teste 4: Upload Batch (5 PDFs)

**Acao (Playwright):**
```
Upload sequencial dos 5 arquivos via chat (+):
1. Manual_de_Vendas_PME AMIL.pdf
2. Material de Apoio ao Corretor Linha Porto SaUDE.pdf
3. PLANOS BASICO.pdf
4. PLANOS COM EINSTEIN.pdf
5. Treinamento todas as linhas.pdf

Para cada: setInputFiles → aguardar processamento → screenshot
Ao final: Sidebar → Files → screenshot da lista completa
```

**Validacao (Supabase MCP):**
```sql
-- Resumo de todos os arquivos
SELECT f.name, f.tokens, f.ingestion_status,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id) as chunks,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.openai_embedding IS NOT NULL) as embeddings,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.content_tsvector IS NOT NULL) as tsvectors
FROM files f ORDER BY f.created_at DESC LIMIT 10;

-- Integridade: zero chunks sem embedding
SELECT f.name, count(*) FILTER (WHERE fi.openai_embedding IS NULL) as missing
FROM file_items fi JOIN files f ON f.id = fi.file_id
GROUP BY f.name HAVING count(*) FILTER (WHERE fi.openai_embedding IS NULL) > 0;

-- Total geral
SELECT count(*) as total_chunks, sum(tokens) as total_tokens FROM file_items;
```

---

### Teste 5: Validar Logs do Pipeline

**Acao (Playwright):** Nenhuma — este teste valida os logs gerados nos testes 2-4.

**Validacao (Supabase MCP):**
```sql
-- Logs por upload (cada correlationId = 1 upload)
SELECT correlation_id,
       count(*) as stages,
       count(*) FILTER (WHERE status = 'completed') as ok,
       count(*) FILTER (WHERE status = 'failed') as fail,
       sum(duration_ms) as total_ms,
       array_agg(stage ORDER BY created_at) as pipeline
FROM rag_pipeline_logs
GROUP BY correlation_id
ORDER BY min(created_at) DESC LIMIT 10;

-- Falhas
SELECT stage, status, error_details, duration_ms
FROM rag_pipeline_logs WHERE status = 'failed'
ORDER BY created_at DESC LIMIT 10;

-- Modelos usados
SELECT DISTINCT model_used FROM rag_pipeline_logs WHERE model_used IS NOT NULL;
```

---

### Teste 6: Chat com Arquivo — Busca Geral

**Acao (Playwright):**
```
1. Clicar [+ New Chat] na sidebar
2. No input de chat, digitar "#"
3. Aguardar File Picker abrir (lista de arquivos/collections)
4. Screenshot do File Picker
5. Clicar no arquivo "manual_de_vendas_pme_amil"
6. Verificar pill azul apareceu
7. Verificar bolinha verde (retrieval ativo)
8. Digitar: "Quais planos estao disponiveis neste documento?"
9. Pressionar Enter
10. Aguardar resposta do agente (ate 60s)
11. Screenshot da resposta
12. Verificar que a resposta menciona informacoes do PDF (AMIL, PME, coberturas)
```

**Validacao (Supabase MCP):**
```sql
-- Agente processou a mensagem
SELECT intent, routed_capability, search_results_count,
       execution_time_ms, response_preview
FROM agent_workflow_logs ORDER BY created_at DESC LIMIT 1;

-- Hybrid search executou
SELECT stage, status,
       input_metadata->>'query' as query,
       output_metadata->>'chunksReturned' as chunks,
       output_metadata->>'topScore' as score
FROM rag_pipeline_logs
WHERE stage = 'hybrid_search'
ORDER BY created_at DESC LIMIT 1;
```

---

### Teste 7: Chat — Termo Exato (Hybrid Search / BM25)

**Acao (Playwright):**
```
1. No mesmo chat (ou novo), com arquivo AMIL anexado via #
2. Digitar: "Qual o valor da coparticipacao do plano?"
3. Enter → aguardar resposta (60s)
4. Screenshot
5. Digitar: "Quais sao as faixas etarias e valores de mensalidade?"
6. Enter → aguardar resposta (60s)
7. Screenshot
8. Verificar que respostas contem numeros/valores do PDF
```

**Validacao (Supabase MCP):**
```sql
-- BM25 encontra termos exatos
SELECT LEFT(content, 150) as preview, f.name,
       ts_rank_cd(content_tsvector, plainto_tsquery('portuguese', 'coparticipacao valor')) as rank
FROM file_items fi JOIN files f ON f.id = fi.file_id
WHERE content_tsvector @@ plainto_tsquery('portuguese', 'coparticipacao')
ORDER BY rank DESC LIMIT 5;

-- Log da busca hibrida
SELECT input_metadata->>'query' as query,
       output_metadata->>'chunksReturned' as chunks,
       output_metadata->>'topScore' as score
FROM rag_pipeline_logs WHERE stage = 'hybrid_search'
ORDER BY created_at DESC LIMIT 2;
```

---

### Teste 8: Chat — Scoped Retrieval (Diferenciar Planos)

**Acao (Playwright):**
```
1. [+ New Chat]
2. Digitar "#" → selecionar "manual_de_vendas_pme_amil" (AMIL)
3. Digitar "#" novamente → selecionar "planos_com_einstein" (Einstein)
4. Verificar 2 pills azuis
5. Digitar: "Me fale sobre o plano PME da AMIL"
6. Enter → aguardar → screenshot
7. Verificar: resposta fala APENAS do AMIL
8. Digitar: "E sobre os planos com Einstein?"
9. Enter → aguardar → screenshot
10. Verificar: resposta fala APENAS do Einstein
11. Digitar: "Compare o plano AMIL PME com o Einstein"
12. Enter → aguardar → screenshot
13. Verificar: resposta diferencia os dois corretamente
```

**Validacao (Supabase MCP):**
```sql
-- Plan type nos chunks
SELECT f.name, fi.plan_type, count(*) as chunks
FROM file_items fi JOIN files f ON f.id = fi.file_id
GROUP BY f.name, fi.plan_type ORDER BY f.name;

-- Filtering aplicado nas buscas
SELECT input_metadata->>'query' as query,
       input_metadata->>'planTypeFilter' as filter,
       output_metadata->>'chunksReturned' as chunks,
       output_metadata->>'uniqueFiles' as files
FROM rag_pipeline_logs WHERE stage = 'hybrid_search'
ORDER BY created_at DESC LIMIT 3;
```

---

### Teste 9: Delete Individual via Frontend

**Acao (Playwright):**
```
1. Sidebar → Files (x=28, y=236)
2. Clicar no arquivo "manual_de_vendas_pme_amil"
3. No Sheet lateral, clicar botao delete
4. Confirmar delete
5. Verificar arquivo sumiu da lista
6. Screenshot
```

**Validacao (Supabase MCP):**
```sql
-- Arquivo removido
SELECT count(*) FROM files WHERE name LIKE '%amil%';

-- Chunks removidos (cascade)
SELECT count(*) FROM file_items WHERE file_id = '<id_anotado>';

-- Logs preservados (historico)
SELECT count(*) FROM rag_pipeline_logs WHERE file_id = '<id_anotado>';

-- Zero orfaos
SELECT count(*) FROM file_items fi
WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = fi.file_id);
```

---

### Teste 10: Delete de Todos os Arquivos

**Acao (Playwright):**
```
1. Sidebar → Files
2. Repetir delete para cada arquivo restante
3. Screenshot final da lista vazia
```

**Validacao (Supabase MCP):**
```sql
SELECT count(*) as files FROM files;
SELECT count(*) as chunks FROM file_items;
SELECT count(*) as orphans FROM file_items fi
WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = fi.file_id);
```

---

## Ordem de Execucao

```
FASE 1 — LIMPEZA
  Teste 1: Deletar arquivos existentes (Playwright)
  Validar banco limpo (MCP)

FASE 2 — UPLOAD
  Teste 2: Upload via Wizard (Playwright)
  Teste 3: Upload via Chat + (Playwright)
  Teste 4: Upload batch 5 PDFs (Playwright)
  Teste 5: Validar logs pipeline (MCP)

FASE 3 — RETRIEVAL
  Teste 6: Chat busca geral (Playwright)
  Teste 7: Chat termo exato (Playwright)
  Teste 8: Chat scoped retrieval (Playwright)

FASE 4 — DELETE
  Teste 9: Delete individual (Playwright)
  Teste 10: Delete todos (Playwright)
  Validar limpeza final (MCP)
```

---

## Relatorio Final (Template)

Gerado automaticamente apos execucao dos testes:

```
=== RELATORIO QA — RAG Level 4 ===
Data: YYYY-MM-DD HH:MM
Ambiente: https://chat-ui-next.vercel.app
Build: [commit hash]

FASE 1 — LIMPEZA
  Teste 1 Delete existentes:     [PASS/FAIL] — [detalhes]
  DB: arquivos restantes:         [0/N]
  DB: chunks orfaos:              [0/N]

FASE 2 — UPLOAD
  Teste 2 Wizard:                [PASS/FAIL] — [detalhes]
    Wizard steps completados:     [X/5]
    Chunks criados:               [N]
    Level 3 enrichment:           [SIM/NAO]
  Teste 3 Chat upload:           [PASS/FAIL] — [detalhes]
  Teste 4 Batch 5 PDFs:          [PASS/FAIL] — [detalhes]
    Arquivos subidos:             [X/5]
    Total chunks:                 [N]
    Chunks sem embedding:         [0/N]
    Chunks sem tsvector:          [0/N]
  Teste 5 Pipeline logs:         [PASS/FAIL]
    Correlations completas:       [N]
    Stages com falha:             [0/N]
    Stages esperados por upload:  storage_download, chunking, embedding,
                                  chunks_upsert, tag_inference,
                                  context_generation, file_embedding,
                                  pipeline_complete

FASE 3 — RETRIEVAL
  Teste 6 Busca geral:           [PASS/FAIL]
    Agente respondeu:             [SIM/NAO]
    search_results_count:         [N]
    Menciona dados do PDF:        [SIM/NAO]
  Teste 7 Termo exato:           [PASS/FAIL]
    Hybrid search chunks:         [N]
    BM25 encontrou termo:         [SIM/NAO]
    Resposta contem valores:      [SIM/NAO]
  Teste 8 Scoped retrieval:      [PASS/FAIL]
    Plan type filtering:          [SIM/NAO]
    Resposta correta AMIL:        [SIM/NAO]
    Resposta correta Einstein:    [SIM/NAO]
    Comparacao diferenciou:       [SIM/NAO]

FASE 4 — DELETE
  Teste 9 Delete individual:     [PASS/FAIL]
    Arquivo removido:             [SIM/NAO]
    Chunks removidos:             [SIM/NAO]
    Logs preservados:             [SIM/NAO]
  Teste 10 Delete todos:         [PASS/FAIL]
    Arquivos restantes:           [0/N]
    Chunks restantes:             [0/N]
    Chunks orfaos:                [0/N]

BUGS ENCONTRADOS:
  1. [descricao + como reproduzir]
  2. ...

SCREENSHOTS: __tests__/playwright-test/screenshots/
```

---

## Checklist de Validacao Supabase MCP

Executar apos cada fase para confirmar estado do banco:

### Upload & Ingest
```sql
SELECT f.name, f.tokens, f.ingestion_status,
  (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id) as chunks,
  (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.openai_embedding IS NOT NULL) as embeddings,
  (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.content_tsvector IS NOT NULL) as tsvectors,
  (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.section_type IS NOT NULL) as sections,
  (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.document_context IS NOT NULL) as contexts,
  (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.plan_type IS NOT NULL) as plan_types,
  (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.tags IS NOT NULL AND array_length(fi.tags,1) > 0) as tagged
FROM files f ORDER BY f.created_at DESC;
```

### Logs
```sql
SELECT correlation_id, array_agg(stage ORDER BY created_at) as stages,
       count(*) FILTER (WHERE status='failed') as fails,
       sum(duration_ms) as ms
FROM rag_pipeline_logs
GROUP BY correlation_id ORDER BY min(created_at) DESC LIMIT 10;
```

### Retrieval
```sql
SELECT stage, input_metadata->>'query' as query,
       output_metadata->>'chunksReturned' as chunks,
       output_metadata->>'topScore' as score
FROM rag_pipeline_logs WHERE stage = 'hybrid_search'
ORDER BY created_at DESC LIMIT 5;
```

### Integridade
```sql
SELECT count(*) as orphans FROM file_items fi
WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = fi.file_id);
```

---

# FASE 2: Collections + Chat Semantico

## Objetivo

Validar que:
1. Collections podem ser criadas e associadas a arquivos
2. O agente Health Plan v2 busca nos documentos e responde com base no conteudo real
3. Interacoes semanticas (perfil familiar, empresa, termos exatos) retornam dados relevantes
4. Chunks e embeddings estao corretos comparados ao conteudo dos PDFs

## Arquivos de Teste

| # | Arquivo | Collection |
|---|---------|-----------|
| 1 | Manual_de_Vendas_PME AMIL.pdf | AMIL PME |
| 2 | Material de Apoio ao Corretor Linha Porto SaUDE.pdf | Porto Seguro |
| 3 | PLANOS BASICO.pdf | SulAmerica Basico |
| 4 | PLANOS COM EINSTEIN.pdf | Einstein |

Localizacao: `__tests__/documentos/`

---

### Teste F2-1: Upload dos PDFs

**Acao (Playwright):**
```
1. Login
2. Para cada PDF: upload via chat (+) → aguardar processamento
3. Sidebar → Files → screenshot da lista
```

**Validacao (Supabase MCP):**
```sql
SELECT f.name, f.tokens, f.ingestion_status,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id) as chunks,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.openai_embedding IS NOT NULL) as embeddings,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.content_tsvector IS NOT NULL) as tsvectors,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.section_type IS NOT NULL) as sections,
       (SELECT count(*) FROM file_items fi WHERE fi.file_id = f.id AND fi.tags IS NOT NULL AND array_length(fi.tags,1) > 0) as tagged
FROM files f ORDER BY f.created_at DESC LIMIT 10;
```

---

### Teste F2-2: Criar Collections

**Acao (Playwright):**
```
1. Sidebar → Collections (x=28, y=292)
2. Para cada collection:
   a. Clicar [+ New Collection]
   b. Preencher "Collection name..." com o nome
   c. Preencher descricao: "Documentos de planos de saude - [nome]"
   d. Clicar [Create]
3. Screenshot da lista de collections
```

**Dialog de criar Collection:**
```
┌─────────────────────────────────────┐
│ Input: "Collection name..."         │
│ Textarea: "Descreva o conteudo..."  │
│ [0 files selected]                  │
│ [Cancel]  [Create]                  │
└─────────────────────────────────────┘
```

**Validacao (Supabase MCP):**
```sql
SELECT id, name, description FROM collections
ORDER BY created_at DESC LIMIT 10;
```

---

### Teste F2-3: Chat — Busca Geral

**Acao (Playwright):**
```
1. Upload "Manual_de_Vendas_PME AMIL.pdf" via chat (+)
2. Aguardar pill azul e indicador de retrieval
3. Enviar: "Quais tipos de planos estao disponiveis neste documento?"
4. Aguardar resposta (ate 90s)
5. Screenshot da resposta
6. Verificar: resposta menciona informacoes do PDF AMIL
```

**Validacao (Supabase MCP):**
```sql
SELECT intent, routed_capability, search_results_count,
       execution_time_ms, response_preview
FROM agent_workflow_logs ORDER BY created_at DESC LIMIT 1;
```

---

### Teste F2-4: Chat — Perfil Familiar

**Acao (Playwright):**
```
1. No mesmo chat, enviar:
   "Tenho 35 anos, moro em Sao Paulo, sou casado e tenho 2 filhos.
    Quero um plano de saude para minha familia com orcamento de
    R$1500 por mes. O que voce recomenda?"
2. Aguardar resposta (ate 90s)
3. Screenshot
4. Verificar: resposta menciona planos adequados para familia
```

---

### Teste F2-5: Chat — Empresa/PME

**Acao (Playwright):**
```
1. No mesmo chat, enviar:
   "Sou dono de uma empresa com 15 funcionarios. Preciso de um
    plano empresarial que cubra consultas, exames e internacao.
    Qual plano PME voces recomendam?"
2. Aguardar resposta (ate 90s)
3. Screenshot
4. Verificar: resposta menciona PME, AMIL, planos empresariais
```

---

### Teste F2-6: Chat — Carencia (Termo Exato)

**Acao (Playwright):**
```
1. Enviar: "Qual e o periodo de carencia para parto?"
2. Aguardar resposta
3. Verificar: resposta contem periodo especifico (ex: 300 dias)
```

**Validacao (Supabase MCP):**
```sql
-- Verificar que BM25 encontra "carencia parto" nos chunks
SELECT LEFT(content, 200) as preview, f.name,
       ts_rank_cd(content_tsvector, plainto_tsquery('portuguese', 'carencia parto')) as rank
FROM file_items fi JOIN files f ON f.id = fi.file_id
WHERE content_tsvector @@ plainto_tsquery('portuguese', 'carencia parto')
ORDER BY rank DESC LIMIT 5;
```

---

### Teste F2-7: Chat — Coparticipacao

**Acao (Playwright):**
```
1. Enviar: "Como funciona a coparticipacao? Tem algum limite de valor?"
2. Aguardar resposta
3. Verificar: resposta explica coparticipacao com dados do documento
```

---

### Teste F2-8: Cleanup — Delete

**Acao (Playwright):**
```
1. Sidebar → Files → deletar todos os arquivos
2. Screenshot final
```

**Validacao (Supabase MCP):**
```sql
SELECT count(*) as files FROM files WHERE user_id = '<user_id>';
SELECT count(*) as orphans FROM file_items fi
WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = fi.file_id);
```

---

## Ordem de Execucao Fase 2

```
F2-1: Upload 4 PDFs (Playwright)
      → Validar chunks + embeddings + tsvectors (MCP)
F2-2: Criar 4 Collections (Playwright)
      → Validar collections no banco (MCP)
F2-3: Chat busca geral (Playwright)
F2-4: Chat perfil familiar (Playwright)
F2-5: Chat empresa/PME (Playwright)
F2-6: Chat carencia (Playwright)
      → Validar BM25 ranking (MCP)
F2-7: Chat coparticipacao (Playwright)
F2-8: Delete cleanup (Playwright)
      → Validar limpeza (MCP)
```

## Relatorio Fase 2 (Template)

```
=== RELATORIO FASE 2 — Collections + Chat Semantico ===
Data: YYYY-MM-DD HH:MM

F2-1: Upload PDFs           [PASS/FAIL] — [X/4] uploaded, [N] chunks
F2-2: Criar Collections     [PASS/FAIL] — [X/4] created
F2-3: Chat busca geral      [PASS/FAIL] — resposta [N] chars, menciona AMIL: [S/N]
F2-4: Chat perfil familiar  [PASS/FAIL] — resposta [N] chars
F2-5: Chat empresa/PME      [PASS/FAIL] — resposta [N] chars, menciona PME: [S/N]
F2-6: Chat carencia          [PASS/FAIL] — contem periodo: [S/N]
F2-7: Chat coparticipacao   [PASS/FAIL] — contem dados: [S/N]
F2-8: Delete cleanup        [PASS/FAIL] — [X] deleted, [0] orfaos

DB: Pipeline logs completos   [PASS/FAIL] — [N] correlations, [0] falhas
DB: Level 3 enrichment        [PASS/FAIL] — tags: [N], contexts: [N]
DB: Hybrid search executado   [PASS/FAIL] — [N] buscas, top score: [X]

TOTAL: [X] PASS, [X] FAIL de 8 testes
```
