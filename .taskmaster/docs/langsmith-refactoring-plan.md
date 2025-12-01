# Plano de Refatoração LangSmith

## Objetivo
Refatorar a implementação do LangSmith para usar as abstrações oficiais do SDK (`wrapOpenAI`, `traceable`) ao invés da abordagem manual atual.

## Status
- [x] Tarefa 1: Adicionar `LANGSMITH_TRACING=true` no `.env.local`
- [ ] Tarefa 2-14: Pendentes

---

## Fase 1: Fundação (Tarefas 2-3)
**Objetivo**: Criar a base para a nova implementação

### Tarefa 2: Verificar versão do langsmith
**Status**: ✅ JÁ CONCLUÍDA (versão 0.3.82 - atualizada)
**Tempo estimado**: N/A

### Tarefa 3: Criar `langsmith-setup.ts` com `wrapOpenAI`
**Prioridade**: 🔴 Alta
**Dependências**: Tarefa 1 (concluída)
**Arquivo**: `lib/monitoring/langsmith-setup.ts`

**O que criar**:
```typescript
// Exportar:
// - createTracedOpenAI(apiKey: string) - retorna cliente OpenAI com tracing
// - traceable, getCurrentRunTree - re-exportar do langsmith
// - checkLangSmithConfig() - validação de configuração
// - LANGSMITH_RUN_TYPES - constantes para run_type
```

**Ações**:
1. Criar arquivo `lib/monitoring/langsmith-setup.ts`
2. Implementar `createTracedOpenAI()` usando `wrapOpenAI`
3. Implementar `checkLangSmithConfig()` para validação
4. Re-exportar `traceable` e `getCurrentRunTree`
5. Criar tipos TypeScript para configuração
6. Adicionar exports no `lib/monitoring/index.ts`

---

## Fase 2: Refatorar Steps do Workflow (Tarefas 4-7)
**Objetivo**: Converter cada step para usar `traceable`

### Tarefa 4: Refatorar `extract-client-info.ts`
**Prioridade**: 🔴 Alta
**Dependências**: Tarefa 3
**Arquivo**: `lib/tools/health-plan/extract-client-info.ts`

**Mudanças**:
1. Importar `traceable`, `createTracedOpenAI` de `langsmith-setup`
2. Envolver a função principal com `traceable`
3. Configurar metadata: `{ step: 1, name: "extractClientInfo" }`
4. Usar cliente OpenAI trackeado (se aplicável)
5. Remover tracing manual (se existir)

**Assinatura esperada**:
```typescript
export const extractClientInfo = traceable(
  async (params: ExtractClientInfoParams): Promise<ExtractClientInfoResult> => {
    // implementação
  },
  {
    name: "extractClientInfo",
    run_type: "chain",
    tags: ["health-plan", "step-1"],
    metadata: { step: 1 }
  }
)
```

### Tarefa 5: Refatorar `search-health-plans.ts`
**Prioridade**: 🔴 Alta
**Dependências**: Tarefa 3
**Arquivo**: `lib/tools/health-plan/search-health-plans.ts`

**Mudanças**:
1. Importar `traceable` de `langsmith-setup`
2. Envolver a função principal com `traceable`
3. Configurar `run_type: "retriever"` (tipo apropriado para busca RAG)
4. Configurar metadata: `{ step: 2 }`

### Tarefa 6: Refatorar `analyze-compatibility.ts`
**Prioridade**: 🔴 Alta
**Dependências**: Tarefa 3
**Arquivo**: `lib/tools/health-plan/analyze-compatibility.ts`

**Mudanças**:
1. Importar `traceable`, `createTracedOpenAI` de `langsmith-setup`
2. Envolver a função principal com `traceable`
3. Configurar `run_type: "chain"`
4. Configurar metadata: `{ step: 3 }`
5. Se houver múltiplas chamadas LLM, cada uma será automaticamente child

### Tarefa 7: Refatorar `generate-recommendation.ts`
**Prioridade**: 🔴 Alta
**Dependências**: Tarefa 3
**Arquivo**: `lib/tools/health-plan/generate-recommendation.ts`

**Mudanças**:
1. Importar `traceable`, `createTracedOpenAI` de `langsmith-setup`
2. Envolver a função principal com `traceable`
3. Configurar `run_type: "chain"`
4. Configurar metadata: `{ step: 5 }`

**Nota**: Step 4 (fetch-erp-prices) não usa LLM, mas pode ser trackeado como `run_type: "tool"`

