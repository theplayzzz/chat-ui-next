# Health Plan Agent

Agente de recomendação de planos de saúde com workflow multi-step e observabilidade via LangSmith.

## Arquitetura

```
lib/tools/health-plan/
├── orchestrator.ts              # Orquestrador do workflow multi-step
├── extract-client-info.ts       # Step 1: Extração de informações do cliente
├── search-health-plans.ts       # Step 2: Busca RAG de planos
├── analyze-compatibility.ts     # Step 3: Análise de compatibilidade
├── fetch-erp-prices.ts          # Step 4: Consulta de preços no ERP
├── generate-recommendation.ts   # Step 5: Geração de recomendação humanizada
├── session-manager.ts           # Gerenciamento de sessão
├── error-handler.ts             # Tratamento de erros e retries
├── logger.ts                    # Logging estruturado
├── audit-logger.ts              # Auditoria LGPD
├── types.ts                     # Types compartilhados
├── schemas/                     # Schemas Zod
│   ├── client-info-schema.ts
│   └── recommendation-schemas.ts
├── prompts/                     # Prompts para GPT
│   ├── extraction-prompts.ts
│   └── recommendation-prompts.ts
├── templates/                   # Templates de resposta
│   └── recommendation-template.ts
├── validators/                  # Validadores
│   └── missing-fields-detector.ts
└── __tests__/                   # Testes unitários
```

## Workflow de 5 Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Health Plan Agent Workflow                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│  │ 1. Extract       │────▶│ 2. Search        │────▶│ 3. Analyze   │ │
│  │    Client Info   │     │    Health Plans  │     │ Compatibility│ │
│  │    (GPT-4o)      │     │    (RAG)         │     │    (GPT-4o)  │ │
│  └──────────────────┘     └──────────────────┘     └──────────────┘ │
│                                                            │        │
│                                                            ▼        │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│  │ 5. Generate      │◀────│ 4. Fetch         │◀────│              │ │
│  │    Recommendation│     │    ERP Prices    │     │              │ │
│  │    (GPT-4o)      │     │    (HTTP API)    │     │              │ │
│  └──────────────────┘     └──────────────────┘     └──────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Step 1: extractClientInfo
- Extrai informações estruturadas do cliente via GPT-4o
- Campos: idade, cidade, estado, orçamento, dependentes, condições pré-existentes
- Retorna se as informações estão completas ou próxima pergunta

### Step 2: searchHealthPlans
- Busca RAG em múltiplas collections do Supabase
- Usa embeddings OpenAI para similaridade semântica
- Retorna planos compatíveis com perfil do cliente

### Step 3: analyzeCompatibility
- Análise de compatibilidade via GPT-4o
- Scoring multi-dimensional (cobertura, preço, rede, etc.)
- Ranking dos melhores planos

### Step 4: fetchERPPrices
- Consulta preços no sistema ERP da corretora
- Cache com TTL configurável
- Fallback para preços estimados

### Step 5: generateRecommendation
- Geração de recomendação humanizada via GPT-4o
- Inclui tabela comparativa, alertas e próximos passos
- Glossário de termos técnicos

## Observabilidade (LangSmith)

### Integração Automática

Cada step é automaticamente rastreado no LangSmith usando o padrão oficial do SDK:

```typescript
import { traceable } from "@/lib/monitoring/langsmith-setup"

export const extractClientInfo = traceable(
  async (params, apiKey) => {
    // Implementação
  },
  {
    name: "extractClientInfo",
    run_type: "chain",
    tags: ["health-plan", "step-1"]
  }
)
```

### Hierarquia de Traces

```
health-plan-agent (route handler)
├── extractClientInfo (step 1)
│   └── OpenAI chat completion (auto-traced via wrapOpenAI)
├── searchHealthPlans (step 2)
│   └── OpenAI embeddings (auto-traced)
├── analyzeCompatibility (step 3)
│   └── OpenAI chat completion (auto-traced)
├── fetchERPPrices (step 4)
└── generateRecommendation (step 5)
    └── OpenAI chat completion (auto-traced)
```

### Agrupamento por Chat

Todas as interações do mesmo chat são agrupadas usando `session_id`:

