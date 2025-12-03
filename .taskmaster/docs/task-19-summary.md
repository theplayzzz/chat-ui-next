# Task #19: Fase 1 - Setup + Endpoint Stub + Frontend

**Status:** Concluído
**Data:** 2025-12-03
**PRD:** health-plan-agent-v2-langgraph-prd.md

---

## Objetivo

Configurar a infraestrutura inicial do Health Plan Agent v2 usando LangGraph.js, incluindo dependências, estrutura de diretórios, endpoint API, migrations e integração frontend.

---

## Subtasks Executadas

### 19.1 - Instalar dependências LangGraph.js
```json
"@langchain/langgraph": "0.4.9",
"@langchain/langgraph-checkpoint-postgres": "0.1.2",
"@langchain/openai": "0.6.15",
"@langchain/core": "0.3.68"
```

### 19.2 - Criar estrutura de diretórios
```
lib/agents/health-plan-v2/
├── types.ts                    # Tipos (UserIntent, PartialClientInfo, etc.)
├── index.ts                    # Exportações públicas
├── README.md                   # Documentação
├── state/
│   └── state-annotation.ts     # HealthPlanStateAnnotation (LangGraph)
├── nodes/
│   ├── orchestrator.ts         # Nó orquestrador principal
│   ├── router.ts               # Lógica de roteamento
│   └── capabilities/           # Nós de capacidades (stubs)
│       ├── extract-client-info.ts
│       ├── search-health-plans.ts
│       ├── analyze-compatibility.ts
│       ├── fetch-erp-prices.ts
│       └── generate-recommendation.ts
├── workflow/
│   └── workflow.ts             # StateGraph builder
└── checkpointer/
    └── postgres-checkpointer.ts # PostgresSaver config
```

### 19.3 & 19.4 - Criar endpoint API com streaming
**Arquivo:** `app/api/chat/health-plan-agent-v2/route.ts`

- Runtime: Node.js
- Timeout: 300s (Vercel Pro)
- Autenticação via Supabase
- Streaming com `StreamingTextResponse`
- Headers: `X-Chat-Id`, `X-Execution-Time`

### 19.5 - Criar assistente no banco
**Migration:** `20251203000001_create_health_plan_agent_v2_assistant.sql`

```sql
-- Função para criar assistente Health Plan v2
CREATE OR REPLACE FUNCTION create_health_plan_v2_assistant(...)
```

**Assistente criado:**
- Nome: "Health Plan v2"
- Modelo: gpt-4o
- Context: 128000 tokens
- Temperature: 0.1

### 19.6 - Copiar schemas/prompts/templates do v1
**Re-exports criados em:**
- `lib/agents/health-plan-v2/schemas/index.ts`
- `lib/agents/health-plan-v2/prompts/index.ts`
- `lib/agents/health-plan-v2/templates/index.ts`
- `lib/agents/health-plan-v2/core/index.ts`

### 19.7 - Configurar PostgresSaver
**Arquivo:** `lib/agents/health-plan-v2/checkpointer/postgres-checkpointer.ts`

- Usa `DATABASE_URL_POOLER` em produção
- Usa `DATABASE_URL` em desenvolvimento
- Schema: `langgraph`
- Singleton pattern com setup automático

### 19.8 - Criar migration para tabelas de checkpoint
**Migration:** `20251203000002_create_langgraph_checkpoint_tables.sql`

```sql
CREATE SCHEMA IF NOT EXISTS langgraph;

CREATE TABLE langgraph.checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE langgraph.checkpoint_blobs (...);
CREATE TABLE langgraph.checkpoint_writes (...);
```

---

## Frontend - Detecção e Roteamento

**Arquivo modificado:** `components/chat/chat-hooks/use-chat-handler.tsx`

### Nova função de detecção
```typescript
function isHealthPlanV2Assistant(assistant): boolean {
  const v2Patterns = ["health plan v2", "health-plan-v2", "health plan 2", "langgraph"]
  return v2Patterns.some(p => name.includes(p) || description.includes(p))
}
```

### Roteamento dinâmico
| Assistente | Endpoint |
|------------|----------|
| Health Plan v2 | `/api/chat/health-plan-agent-v2` |
| Outros Health Plans | `/api/chat/health-plan-agent` |

---

## Migrations Aplicadas via MCP Supabase

1. `create_health_plan_agent_v2_assistant` ✅
2. `create_langgraph_checkpoint_tables` ✅

---

## Assistentes Registrados

| ID | Nome | Versão |
|----|------|--------|
| `1fde19b1-c63a-4359-9a3f-3c3a4be1ddd3` | Health Plan v2 | v2 (LangGraph) |
| `644d7e82-7b8d-4180-aaa5-9c53aaf914e2` | Agente de Planos de Saúde | v1 (Linear) |

---

## Arquivos Criados/Modificados

### Novos arquivos
- `app/api/chat/health-plan-agent-v2/route.ts`
- `lib/agents/health-plan-v2/**/*` (15+ arquivos)
- `supabase/migrations/20251203000001_*.sql`
- `supabase/migrations/20251203000002_*.sql`

### Arquivos modificados
- `package.json` (dependências)
- `components/chat/chat-hooks/use-chat-handler.tsx` (roteamento)

---

## Build Status

```
✅ Build passou com sucesso
├ λ /api/chat/health-plan-agent      0 B
├ λ /api/chat/health-plan-agent-v2   0 B
```

---

## Próximos Passos (Tasks 20+)

1. **Task 20:** Implementar nós do workflow (orchestrator, router)
2. **Task 21:** Integrar capabilities reais do v1
3. **Task 22:** Testes de integração
4. **Task 23:** Monitoramento LangSmith