---

## Fase 3: Integrar Route Handler (Tarefa 8)
**Objetivo**: Envolver o endpoint com tracing de alto nível

### Tarefa 8: Envolver route handler com `traceable`
**Prioridade**: 🔴 Alta
**Dependências**: Tarefas 4-7
**Arquivo**: `app/api/chat/health-plan-agent/route.ts`

**Mudanças**:
1. Importar `traceable`, `getCurrentRunTree` de `langsmith-setup`
2. Criar função `handler` envolvida com `traceable`
3. Adicionar metadata dinâmico (workspaceId, userId, chatId)
4. Usar `session_id` no metadata para agrupar por conversa
5. Manter streaming response

**Estrutura esperada**:
```typescript
const handler = traceable(
  async (body: HealthPlanAgentRequest) => {
    const runTree = getCurrentRunTree()
    runTree.extra.metadata = {
      ...runTree.extra.metadata,
      workspaceId: body.workspaceId,
      userId: body.userId,
      session_id: body.chatId, // Agrupa no LangSmith
    }
    // ... resto da lógica
  },
  { name: "health-plan-agent", run_type: "chain" }
)

export async function POST(request: NextRequest) {
  const body = await request.json()
  return handler(body)
}
```

---

## Fase 4: Agrupar por Sessão (Tarefa 9)
**Objetivo**: Usar session_id nativo do LangSmith

### Tarefa 9: Usar `session_id` no metadata
**Prioridade**: 🟡 Média
**Dependências**: Tarefa 8
**Arquivos**: `orchestrator.ts`, route handler

**Mudanças**:
1. Adicionar `session_id: chatId` no metadata do run principal
2. O LangSmith agrupa automaticamente por session_id
3. Remover dependência do `chat-trace-manager.ts` (Supabase)
4. Atualizar orchestrator para passar chatId como session_id

**Benefício**: Não precisa mais salvar trace_id no Supabase

---

## Fase 5: Integrar Métricas e Alertas (Tarefas 10-11)
**Objetivo**: Usar MetricsCollector e AlertManager nos steps

### Tarefa 10: Integrar `MetricsCollector` nos steps
**Prioridade**: 🟡 Média
**Dependências**: Tarefas 4-7
**Arquivos**: Todos os steps + `orchestrator.ts`

**Mudanças**:
1. Importar `MetricsCollector` no orchestrator
2. Passar instância para cada step
3. Chamar `recordLLMCall()` após cada chamada OpenAI
4. O token usage vem automaticamente do response OpenAI
5. Chamar `finalize()` ao final do workflow

**Exemplo**:
```typescript
const extractClientInfo = traceable(
  async (params, metricsCollector?: MetricsCollector) => {
    metricsCollector?.startStep(1, "extractClientInfo")

    const response = await openai.chat.completions.create(...)

    metricsCollector?.recordLLMCall(
      "extract-info",
      "gpt-4o",
      response.usage,
      durationMs,
      true
    )

    metricsCollector?.endStep(true)
    return result
  },
  { name: "extractClientInfo", run_type: "chain" }
)
```

### Tarefa 11: Integrar `AlertManager` nos steps
**Prioridade**: 🟡 Média
**Dependências**: Tarefa 10
**Arquivos**: `orchestrator.ts`

**Mudanças**:
1. Criar instância de AlertManager no orchestrator
2. Verificar thresholds após cada step
3. Logar alertas quando thresholds são excedidos
4. Chamar `getSummary()` ao final

**Exemplo**:
```typescript
// No orchestrator
const alertManager = createAlertManager(correlationId, sessionId, workspaceId)

// Após cada step
alertManager.checkMetric("step_latency_ms", stepDurationMs, { step: 1 })
alertManager.checkMetric("session_tokens", totalTokens)

// Ao final
const alerts = alertManager.getAlerts()
if (alerts.length > 0) {
  console.log("[orchestrator] Alerts:", JSON.stringify(alerts))
}
```

---

## Fase 6: Limpeza de Código Morto (Tarefas 12-14)
**Objetivo**: Remover código não utilizado

### Tarefa 12: Remover código morto
**Prioridade**: 🟢 Baixa
**Dependências**: Tarefas 8-11 (testar que tudo funciona antes)

