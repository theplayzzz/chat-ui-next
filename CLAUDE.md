# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chatbot UI is an open-source AI chat application built with Next.js 14, Supabase, and TypeScript. It supports multiple LLM providers and includes a specialized Health Plan Agent system built with LangGraph.js for conversational health plan recommendations. The RAG pipeline operates at **Level 4 (Agentic RAG)** with hybrid search, self-correcting retrieval, and full pipeline logging.

## Infrastructure

- **Frontend + API**: Vercel (CI/CD via GitHub push to main)
- **Database**: Supabase hosted (serverless, NOT local)
- **Supabase CLI**: NOT available on Vercel. Do NOT use `supabase start` or `supabase db push`
- **Migrations**: Run directly via `psql` using `DATABASE_URL` from `.env.local`
- **Build time**: ~2.5 min on Vercel after push

## Common Commands

```bash
# Development
npm run dev               # Run Next.js dev server
npm run build             # Production build (runs on Vercel)
npm run type-check        # TypeScript type checking
npm run lint:fix          # ESLint with auto-fix
npm run format:write      # Prettier formatting

# Testing
npm test                  # Run Jest tests
cd __tests__/playwright-test && npx playwright test <file>.spec.ts --project=chromium  # E2E tests

# Database (run against hosted Supabase via psql)
psql "$DATABASE_URL" -f supabase/migrations/<file>.sql   # Apply migration
```

## Architecture

### Next.js App Structure (App Router)

```
app/
├── [locale]/              # i18n routing
│   ├── [workspaceid]/     # Workspace-scoped pages
│   │   ├── chat/          # Chat interface
│   │   └── admin/         # Admin panels
│   ├── login/             # Authentication (magic link, no password)
│   └── setup/             # Initial user setup
├── api/
│   ├── chat/
│   │   ├── openai/        # OpenAI chat
│   │   ├── health-plan-agent-v2/  # LangGraph health plan agent
│   │   └── ...
│   ├── retrieval/
│   │   └── process/       # File upload + RAG pipeline (chunking, embedding, Level 3 enrichment)
│   ├── files/
│   │   ├── analyze/       # PDF pre-analysis
│   │   └── progress/      # Pipeline progress polling endpoint
│   └── admin/
└── auth/
```

### Key Directories

- **`lib/agents/health-plan-v2/`** - LangGraph.js agent
  - `workflow/workflow.ts` - Main graph (orchestrator → capabilities)
  - `graphs/search-plans-graph.ts` - RAG sub-graph (Level 1 or Level 3 pipeline)
  - `nodes/rag/` - RAG nodes: retrieve-simple, retrieve-hybrid, grade-documents, grade-by-collection, rerank-chunks, rewrite-query
  - `intent/` - Intent classifier + query classifier (with planType extraction)

- **`lib/rag/`** - RAG utilities
  - `ingest/` - Embedding generator, tag inferencer, contextual retrieval, PDF analyzer, smart chunker
  - `logging/` - Pipeline logger (fire-and-forget to `rag_pipeline_logs` table)
  - `search/` - Collection selector, file selector

- **`components/chat/`** - Chat UI
  - `chat-input.tsx` - Main input with (+) upload and books icon for collection selector
  - `chat-collection-selector.tsx` - Collection/file selection panel
  - `chat-files-display.tsx` - Attached files display (compact chips layout)

- **`components/files/upload/`** - Upload wizard
  - `UploadWizard.tsx` - 5-step wizard (select → analyze → confirm → process → summary)
  - `ProcessingProgress.tsx` - Real-time progress via polling
  - `UploadSummaryTable.tsx` - Post-upload summary

- **`db/`** - Supabase database operations
- **`supabase/types.ts`** - Auto-generated types (105 files import this, DO NOT delete)
- **`supabase/migrations/`** - SQL migration files (reference only, run via psql)

### RAG Pipeline (Level 4)

```
INGEST: Upload → Storage Download → Chunking → Embedding → Chunks Upsert
        → Tag Inference → Context Generation → File Embedding → Pipeline Complete

RETRIEVAL (Level 3 - always enabled):
  classifyQuery → selectCollections → selectFiles
  → retrieveHybrid (BM25 + vector with RRF fusion)
  → rerankChunks (top 20 → top 8)
  → gradeByFile → [CRAG retry if all irrelevant] → gradeByCollection
  → formatResults
```

**Pipeline Logging**: Every stage logged to `rag_pipeline_logs` table with `correlationId` for full traceability. 8 stages per upload, fire-and-forget (never blocks pipeline).

**Key relationships**:
```
assistant → assistant_collections → collections → collection_files → files → file_items (chunks)
```

The Health Plan v2 assistant discovers files at runtime via this chain. Collections are the discovery mechanism — there is NO direct assistant-file link.

### Health Plan v2 Assistant

- **Auto-provisioned**: Every workspace gets one via database trigger
- **Name**: "Health Plan v2" (find by name if `selectedAssistant` is null)
- **ID in production**: `1fde19b1-c63a-4359-9a3f-3c3a4be1ddd3`
- **Collections**: Linked via `assistant_collections` table
- **RAG**: Uses `initializeNode` to load all files from all linked collections

