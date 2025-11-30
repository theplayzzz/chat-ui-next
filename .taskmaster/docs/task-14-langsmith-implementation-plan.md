# Plano de Implementação: Task #14 - Integrar Monitoramento LangSmith

> **Data de criação:** 2025-11-29
> **PRD Referência:** RF-013 (Monitoramento e Observabilidade com LangSmith)
> **Complexidade:** 8/10
> **Subtarefas:** 8

---

## 1. Contexto Atual

### O que JÁ existe no projeto:
- `LangSmithTracer` em `lib/tools/health-plan/logger.ts` (integração básica)
- `maskSensitiveData()` para anonimização antes de envio
- Session tracking com UUID em `session-manager.ts`
- Logging estruturado com níveis INFO/WARN/ERROR/DEBUG
- Headers `X-Session-Id` e `X-Execution-Time` na resposta

### O que FALTA implementar:
1. SDK oficial LangSmith (atual usa implementação manual)
2. Tracing hierárquico completo (spans aninhados)
3. Métricas granulares (latência, tokens, custos)
4. Correlation IDs propagados em todos componentes
5. Dashboards de performance configurados
6. Sistema de alertas para erros/timeouts

---

## 2. Decisões Técnicas

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| **LangSmith** | Conta já configurada | Usuário já possui API key |
| **Alertas** | Apenas logs | Console + LangSmith, sem Slack/Email |
| **Sampling** | 100% sempre | Rastrear todas requisições |

**Implicações:**
- Subtarefa 14.7 simplificada: sem webhooks Slack/Email
- Sem necessidade de circuit breaker de sampling
- Custo de tracing proporcional ao volume de uso

---

## 3. Plano de Implementação por Subtarefa

### 14.1 - Configurar SDK LangSmith e conexão inicial

**Arquivos a criar/modificar:**
- `lib/monitoring/langsmith-config.ts` (NOVO)
- `.env.local` (adicionar variáveis)
- `package.json` (adicionar dependência)

**Ações:**
1. Instalar `langsmith` SDK oficial: `npm install langsmith`
2. Criar arquivo de configuração centralizado:
   ```typescript
   // lib/monitoring/langsmith-config.ts
   import { Client } from "langsmith"

   export const langsmithClient = new Client({
     apiKey: process.env.LANGSMITH_API_KEY,
     projectName: process.env.LANGSMITH_PROJECT || "health-plan-agent"
   })

   export function isLangSmithEnabled(): boolean {
     return !!process.env.LANGSMITH_API_KEY
   }
   ```
3. Adicionar variáveis ao `.env.local`:
   - `LANGSMITH_API_KEY`
   - `LANGSMITH_PROJECT=health-plan-agent`
4. Criar função de validação de conexão
5. Documentar setup no README

**Teste:** Enviar trace simples e verificar no dashboard LangSmith

---

### 14.2 - Implementar tracing de todas as chamadas GPT-4o

**Arquivos a criar/modificar:**
- `lib/monitoring/openai-tracer.ts` (NOVO)
- `lib/tools/health-plan/extract-client-info.ts` (modificar)
- `lib/tools/health-plan/analyze-compatibility.ts` (modificar)
- `lib/tools/health-plan/generate-recommendation.ts` (modificar)

**Ações:**
1. Criar wrapper `tracedOpenAICall()` que:
   - Captura: prompt, response, temperatura, max_tokens, model
   - Registra timestamp início/fim e latência
   - Adiciona tags por tipo de chamada (extraction, ranking, recommendation)
   - Rastreia erros de API

2. Instrumentar todas as chamadas OpenAI nas 3 ferramentas:
   - `extract-client-info.ts`: 2 chamadas (extração + próxima pergunta)
   - `analyze-compatibility.ts`: 4 chamadas por plano × até 10 planos
   - `generate-recommendation.ts`: 5 chamadas (uma por seção)

**Estrutura do tracer:**
```typescript
export async function tracedOpenAICall<T>(
  runName: string,
  runType: "llm" | "tool",
  inputs: Record<string, any>,
  fn: () => Promise<T>,
  metadata?: { step?: number, toolName?: string, correlationId?: string }
): Promise<T>
```

**Teste:** Executar cada tool e verificar traces completos no LangSmith

---

### 14.3 - Configurar tracking detalhado do orquestrador principal

**Arquivos a criar/modificar:**
- `lib/monitoring/orchestrator-tracer.ts` (NOVO)
- `lib/tools/health-plan/orchestrator.ts` (modificar)

**Ações:**
1. Criar sistema de spans hierárquicos:
   ```
   [Session Run - health-plan-recommendation]
   ├── [Step 1 - extractClientInfo]
   │   └── [LLM Call - extraction]
   ├── [Step 2 - searchHealthPlans]
   │   └── [Embedding Call]
   ├── [Step 3 - analyzeCompatibility]
   │   ├── [LLM Call - eligibility-plan-1]
   │   ├── [LLM Call - coverage-plan-1]
   │   └── ...
   ├── [Step 4 - fetchERPPrices]
   │   └── [HTTP Call - ERP API]
   └── [Step 5 - generateRecommendation]
       ├── [LLM Call - intro]
       ├── [LLM Call - main-recommendation]
       └── ...
   ```