**Arquivos a REMOVER**:
```
lib/monitoring/orchestrator-tracer.ts  # Não usado
lib/monitoring/openai-tracer.ts        # Substituído por wrapOpenAI
lib/monitoring/traced-openai.ts        # Substituído por wrapOpenAI
lib/monitoring/correlation.ts          # Simplificar ou remover
```

**Ações**:
1. Verificar que nenhum import referencia esses arquivos
2. Remover arquivos
3. Atualizar `lib/monitoring/index.ts`

### Tarefa 13: Remover `chat-trace-manager.ts`
**Prioridade**: 🟢 Baixa
**Dependências**: Tarefa 9

**Arquivo a remover**: `lib/tools/health-plan/chat-trace-manager.ts`

**Ações**:
1. Verificar que session_id no metadata funciona
2. Remover imports no orchestrator
3. Remover arquivo
4. (Opcional) Remover coluna `langsmith_trace_id` da tabela `chats`

### Tarefa 14: Simplificar `logger.ts`
**Prioridade**: 🟢 Baixa
**Dependências**: Tarefas 4-8

**Arquivo**: `lib/tools/health-plan/logger.ts`

**Mudanças**:
1. Remover classe `LangSmithTracer` (linhas 439-716)
2. Manter apenas `HealthPlanLogger` para logging estruturado
3. Remover inicialização de langSmithTracer no construtor
4. Manter `maskSensitiveData()` (útil para logs)

---

## Ordem de Execução Recomendada

```
Fase 1 (Fundação)
    │
    ├── [2] Verificar langsmith ✅ Concluída
    │
    └── [3] Criar langsmith-setup.ts
            │
            ▼
Fase 2 (Steps) - Podem ser feitas em paralelo
    │
    ├── [4] extract-client-info.ts
    ├── [5] search-health-plans.ts
    ├── [6] analyze-compatibility.ts
    └── [7] generate-recommendation.ts
            │
            ▼
Fase 3 (Route Handler)
    │
    └── [8] Envolver route handler
            │
            ▼
Fase 4 (Session)
    │
    └── [9] session_id no metadata
            │
            ▼
Fase 5 (Métricas) - Podem ser feitas em paralelo
    │
    ├── [10] MetricsCollector
    └── [11] AlertManager
            │
            ▼
Fase 6 (Limpeza) - Fazer DEPOIS de testar
    │
    ├── [12] Remover código morto
    ├── [13] Remover chat-trace-manager
    └── [14] Simplificar logger.ts
```

---

## Testes Necessários

### Após Fase 2-3:
1. Executar workflow completo
2. Verificar traces no dashboard LangSmith
3. Confirmar hierarquia: `handler → step1 → step2 → ... → step5`
4. Verificar token usage automático

### Após Fase 4:
1. Enviar múltiplas mensagens no mesmo chat
2. Verificar agrupamento por session_id no LangSmith
3. Filtrar por `session_id` no dashboard

### Após Fase 5:
1. Verificar métricas de custo e tokens
2. Testar threshold de latência (forçar timeout)
3. Verificar alertas no log

### Após Fase 6:
1. Build limpo (`npm run build`)
2. Testes unitários (`npm test`)
3. Workflow completo end-to-end

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Breaking changes no workflow | Manter código antigo até testar novo |
| Streaming não funcionar com traceable | Testar streaming early |
| Perda de dados históricos | Manter coluna `langsmith_trace_id` por enquanto |
| Performance overhead do tracing | wrapOpenAI é otimizado, mínimo overhead |

---

## Critérios de Sucesso

- [ ] Todos os steps aparecem no LangSmith com hierarquia correta
- [ ] Token usage é capturado automaticamente
- [ ] Conversas são agrupadas por session_id
- [ ] Métricas de custo são calculadas
- [ ] Alertas disparam quando thresholds são excedidos
- [ ] Build passa sem erros
- [ ] Testes passam
- [ ] Código morto removido

---

## Tempo Estimado

| Fase | Tarefas | Tempo |
|------|---------|-------|
| Fase 1 | 2-3 | 30 min |
| Fase 2 | 4-7 | 2 horas |
| Fase 3 | 8 | 45 min |
| Fase 4 | 9 | 30 min |
| Fase 5 | 10-11 | 1 hora |
| Fase 6 | 12-14 | 1 hora |
| **Total** | **13 tarefas** | **~6 horas** |

---

## Próximos Passos

1. Aprovar este plano
2. Iniciar pela **Tarefa 3** (criar langsmith-setup.ts)
3. Seguir ordem de execução
4. Testar após cada fase
