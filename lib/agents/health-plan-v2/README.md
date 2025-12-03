# Health Plan Agent v2 - LangGraph.js

Agente conversacional adaptativo para recomendação de planos de saúde, implementado com LangGraph.js.

## Arquitetura

```
lib/agents/health-plan-v2/
├── nodes/                    # Nós do grafo
│   ├── orchestrator.ts       # Nó principal que interpreta intenções
│   ├── router.ts             # Router de intenções para capacidades
│   └── capabilities/         # Capacidades executáveis
│       ├── update-client-info.ts
│       ├── search-plans.ts
│       ├── analyze-compatibility.ts
│       ├── fetch-prices.ts
│       ├── generate-recommendation.ts
│       ├── respond-to-user.ts
│       └── end-conversation.ts
├── state/                    # Gerenciamento de estado
│   ├── state-annotation.ts   # HealthPlanStateAnnotation
│   ├── state-manager.ts      # Gerenciador de estado mutável
│   └── cache-invalidation.ts # Lógica de invalidação de cache
├── workflow/                 # Workflow principal
│   └── workflow.ts           # StateGraph com loop conversacional
├── intents/                  # Classificação de intenções
│   ├── intent-classifier.ts  # Classificador via GPT
│   └── prompts/              # Prompts para classificação
├── checkpointer/             # Persistência de estado
│   └── postgres-checkpointer.ts
├── schemas/                  # Schemas de validação (importados do v1)
├── prompts/                  # Prompts do agente (importados do v1)
├── templates/                # Templates de resposta (importados do v1)
├── core/                     # Lógica de negócio (importada do v1)
├── __tests__/                # Testes unitários
├── types.ts                  # Definições de tipos
└── index.ts                  # Exports centralizados
```

## Capacidades

| Capacidade | Trigger | Pode Repetir? | Invalida Cache? |
|------------|---------|---------------|-----------------|
| `updateClientInfo` | Usuário fornece dados pessoais | Sim | Sim |
| `searchPlans` | Dados suficientes OU usuário pede | Sim | Sim |
| `analyzeCompatibility` | Planos encontrados OU usuário pede | Sim | Não |
| `fetchPrices` | Usuário pede explicitamente | Sim | Não |
| `generateRecommendation` | Análise pronta OU usuário pede | Sim | Não |
| `respondToUser` | Conversa geral, dúvidas | Sim | Não |
| `endConversation` | Usuário diz "finalizar" | Não | N/A |

## Uso

```typescript
import { createHealthPlanWorkflow } from '@/lib/agents/health-plan-v2'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

const checkpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL_POOLER!,
  { schema: 'langgraph' }
)

const workflow = createHealthPlanWorkflow()
const app = workflow.compile({ checkpointer })

// Executar com streaming
const stream = app.stream(
  { messages: [{ role: 'user', content: 'Preciso de um plano de saúde' }] },
  { configurable: { thread_id: chatId } }
)
```

## PRD

Veja `.taskmaster/docs/health-plan-agent-v2-langgraph-prd.md` para detalhes completos.
