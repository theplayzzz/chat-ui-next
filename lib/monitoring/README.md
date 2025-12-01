# Monitoring Module

Módulo de observabilidade com integração LangSmith para tracing automático de chamadas OpenAI e workflows.

## Arquitetura

```
lib/monitoring/
├── langsmith-setup.ts       # Setup principal (wrapOpenAI, traceable)
├── langsmith-config.ts      # Configuração e health check
├── index.ts                 # Exports centralizados
├── metrics-collector.ts     # Coleta de métricas e custos
├── alerts.ts                # Sistema de alertas
├── correlation.ts           # Gerenciamento de correlation IDs
└── performance-dashboard.ts # Dashboard de performance
```

## Uso Principal

### Importação

```typescript
import {
  // Tracing principal
  traceable,
  createTracedOpenAI,
  wrapOpenAI,

  // Helpers
  addRunMetadata,
  addRunTags,
  setSessionId,
  getCurrentRunTree,

  // Configuração
  checkLangSmithConfig,

  // Constantes
  WORKFLOW_STEP_NAMES,
  STEP_RUN_TYPES
} from "@/lib/monitoring"
```

### Wrapping de Funções com traceable

```typescript
import { traceable } from "@/lib/monitoring"

export const myFunction = traceable(
  async (params: MyParams): Promise<MyResult> => {
    // Implementação
    return result
  },
  {
    name: "myFunction",
    run_type: "chain",  // "chain" | "llm" | "tool" | "retriever"
    tags: ["my-module", "step-1"],
    metadata: {
      description: "Descrição da função"
    }
  }
)
```

### Cliente OpenAI com Tracing Automático

```typescript
import { createTracedOpenAI } from "@/lib/monitoring"

const client = createTracedOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  defaultMetadata: { module: "my-module" },
  defaultTags: ["production"]
})

// Todas as chamadas são automaticamente rastreadas
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }]
})
```

### Agrupamento por Sessão

```typescript
import { setSessionId, addRunMetadata } from "@/lib/monitoring"

// Agrupa todos os traces do mesmo chat
setSessionId(chatId)

// Adiciona metadados customizados
addRunMetadata({
  userId: "user-123",
  workspaceId: "workspace-456",
  businessMetrics: {
    plansFound: 10,
    conversionRate: 0.85
  }
})
```

### Obter Run Atual

```typescript
import { getCurrentRunTree } from "@/lib/monitoring"

const runTree = getCurrentRunTree()
if (runTree) {
  console.log("Run ID:", runTree.id)
  console.log("Run Name:", runTree.name)
}
```

## Configuração

### Variáveis de Ambiente

```bash
# Habilitar tracing (obrigatório)
LANGSMITH_TRACING=true

# Credenciais
LANGSMITH_API_KEY=lsv2_sk_...

# Projeto (opcional)
LANGSMITH_PROJECT=health-plan-agent

# Endpoint (opcional, default: https://api.smith.langchain.com)
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

### Verificar Configuração

```typescript
import { checkLangSmithConfig } from "@/lib/monitoring"

const config = checkLangSmithConfig()
console.log(config)
// {
//   enabled: true,
//   hasApiKey: true,
//   project: "health-plan-agent",
//   endpoint: "https://api.smith.langchain.com",
//   isValid: true
// }
```

## Run Types

| Tipo | Uso |
|------|-----|
| `chain` | Workflows, orquestradores, funções compostas |
| `llm` | Chamadas diretas a LLMs |
| `tool` | Ferramentas, funções utilitárias |
| `retriever` | Buscas RAG, embeddings |
| `embedding` | Geração de embeddings |

## Hierarquia de Traces

```
Route Handler (chain)
├── Step 1 (chain)
│   └── OpenAI Chat (llm) - auto via wrapOpenAI
├── Step 2 (retriever)
│   └── OpenAI Embeddings (embedding) - auto via wrapOpenAI
├── Step 3 (chain)
│   └── OpenAI Chat (llm)
└── Step 4 (chain)
    └── OpenAI Chat (llm)
```

## Métricas e Alertas

### Coletor de Métricas

```typescript
import { createMetricsCollector, calculateCost } from "@/lib/monitoring"

const metrics = createMetricsCollector(sessionId, correlationId, workspaceId)

metrics.startStep(1, "extractClientInfo")
metrics.recordLLMCall(callId, "extract", "gpt-4o", tokens, durationMs, true)
metrics.endStep(true)

const summary = metrics.finalize(true)
console.log(summary.totalCost)  // { totalCost: 0.0125, currency: "USD" }
```

### Sistema de Alertas

```typescript
import { createAlertManager, checkLatencyAlert } from "@/lib/monitoring"

const alertManager = createAlertManager()

// Verifica alerta de latência
const alert = checkLatencyAlert(5000, { warning: 3000, critical: 10000 })
if (alert) {
  console.warn(alert.message)
}
```

## Migração do Padrão Antigo

### Antes (Manual)

```typescript
// NÃO USAR - Código legado
import { LangSmithTracer } from "./logger"

const tracer = new LangSmithTracer(workspaceId, userId)
await tracer.startRun()
await tracer.logStep(1, "step1", "start", inputs)
// ...
await tracer.endRun(true, duration)
```

### Depois (Automático)

```typescript
// USAR - Padrão oficial
import { traceable, setSessionId } from "@/lib/monitoring"

export const myStep = traceable(
  async (params) => {
    // LangSmith rastreia automaticamente
    return result
  },
  { name: "myStep", run_type: "chain" }
)

// No handler
setSessionId(chatId)
await myStep(params)
```

## Arquivos Deprecados

Os seguintes arquivos foram removidos em favor do novo padrão:

- `openai-tracer.ts` - Substituído por `wrapOpenAI`
- `traced-openai.ts` - Substituído por `createTracedOpenAI`
- `orchestrator-tracer.ts` - Substituído por wrappers `traceable`

## Referências

- [LangSmith SDK](https://github.com/langchain-ai/langsmith-sdk)
- [LangSmith Docs](https://docs.smith.langchain.com/)
- [wrapOpenAI Guide](https://docs.smith.langchain.com/observability/how_to_guides/tracing/trace_with_langchain#openai)

---

**Versão:** 2.0.0
**Última Atualização:** 2025-12-01