```typescript
import { setSessionId } from "@/lib/monitoring/langsmith-setup"

// No route handler
if (chatId) {
  setSessionId(chatId)
}
```

### Métricas de Negócio

Métricas de negócio são adicionadas ao trace:

```typescript
import { addRunMetadata } from "@/lib/monitoring/langsmith-setup"

addRunMetadata({
  businessMetrics: {
    plansFound: 15,
    plansAnalyzed: 5,
    topPlanScore: 87,
    clientCompleteness: 85
  }
})
```

## API

### Endpoint Principal

```
POST /api/chat/health-plan-agent
```

### Request Body

```typescript
interface HealthPlanAgentRequest {
  workspaceId: string        // ID do workspace
  assistantId: string        // ID do assistente
  chatId?: string            // ID do chat (para agrupamento LangSmith)
  sessionId?: string         // ID da sessão (para retomada)
  resetToStep?: number       // Resetar para step específico (1-5)
  model?: string             // Modelo GPT (default: gpt-4o-mini)
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
}
```

### Response

Streaming de texto com progresso e recomendação final.

### Headers de Resposta

```
X-Session-Id: uuid          // ID da sessão para retomada
X-Execution-Time: 5432      // Tempo de execução em ms
```

## Configuração

### Variáveis de Ambiente

```bash
# Obrigatórias
OPENAI_API_KEY=sk-...

# LangSmith (opcional, mas recomendado)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=health-plan-agent

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Timeouts por Step

| Step | Timeout | Descrição |
|------|---------|-----------|
| 1    | 10s     | extractClientInfo |
| 2    | 15s     | searchHealthPlans |
| 3    | 20s     | analyzeCompatibility |
| 4    | 10s     | fetchERPPrices |
| 5    | 20s     | generateRecommendation |

## Uso

### Exemplo Básico

```typescript
import { HealthPlanOrchestrator } from "@/lib/tools/health-plan/orchestrator"

const orchestrator = new HealthPlanOrchestrator({
  workspaceId: "uuid",
  userId: "uuid",
  assistantId: "uuid",
  openaiApiKey: process.env.OPENAI_API_KEY!,
  chatId: "uuid" // Para agrupamento LangSmith
})

// Streaming de resposta
for await (const chunk of orchestrator.executeWorkflow(messages)) {
  console.log(chunk)
}
```

### Retomada de Sessão

```typescript
const orchestrator = new HealthPlanOrchestrator({
  sessionId: "existing-session-uuid", // Retoma sessão existente
  // ... outras configs
})
```

### Reset para Step Específico

```typescript
const orchestrator = new HealthPlanOrchestrator({
  resetToStep: 3, // Refaz análise de compatibilidade
  // ... outras configs
})
```

## Testes

```bash
# Testes unitários
npm test lib/tools/health-plan/__tests__/

# Testes específicos
npm test lib/tools/health-plan/__tests__/extract-client-info.test.ts
npm test lib/tools/health-plan/__tests__/generate-recommendation.test.ts
```

## Módulo de Monitoramento

O módulo `lib/monitoring/` fornece as ferramentas de observabilidade:

```typescript
// Importação principal
import {
  traceable,
  createTracedOpenAI,
  addRunMetadata,
  setSessionId,
  getCurrentRunTree
} from "@/lib/monitoring"
```

### Arquivos Principais

| Arquivo | Descrição |
|---------|-----------|
| `langsmith-setup.ts` | Setup principal com `wrapOpenAI` e `traceable` |
| `langsmith-config.ts` | Configuração e health check |
| `metrics-collector.ts` | Coleta de métricas e custos |
| `alerts.ts` | Sistema de alertas |
| `correlation.ts` | Gerenciamento de correlation IDs |

## Referências

- **PRD:** `/.taskmaster/docs/health-plan-agent-prd.md`
- **LangSmith SDK:** [langsmith-sdk](https://github.com/langchain-ai/langsmith-sdk)
- **OpenAI API:** [platform.openai.com/docs](https://platform.openai.com/docs)

---

**Status:** Produção
**Última Atualização:** 2025-12-01
**Versão:** 2.0.0