2. Capturar por step:
   - Tempo de execução
   - Dados passados entre steps
   - Decisões de roteamento
   - Estado da sessão

3. Adicionar contexto de negócio:
   - Número de planos encontrados
   - Flags de dados faltantes
   - Preferências do usuário

**Teste:** Fluxo E2E e verificar hierarquia de spans

---

### 14.4 - Implementar métricas granulares (latência, tokens, custos)

**Arquivos a criar/modificar:**
- `lib/monitoring/metrics-collector.ts` (NOVO)
- `lib/monitoring/cost-calculator.ts` (NOVO)

**Ações:**
1. Criar tabela de preços GPT-4o:
   ```typescript
   const GPT4O_PRICING = {
     input: 2.50 / 1_000_000,  // $2.50 per 1M input tokens
     output: 10.00 / 1_000_000  // $10.00 per 1M output tokens
   }
   ```

2. Implementar `MetricsCollector`:
   ```typescript
   class MetricsCollector {
     recordLatency(tool: string, durationMs: number)
     recordTokens(tool: string, input: number, output: number)
     recordCost(tool: string, cost: number)
     recordSuccess(tool: string)
     recordError(tool: string, errorType: string)

     getMetrics(): AggregatedMetrics
     getMetricsByTool(tool: string): ToolMetrics
   }
   ```

3. Métricas agregadas:
   - Latência: avg, p50, p95, p99 por tool
   - Tokens: input/output por tool e total
   - Custos: por execução, por tool, acumulado
   - Taxa sucesso/erro por tool

4. Enviar métricas como metadata nos traces LangSmith

**Teste:** 10+ sessões simuladas, validar métricas agregadas

---

### 14.5 - Desenvolver correlation IDs para sessões completas

**Arquivos a criar/modificar:**
- `lib/monitoring/correlation.ts` (NOVO)
- `lib/tools/health-plan/orchestrator.ts` (modificar)
- `lib/tools/health-plan/session-manager.ts` (modificar)
- Todas as ferramentas (propagar ID)