### Database Schema (Key Tables)

```
files                  - Uploaded documents (file_embedding, ingestion_status, file_tags)
file_items             - Chunks (openai_embedding, content_tsvector, tags[], section_type, plan_type, document_context, weight)
collections            - Document groups (collection_embedding, collection_tags)
collection_files       - N:N junction
assistant_collections  - N:N junction (assistant ↔ collection)
rag_pipeline_logs      - Pipeline execution logs (correlation_id, stage, status, duration_ms, etc.)
agent_workflow_logs    - Agent execution logs (intent, capability, search_results_count)
chunk_tags             - System tag definitions per workspace
```

**Vector indexes**: HNSW (m=16, ef_construction=64) on `file_items.openai_embedding`, `files.file_embedding`, `collections.collection_embedding`.

**Full-text search**: `content_tsvector` column on `file_items` with Portuguese config, auto-populated via trigger.

### RPC Functions

| Function | Purpose |
|----------|---------|
| `match_file_items_enriched` | Vector search with file/collection context |
| `match_file_items_weighted` | Vector search with tag boost + weight |
| `match_file_items_hybrid` | Hybrid search: BM25 + vector with RRF fusion |
| `match_files_by_embedding` | File-level pre-filtering |

All RPCs support `filter_plan_type` parameter and `hnsw.iterative_scan = relaxed_order`.

## Regras de Modelos de IA

### Modelos Disponíveis (verificados via API)

| Modelo | Uso | Parâmetros |
|--------|-----|-----------|
| `gpt-5.4-mini` | Tarefas complexas (grading, recomendação, análise, humanização) | temperature=1, maxCompletionTokens, reasoning_effort="low" |
| `gpt-5.4-nano` | Tarefas simples (tag inference, query classifier, contexto, rewrite) | temperature=1, maxCompletionTokens, reasoning_effort="low" |

**IMPORTANTE**: `gpt-5-mini` e `gpt-5.1-mini` NÃO existem mais na API OpenAI. Usar SOMENTE `gpt-5.4-mini` ou `gpt-5.4-nano`.

### Configuração Correta com @langchain/openai 0.6.15

```typescript
import { ChatOpenAI } from "@langchain/openai"

const llm = new ChatOpenAI({
  modelName: "gpt-5.4-mini",
  temperature: 1,              // GPT-5 APENAS suporta temperature=1
  maxCompletionTokens: 4096,   // CAMPO DIRETO (NÃO em modelKwargs!)
  timeout: 30000,
  maxRetries: 2,
  tags: ["component-name", "health-plan-v2"],
  modelKwargs: {
    reasoning_effort: "low"    // low | medium | high
  }
})
```

**Bug crítico em @langchain/openai 0.6.15**: `max_completion_tokens` dentro de `modelKwargs` é SILENCIOSAMENTE IGNORADO para modelos reasoning (gpt-5*). SEMPRE usar `maxCompletionTokens` como campo direto do construtor.

### Arquivos que usam gpt-5.4-mini (12 arquivos)
- `lib/agents/health-plan-v2/intent/intent-classifier.ts`
- `lib/agents/health-plan-v2/nodes/rag/grade-documents.ts`
- `lib/agents/health-plan-v2/nodes/rag/grade-by-collection.ts`
- `lib/agents/health-plan-v2/nodes/rag/rerank-chunks.ts`
- `lib/agents/health-plan-v2/nodes/capabilities/*.ts` (6 capabilities)
- `lib/agents/health-plan-v2/graphs/search-plans-graph.ts`
- `lib/rag/ingest/pdf-analyzer.ts`

### Arquivos que usam gpt-5.4-nano (4 arquivos)
- `lib/agents/health-plan-v2/intent/query-classifier.ts`
- `lib/rag/ingest/tag-inferencer.ts`
- `lib/rag/ingest/contextual-retrieval.ts`
- `lib/agents/health-plan-v2/nodes/rag/rewrite-query.ts`

## Feature Flags

| Flag | Default | Controla |
|------|---------|----------|
| `USE_RAG_LEVEL3` | Always `true` | Pipeline Level 3 (hybrid search, rerank, pre-filtering) — hardcoded, no env var needed |
| `USE_CRAG` | Always `true` | Self-correcting retrieval (query rewrite on failure) — hardcoded, no env var needed |

## Testing

### Jest (Unit)
```bash
npm test
npm test -- --testPathPattern=lib
```

### Playwright (E2E)
```bash
cd __tests__/playwright-test
npx playwright test <file>.spec.ts --project=chromium --reporter=list
```

**Test PDFs**: `__tests__/documentos/` (5 PDFs de planos de saúde)

**QA Test Plan**: `docs/qa-test-plan-rag-level4.md` — 3 fases, 19 testes automatizados

**Supabase MCP**: Usar `mcp__supabase__execute_sql` para validação no banco após testes Playwright.

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
