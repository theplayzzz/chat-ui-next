# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chatbot UI is an open-source AI chat application built with Next.js 14, Supabase, and TypeScript. It supports multiple LLM providers and includes a specialized Health Plan Agent system built with LangGraph.js for conversational health plan recommendations.

## Common Commands

```bash
# Development
npm run chat              # Start Supabase + generate types + run dev server
npm run dev               # Run Next.js dev server only (requires Supabase running)
npm run restart           # Stop Supabase and start fresh

# Build & Quality
npm run build             # Production build
npm run type-check        # TypeScript type checking
npm run lint              # ESLint
npm run lint:fix          # ESLint with auto-fix
npm run format:write      # Prettier formatting

# Testing
npm test                  # Run Jest tests
npm test -- --watch       # Run tests in watch mode
npm test -- path/to/file  # Run specific test file

# Database
npm run db-reset          # Reset local Supabase DB + regenerate types
npm run db-migrate        # Run migrations + regenerate types
npm run db-types          # Regenerate Supabase TypeScript types
npm run db-push           # Push migrations to hosted Supabase
```

## Architecture

### Next.js App Structure (App Router)

```
app/
├── [locale]/              # i18n routing
│   ├── [workspaceid]/     # Workspace-scoped pages
│   │   ├── chat/          # Chat interface
│   │   └── admin/         # Admin panels
│   ├── login/             # Authentication
│   └── setup/             # Initial user setup
├── api/
│   ├── chat/              # Chat API routes per provider
│   │   ├── openai/        # OpenAI chat
│   │   ├── anthropic/     # Anthropic chat
│   │   ├── health-plan-agent-v2/  # LangGraph health plan agent
│   │   └── ...
│   ├── retrieval/         # RAG document processing
│   └── admin/             # Admin API endpoints
└── auth/                  # Auth callback
```

### Key Directories

- **`lib/agents/health-plan-v2/`** - LangGraph.js agent for health plan recommendations
  - `workflow/workflow.ts` - Main graph compilation
  - `state/state-annotation.ts` - State schema with reducers
  - `nodes/` - Graph nodes (orchestrator, router, capabilities, RAG)
  - `checkpointer/` - PostgresSaver for conversation persistence

- **`lib/tools/health-plan/`** - Health plan business logic (v1 orchestrator, ERP integration)

- **`db/`** - Supabase database operations (CRUD for all entities)

- **`context/context.tsx`** - Global React context for app state (ChatbotUIContext)

- **`components/`** - UI components
  - `chat/` - Chat interface components
  - `sidebar/` - Navigation and workspace management
  - `ui/` - Radix-based primitive components

- **`types/`** - TypeScript type definitions

- **`supabase/`** - Database configuration
  - `migrations/` - SQL migrations
  - `types.ts` - Auto-generated from schema

### State Management

The app uses React Context (`ChatbotUIContext`) for global state including:
- User profile and workspace selection
- Chat messages and settings
- Available models (hosted, local, OpenRouter)
- Assistants, files, prompts, tools, presets

### LangGraph Health Plan Agent (v2)

The agent uses LangGraph.js with PostgresSaver for conversation persistence:

1. **Entry**: API route receives messages, creates/restores thread state
2. **Orchestrator**: Routes to capabilities based on intent classification
3. **Capabilities**: Modular nodes (update-client-info, search-plans, generate-recommendation, etc.)
4. **RAG Pipeline**: Document retrieval with grading for health plan search

Key files:
- `lib/agents/health-plan-v2/workflow/workflow.ts` - Graph definition
- `lib/agents/health-plan-v2/nodes/orchestrator.ts` - Main routing logic
- `lib/agents/health-plan-v2/nodes/rag/` - RAG retrieval and grading

### Database Schema

Supabase Postgres with tables for:
- `profiles`, `workspaces` - User and workspace management
- `chats`, `messages` - Conversation storage
- `assistants`, `tools`, `prompts`, `presets` - AI configuration
- `files`, `file_items`, `collections` - RAG document storage
- Checkpointer tables for LangGraph state persistence

### API Providers

Chat routes in `app/api/chat/` support:
- OpenAI, Azure OpenAI
- Anthropic (Claude)
- Google (Gemini)
- Mistral, Groq, Perplexity
- OpenRouter (multi-model)
- Custom endpoints

## Environment Setup

Copy `.env.local.example` to `.env.local` and configure:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `supabase status`
- API keys for desired providers (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
- LangSmith keys for agent monitoring (optional)

## Testing

Jest with jsdom environment. Tests are in `__tests__/` directories throughout the codebase.

```bash
npm test                           # Run all tests
npm test -- --testPathPattern=lib  # Run tests matching path
```

## Regras de Modelos de IA

### GPT-5-mini como Padrão
**SEMPRE use `gpt-5-mini` para chamadas LLM neste projeto. NUNCA use `gpt-4o-mini`.**

#### Configuração do GPT-5-mini com LangChain

```typescript
import { ChatOpenAI } from "@langchain/openai"

// Helper para detectar modelos GPT-5
function isGPT5Model(model: string): boolean {
  return model.startsWith("gpt-5") || model.startsWith("o1") || model.startsWith("o3")
}

// Configuração correta para GPT-5-mini (Chat Completions API via LangChain)
const llm = new ChatOpenAI({
  modelName: "gpt-5-mini",
  temperature: 1,  // GPT-5 APENAS suporta temperature=1
  timeout: 30000,
  maxRetries: 2,
  modelKwargs: {
    max_completion_tokens: 4096,  // Chat Completions API usa max_completion_tokens
    reasoning_effort: "low"  // low | medium | high (no nível raiz, não aninhado)
  }
})
```

#### Parâmetros Importantes do GPT-5 (Chat Completions API)

| Parâmetro | Valor | Notas |
|-----------|-------|-------|
| `modelName` | `"gpt-5-mini"` | Nome do modelo |
| `temperature` | `1` | **Obrigatório** - GPT-5 não aceita outros valores |
| `max_completion_tokens` | `4096` | Usa `modelKwargs` (NÃO `max_output_tokens` que é para Responses API) |
| `reasoning_effort` | `"low"` \| `"medium"` \| `"high"` | No nível raiz, não aninhado como `reasoning.effort` |

#### Context Window
- **Input**: 272K tokens
- **Output**: 128K tokens
- **Total**: 400K tokens

#### Quando usar qual `reasoning_effort`:
- **`low`**: Tarefas simples como grading, classificação, formatação
- **`medium`**: Análise moderada, extração de informações
- **`high`**: Raciocínio complexo, análise profunda (mais caro)

### Arquivos que usam GPT-5-mini
- `lib/agents/health-plan-v2/intent/intent-classifier.ts` - Classificação de intenção
- `lib/agents/health-plan-v2/nodes/rag/grade-documents.ts` - Grading por arquivo
- `lib/agents/health-plan-v2/nodes/rag/grade-by-collection.ts` - Grading por collection
- `lib/agents/health-plan-v2/nodes/capabilities/search-plans.ts` - Capability de busca
- `lib/agents/health-plan-v2/graphs/search-plans-graph.ts` - Grafo RAG (default)

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