**Ações:**
1. Gerar UUID único no início de cada sessão:
   ```typescript
   export function generateCorrelationId(): string {
     return `hp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
   }
   ```

2. Propagar correlation_id através de:
   - Contexto de cada tool (parâmetro)
   - Headers de chamadas LLM (via metadata)
   - Metadata de traces LangSmith
   - Logs de aplicação
   - Sessão no Supabase

3. Estrutura de contexto:
   ```typescript
   interface TracingContext {
     correlationId: string
     sessionId: string
     userId?: string
     workspaceId: string
     parentRunId?: string
   }
   ```

4. Permitir busca por correlation_id no LangSmith

**Teste:** Sessão simulada, verificar mesmo ID em todos traces

---

### 14.6 - Configurar dashboards de performance personalizados

**Arquivos a criar/modificar:**
- `docs/langsmith-dashboards.md` (NOVO - documentação)
- Scripts de configuração se necessário

**Ações:**
1. Configurar no LangSmith UI:
   - **Dashboard "Overview"**:
     - Requests/hora
     - Latência média
     - Custo total (24h, 7d, 30d)
     - Taxa de erro

   - **Dashboard "Tools Performance"**:
     - Latência por tool (gráfico de barras)
     - Tokens por tool
     - Custos por tool
     - Taxa de sucesso por tool

   - **Dashboard "User Sessions"**:
     - Duração média de sessão
     - Steps por sessão
     - Taxa de conversão (chegou até recomendação)
     - Abandono por step

2. Configurar filtros:
   - Por período (1h, 24h, 7d, 30d)
   - Por tool
   - Por status (success/error)
   - Por workspace

3. Documentar configuração para replicar

**Teste:** Gerar dados sintéticos, validar dashboards

---

### 14.7 - Implementar sistema de alertas para erros e timeouts

**Arquivos a criar/modificar:**
- `lib/monitoring/alerts.ts` (NOVO)

**Ações:**
1. Definir regras de alerta (logs apenas):

   | Alerta | Condição | Severidade |
   |--------|----------|------------|
   | High Error Rate | error_rate > 5% (5min) | Critical |
   | High Latency | p95 > 10s | Warning |
   | Cost Spike | cost/hour > threshold | Warning |
   | Timeout | any tool timeout | Critical |
   | ERP Unavailable | ERP failures > 3 (5min) | Critical |

2. Sistema de alertas via logs:
   - Console logs estruturados com `[ALERT]` prefix
   - Metadata enviada ao LangSmith como tags
   - Severidade visível nos traces

3. Implementar categorias de severidade:
   - `critical`: Log ERROR + tag LangSmith
   - `warning`: Log WARN + tag LangSmith
   - `info`: Log INFO + tag LangSmith

4. AlertManager class:
   ```typescript
   class AlertManager {
     checkErrorRate(windowMs: number): Alert | null
     checkLatency(p95Ms: number): Alert | null
     checkCost(hourlyThreshold: number): Alert | null
     logAlert(alert: Alert): void
   }
   ```

**Teste:** Simular cenários de erro, validar logs de alerta

---

### 14.8 - Validar traces end-to-end e otimizar coleta de dados

**Arquivos a criar/modificar:**
- `lib/monitoring/__tests__/langsmith-integration.test.ts` (NOVO)
- `docs/observability-guide.md` (NOVO)

**Ações:**
1. Testes E2E:
   - Validar 100% dos traces aparecem
   - Verificar hierarquia de spans correta
   - Confirmar correlation IDs funcionam
   - Testar métricas são precisas

2. Medir overhead:
   - Latência adicionada pelo tracing (meta: < 100ms)
   - Memória consumida
   - Impacto em throughput

3. Otimizações:
   - Batch de envio de métricas
   - Compressão de payloads grandes
   - Circuit breaker se LangSmith indisponível

4. Documentar:
   - Guia de configuração completo
   - Troubleshooting guide
   - Como consultar traces
   - Como interpretar dashboards

**Teste:** 50+ sessões reais, validar estabilidade

---

## 4. Arquivos Críticos

### Arquivos NOVOS a criar:

| Arquivo | Subtarefa | Descrição |
|---------|-----------|-----------|
| `lib/monitoring/langsmith-config.ts` | 14.1 | Configuração centralizada do SDK |
| `lib/monitoring/openai-tracer.ts` | 14.2 | Wrapper para chamadas OpenAI |
| `lib/monitoring/orchestrator-tracer.ts` | 14.3 | Tracing do orquestrador |
| `lib/monitoring/metrics-collector.ts` | 14.4 | Coleta de métricas |
| `lib/monitoring/cost-calculator.ts` | 14.4 | Cálculo de custos |
| `lib/monitoring/correlation.ts` | 14.5 | Gerenciamento de correlation IDs |
| `lib/monitoring/alerts.ts` | 14.7 | Sistema de alertas |

### Arquivos a MODIFICAR:

| Arquivo | Subtarefa | Modificação |
|---------|-----------|-------------|
| `lib/tools/health-plan/orchestrator.ts` | 14.3, 14.5 | Integrar tracing e correlation |
| `lib/tools/health-plan/extract-client-info.ts` | 14.2 | Adicionar traced calls |
| `lib/tools/health-plan/analyze-compatibility.ts` | 14.2 | Adicionar traced calls |
| `lib/tools/health-plan/generate-recommendation.ts` | 14.2 | Adicionar traced calls |
| `lib/tools/health-plan/session-manager.ts` | 14.5 | Propagar correlation ID |
| `lib/tools/health-plan/logger.ts` | 14.1-14.5 | Integrar com novo SDK |

---

## 5. Ordem de Execução

```
14.1 (SDK Setup)
  ↓
14.2 (Tracing GPT-4o) ──┐
  ↓                     │
14.3 (Orchestrator)     │
  ↓                     │
14.5 (Correlation IDs) ←┘
  ↓
14.4 (Métricas)
  ↓
14.6 (Dashboards)
  ↓
14.7 (Alertas)
  ↓
14.8 (Validação E2E)
```

---

## 6. Métricas de Sucesso (PRD RF-013)

- [ ] SDK LangSmith configurado no projeto
- [ ] Rastreamento automático de todas operações LLM
- [ ] Tracking de cada step do orquestrador
- [ ] Logs estruturados com contexto completo
- [ ] Dashboard no LangSmith mostrando métricas
- [ ] Alertas configurados para erros e timeouts
- [ ] Análise de custos por workspace
- [ ] Integração com sistema de auditoria existente

---

## 7. Estimativa de Esforço

| Subtarefa | Complexidade | Estimativa |
|-----------|--------------|------------|
| 14.1 | Baixa | 1-2 horas |
| 14.2 | Média | 3-4 horas |
| 14.3 | Alta | 4-5 horas |
| 14.4 | Média | 3-4 horas |
| 14.5 | Média | 2-3 horas |
| 14.6 | Baixa | 1-2 horas |
| 14.7 | Média | 2-3 horas |
| 14.8 | Média | 2-3 horas |
| **Total** | | **18-26 horas** |

---

## 8. Dependências

### Pré-requisitos:
- [x] Conta LangSmith criada
- [x] API Key disponível
- [ ] Projeto `health-plan-agent` criado no LangSmith

### Dependências de Tasks:
- Task #1: Estrutura base do projeto
- Task #10: Orquestrador multi-step implementado

---

## 9. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| LangSmith indisponível | Baixa | Médio | Circuit breaker, logs locais como fallback |
| Overhead de tracing | Média | Baixo | Medir e otimizar, batch de envios |
| Custo de tracing alto | Média | Médio | Monitorar custos, ajustar sampling se necessário |
| Dados sensíveis em traces | Baixa | Alto | maskSensitiveData() já implementado |

---

**Documento gerado em:** 2025-11-29
**Última atualização:** 2025-11-29
