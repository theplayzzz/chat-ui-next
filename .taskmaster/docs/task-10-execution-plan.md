# Plano de Execução - Task #10: Criar Orquestrador Multi-Step

## Referência PRD
- **PRD**: `/root/chatbot-ui/chatbot-ui/.taskmaster/docs/health-plan-agent-prd.md`
- **Requisito**: RF-008 (Orquestrador Multi-Step)
- **Prioridade**: Alta

## Visão Geral

Implementar API route que orquestra os 5 passos do processo de recomendação de planos de saúde de forma sequencial e controlada, integrando todas as ferramentas já implementadas (Tasks 5-9).

### Fluxo de Execução (PRD RF-008)
```
Step 1: Coleta de Informações (extractClientInfo)
   ↓ (completo quando todos campos obrigatórios preenchidos)
Step 2: Busca RAG (searchHealthPlans)
   ↓ (retorna top 10-20 documentos relevantes)
Step 3: Análise de Compatibilidade (analyzeCompatibility)
   ↓ (retorna top 3 planos ranqueados)
Step 4: Consulta de Preços (fetchERPPrices)
   ↓ (busca preços atualizados no ERP)
Step 5: Geração de Recomendação (generateRecommendation)
   ↓ (apresenta recomendação final)
```

---

## Decisões de Implementação (Confirmadas)

| Aspecto | Decisão | Detalhes |
|---------|---------|----------|
| **LangSmith** | Integração completa | LANGSMITH_API_KEY já configurada no ambiente |
| **Persistência** | Supabase | Tabela `health_plan_sessions` com RLS e TTL 1h |
| **Cobertura de Testes** | >80% | Unit + Integration + E2E |

---

## Subtarefas e Ordem de Execução

### 10.1 - Criar estrutura base da API route
**Status**: Pending → In Progress
**Dependências**: Nenhuma
**Estimativa**: 30-45 min

#### Arquivos a Criar/Modificar:
- `app/api/chat/health-plan-agent/route.ts` (NOVO)

#### Implementação:
```typescript
// Estrutura base
export const runtime = "nodejs" // Necessário para timeout 60s (edge tem 30s limit)
export const maxDuration = 60

export async function POST(request: Request) {
  // 1. Parse request body
  // 2. Validar workspace autorizado
  // 3. Buscar configurações ERP
  // 4. Retornar estrutura base
}
```

#### Tarefas:
- [ ] Criar diretório `app/api/chat/health-plan-agent/`
- [ ] Implementar `route.ts` com runtime "nodejs"
- [ ] Validar workspace via `validateWorkspaceAuthMiddleware`
- [ ] Buscar config ERP via `getWorkspaceERPConfig`
- [ ] Implementar error handling básico (401, 403, 500)
- [ ] Testar chamada POST básica

#### Atualização Task Master:
```bash
task-master set-status --id=10.1 --status=in-progress
# Após conclusão:
task-master set-status --id=10.1 --status=done
task-master update-subtask --id=10.1 --prompt="Implementado route.ts com runtime nodejs, validação de workspace e busca de config ERP. Testado manualmente com curl."
```

---

### 10.2 - Implementar session-manager
**Status**: Pending
**Dependências**: 10.1
**Estimativa**: 45-60 min

#### Arquivos a Criar:
- `lib/tools/health-plan/session-manager.ts` (NOVO)
- Migration Supabase para tabela `health_plan_sessions`

#### Interface SessionState:
```typescript
interface SessionState {
  sessionId: string
  workspaceId: string
  userId: string
  currentStep: 1 | 2 | 3 | 4 | 5
  clientInfo?: PartialClientInfo
  searchResults?: SearchHealthPlansResponse
  compatibilityAnalysis?: RankedAnalysis
  erpPrices?: ERPPriceResult
  recommendation?: GenerateRecommendationResult
  errors: Array<{ step: number; error: string; timestamp: string }>
  startedAt: string
  lastUpdatedAt: string
  completedAt?: string
}
```

#### Funções a Implementar:
```typescript
// CRUD de sessão
createSession(workspaceId, userId): Promise<SessionState>
getSession(sessionId): Promise<SessionState | null>
updateSession(sessionId, updates: Partial<SessionState>): Promise<SessionState>
completeSession(sessionId, recommendation): Promise<void>

// Cleanup
cleanupExpiredSessions(): Promise<number> // TTL 1 hora
```

#### Migration SQL:
```sql
CREATE TABLE health_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  current_step INT NOT NULL DEFAULT 1,
  client_info JSONB,
  search_results JSONB,
  compatibility_analysis JSONB,
  erp_prices JSONB,
  recommendation JSONB,
  errors JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

-- RLS policies
ALTER TABLE health_plan_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sessions"
ON health_plan_sessions FOR ALL
USING (user_id = auth.uid());

-- Index para cleanup
CREATE INDEX idx_health_plan_sessions_expires ON health_plan_sessions(expires_at);
```

#### Atualização Task Master:
```bash
task-master set-status --id=10.2 --status=in-progress
task-master set-status --id=10.2 --status=done
task-master update-subtask --id=10.2 --prompt="Implementado session-manager com CRUD completo, migration aplicada, RLS configurado. Testado criação/recuperação/cleanup de sessões."
```

---

### 10.3 - Implementar orquestração sequencial com streaming
**Status**: Pending
**Dependências**: 10.1, 10.2
**Estimativa**: 90-120 min (subtarefa mais complexa)

#### Arquivos a Modificar:
- `app/api/chat/health-plan-agent/route.ts`

#### Arquivos a Criar:
- `lib/tools/health-plan/orchestrator.ts` (NOVO)

#### Estrutura do Orchestrator:
```typescript
interface OrchestratorConfig {
  sessionId: string
  workspaceId: string
  userId: string
  assistantId: string
  openaiApiKey: string
  erpConfig?: WorkspaceERPConfig
}

class HealthPlanOrchestrator {
  constructor(config: OrchestratorConfig)

  async executeWorkflow(
    messages: Message[],
    onProgress?: (step: number, message: string) => void
  ): Promise<AsyncGenerator<string, void, unknown>>
}
```

#### Fluxo de Execução:
```typescript
async function* executeWorkflow() {
  // Step 1: Extract Client Info
  yield "📋 Coletando suas informações...\n"
  const clientInfoResult = await extractClientInfo(...)
  await updateSession(sessionId, { clientInfo: clientInfoResult, currentStep: 2 })

  if (!clientInfoResult.isComplete) {
    yield clientInfoResult.nextQuestion
    return // Aguarda próxima mensagem do usuário
  }

  // Step 2: Search Health Plans
  yield "🔍 Buscando planos compatíveis...\n"
  const searchResults = await searchHealthPlans(...)
  await updateSession(sessionId, { searchResults, currentStep: 3 })

  // Step 3: Analyze Compatibility
  yield "📊 Analisando compatibilidade...\n"
  const analysis = await analyzeCompatibility(...)
  await updateSession(sessionId, { compatibilityAnalysis: analysis, currentStep: 4 })

  // Step 4: Fetch ERP Prices
  yield "💰 Consultando preços atualizados...\n"
  const prices = await fetchERPPrices(...)
  await updateSession(sessionId, { erpPrices: prices, currentStep: 5 })

  // Step 5: Generate Recommendation
  yield "✨ Gerando sua recomendação personalizada...\n\n"
  const recommendation = await generateRecommendation(...)
  await completeSession(sessionId, recommendation)

  yield recommendation.markdown
}
```

#### Streaming com Vercel AI SDK:
```typescript
import { StreamingTextResponse } from "ai"

// No route.ts
const stream = new ReadableStream({
  async start(controller) {
    const encoder = new TextEncoder()
    for await (const chunk of orchestrator.executeWorkflow(messages)) {
      controller.enqueue(encoder.encode(chunk))
    }
    controller.close()
  }
})

return new StreamingTextResponse(stream)
```

#### Atualização Task Master:
```bash
task-master set-status --id=10.3 --status=in-progress
task-master set-status --id=10.3 --status=done
task-master update-subtask --id=10.3 --prompt="Implementado orchestrator.ts com execução sequencial dos 5 tools, streaming via AsyncGenerator, persistência de estado entre steps. Testado fluxo completo E2E."
```

---

### 10.4 - Implementar timeout global e tratamento de erros
**Status**: Pending
**Dependências**: 10.3
**Estimativa**: 45-60 min

#### Arquivos a Modificar:
- `lib/tools/health-plan/orchestrator.ts`

#### Arquivos a Criar:
- `lib/tools/health-plan/error-handler.ts` (NOVO)

#### Timeouts por Step:
```typescript
const STEP_TIMEOUTS = {
  extractClientInfo: 10_000,    // 10s
  searchHealthPlans: 15_000,    // 15s
  analyzeCompatibility: 15_000, // 15s
  fetchERPPrices: 10_000,       // 10s
  generateRecommendation: 15_000 // 15s
} // Total: 65s buffer, mas global é 60s
```

#### Error Handler:
```typescript
enum ErrorType {
  VALIDATION = "ValidationError",
  TIMEOUT = "TimeoutError",
  API = "APIError",
  DATABASE = "DatabaseError",
  UNKNOWN = "UnknownError"
}

interface StepError {
  step: number
  stepName: string
  type: ErrorType
  message: string
  userMessage: string
  retryable: boolean
  httpStatus: number
}

class ErrorHandler {
  classifyError(error: unknown, step: number): StepError
  getUserFriendlyMessage(error: StepError): string
  shouldRetry(error: StepError, attempt: number): boolean
}
```

#### Timeout Global com Promise.race:
```typescript
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stepName: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`${stepName} excedeu ${timeoutMs}ms`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeout])
}
```

#### Resposta Parcial em Timeout:
```typescript
if (error instanceof TimeoutError) {
  const partialData = await getSession(sessionId)
  yield `\n⏱️ O tempo limite foi atingido, mas coletamos algumas informações:\n`
  if (partialData.searchResults) {
    yield `- Encontramos ${partialData.searchResults.results.length} planos compatíveis\n`
  }
  yield `\nPor favor, tente novamente ou entre em contato com o suporte.`
}
```

#### Atualização Task Master:
```bash
task-master set-status --id=10.4 --status=in-progress
task-master set-status --id=10.4 --status=done
task-master update-subtask --id=10.4 --prompt="Implementado timeout global 60s, timeouts individuais por step, retry com exponential backoff (max 2), classificação de erros, resposta parcial em timeout."
```

---

### 10.5 - Integrar logs e rastreamento LangSmith
**Status**: Pending
**Dependências**: 10.3
**Estimativa**: 45-60 min

#### Arquivos a Criar:
- `lib/tools/health-plan/logger.ts` (NOVO)
- `lib/tools/health-plan/langsmith-tracer.ts` (NOVO)

#### Logger Estruturado:
```typescript
interface LogEntry {
  timestamp: string
  level: "INFO" | "WARN" | "ERROR"
  workspaceId: string
  userId: string
  sessionId: string
  step: number
  stepName: string
  action: "start" | "end" | "error" | "retry"
  durationMs?: number
  metadata?: Record<string, any>
  error?: {
    message: string
    stack?: string
  }
}

class HealthPlanLogger {
  logStepStart(step: number, stepName: string, inputs: any): void
  logStepEnd(step: number, stepName: string, outputs: any, durationMs: number): void
  logStepError(step: number, stepName: string, error: Error): void
  logRetry(step: number, stepName: string, attempt: number): void
}
```

#### LangSmith Integration:
```typescript
import { Client as LangSmithClient } from "langsmith"

class LangSmithTracer {
  private client: LangSmithClient
  private runId: string

  constructor() {
    this.client = new LangSmithClient({ apiKey: process.env.LANGSMITH_API_KEY })
    this.runId = crypto.randomUUID()
  }

  async traceStep(stepName: string, inputs: any, outputs: any, durationMs: number): Promise<void>
  async traceError(stepName: string, error: Error): Promise<void>
  async finalize(success: boolean, metadata: any): Promise<void>

  getRunId(): string { return this.runId }
}
```

#### Mascaramento de Dados Sensíveis:
```typescript
const SENSITIVE_FIELDS = ["cpf", "rg", "telefone", "email", "endereco"]

function maskSensitiveData(data: any): any {
  if (typeof data !== "object" || data === null) return data

  const masked = { ...data }
  for (const field of SENSITIVE_FIELDS) {
    if (masked[field]) {
      masked[field] = "***MASKED***"
    }
  }
  return masked
}
```

#### Salvamento do langsmith_run_id:
```typescript
// Na tabela health_plan_recommendations (já definida no PRD)
await supabase.from("health_plan_recommendations").insert({
  workspace_id: workspaceId,
  user_id: userId,
  langsmith_run_id: tracer.getRunId(),
  // ... outros campos
})
```

#### Atualização Task Master:
```bash
task-master set-status --id=10.5 --status=in-progress
task-master set-status --id=10.5 --status=done
task-master update-subtask --id=10.5 --prompt="Implementado logger estruturado JSON, integração LangSmith completa, mascaramento de dados sensíveis, salvamento de langsmith_run_id na tabela de auditoria."
```

---

## Arquivos Críticos a Ler Antes de Implementar

1. **Ferramentas existentes (assinaturas e tipos)**:
   - `lib/tools/health-plan/extract-client-info.ts`
   - `lib/tools/health-plan/search-health-plans.ts`
   - `lib/tools/health-plan/analyze-compatibility.ts`
   - `lib/tools/health-plan/fetch-erp-prices.ts`
   - `lib/tools/health-plan/generate-recommendation.ts`
   - `lib/tools/health-plan/types.ts`

2. **Padrões de API route existentes**:
   - `app/api/chat/openai/route.ts` (streaming pattern)
   - `app/api/tools/search-health-plans/route.ts` (auth pattern)

3. **Middleware de autorização**:
   - `lib/middleware/workspace-auth.ts`
   - `lib/server/workspace-authorization.ts`

4. **Configuração ERP**:
   - `db/workspace-erp-config.ts`
   - `lib/cache/erp-price-cache.ts`

---

## Checklist de Critérios de Aceitação (PRD RF-008)

- [ ] Execução sequencial garantida
- [ ] Estado da sessão persistido entre steps
- [ ] Progresso visível para o usuário (streaming)
- [ ] Possibilidade de retornar a steps anteriores
- [ ] Timeout total < 60 segundos (Node.js runtime)
- [ ] Streaming de respostas
- [ ] Tratamento de erros em cada step
- [ ] Logs detalhados para debugging

---

## Ordem de Execução Recomendada

```
1. 10.1 - API Route Base (30-45 min)
   ↓
2. 10.2 - Session Manager (45-60 min)
   ↓
3. 10.3 - Orquestração + Streaming (90-120 min) ← Core da Task
   ↓
   ├→ 10.4 - Timeout + Erros (45-60 min) [pode rodar em paralelo com 10.5]
   └→ 10.5 - Logs + LangSmith (45-60 min)
```

**Tempo Total Estimado**: 5-7 horas de implementação + testes

---

## Comandos Task Master Durante Execução

```bash
# Início da Task 10
task-master set-status --id=10 --status=in-progress

# Para cada subtarefa
task-master set-status --id=10.X --status=in-progress
# ... implementar ...
task-master update-subtask --id=10.X --prompt="Notas de implementação..."
task-master set-status --id=10.X --status=done

# Ao finalizar tudo
task-master set-status --id=10 --status=done
task-master update-task --id=10 --prompt="Task 10 concluída: orquestrador implementado com 5 steps sequenciais, streaming, session persistence, timeout 60s, error handling granular, logs estruturados e integração LangSmith."
```

---

## Estratégia de Testes Completa (>80% Coverage)

### Unit Tests (Jest/Vitest)

#### `lib/tools/health-plan/__tests__/session-manager.test.ts`
```typescript
describe("SessionManager", () => {
  describe("createSession", () => {
    it("should create a new session with default values")
    it("should set expires_at to 1 hour from now")
    it("should validate workspaceId and userId")
  })

  describe("getSession", () => {
    it("should return session by ID")
    it("should return null for non-existent session")
    it("should return null for expired session")
  })

  describe("updateSession", () => {
    it("should update session fields")
    it("should update last_updated_at timestamp")
    it("should throw for invalid session ID")
    it("should validate ownership (userId/workspaceId)")
  })

  describe("completeSession", () => {
    it("should mark session as completed")
    it("should store final recommendation")
    it("should set completed_at timestamp")
  })

  describe("cleanupExpiredSessions", () => {
    it("should delete sessions past expires_at")
    it("should return count of deleted sessions")
  })
})
```

#### `lib/tools/health-plan/__tests__/orchestrator.test.ts`
```typescript
describe("HealthPlanOrchestrator", () => {
  describe("executeWorkflow", () => {
    it("should execute all 5 steps in order")
    it("should stream progress messages for each step")
    it("should persist state after each step")
    it("should stop at step 1 if client info incomplete")
    it("should resume from last completed step")
  })

  describe("step execution", () => {
    it("should call extractClientInfo with correct params")
    it("should call searchHealthPlans with client info")
    it("should call analyzeCompatibility with search results")
    it("should call fetchERPPrices with plan IDs")
    it("should call generateRecommendation with analysis + prices")
  })

  describe("error handling", () => {
    it("should save partial state on error")
    it("should stream error message to user")
    it("should log error with full context")
  })
})
```

#### `lib/tools/health-plan/__tests__/error-handler.test.ts`
```typescript
describe("ErrorHandler", () => {
  describe("classifyError", () => {
    it("should classify timeout errors")
    it("should classify validation errors")
    it("should classify API errors by status code")
    it("should classify database errors")
    it("should default to UNKNOWN for unrecognized errors")
  })

  describe("getUserFriendlyMessage", () => {
    it("should return localized message for each error type")
    it("should not expose internal error details")
  })

  describe("shouldRetry", () => {
    it("should return true for retryable errors on first attempt")
    it("should return false after max attempts")
    it("should return false for non-retryable errors")
  })
})
```

#### `lib/tools/health-plan/__tests__/logger.test.ts`
```typescript
describe("HealthPlanLogger", () => {
  describe("logStepStart", () => {
    it("should output structured JSON log")
    it("should include all required fields")
  })

  describe("maskSensitiveData", () => {
    it("should mask CPF field")
    it("should mask telefone field")
    it("should mask email field")
    it("should handle nested objects")
    it("should not modify original data")
  })
})
```

#### `lib/tools/health-plan/__tests__/langsmith-tracer.test.ts`
```typescript
describe("LangSmithTracer", () => {
  describe("initialization", () => {
    it("should initialize client when API key present")
    it("should generate unique run ID")
  })

  describe("traceStep", () => {
    it("should send trace to LangSmith API")
    it("should include masked inputs/outputs")
    it("should record duration")
  })

  describe("finalize", () => {
    it("should complete the trace run")
    it("should include success/failure metadata")
  })
})
```

### Integration Tests

#### `app/api/chat/health-plan-agent/__tests__/route.integration.test.ts`
```typescript
describe("POST /api/chat/health-plan-agent", () => {
  it("should return 401 for unauthenticated requests")
  it("should return 403 for unauthorized workspace")
  it("should return 400 for missing required fields")
  it("should stream responses correctly")
  it("should complete full workflow with valid data")
  it("should handle timeout gracefully")
  it("should persist session state between calls")
})
```

### E2E Tests (Manual via curl/Postman)

```bash
# 1. Test unauthorized access
curl -X POST http://localhost:3000/api/chat/health-plan-agent \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "invalid", "messages": []}'
# Expected: 403 Forbidden

# 2. Test full workflow
curl -X POST http://localhost:3000/api/chat/health-plan-agent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "workspaceId": "...",
    "assistantId": "...",
    "messages": [
      {"role": "user", "content": "Preciso de um plano de saúde para minha família"}
    ]
  }' --no-buffer
# Expected: Streaming response with progress + next question

# 3. Continue workflow with client info
curl -X POST http://localhost:3000/api/chat/health-plan-agent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "workspaceId": "...",
    "assistantId": "...",
    "sessionId": "...",
    "messages": [
      {"role": "user", "content": "Tenho 35 anos, esposa de 32 e filho de 5..."}
    ]
  }' --no-buffer
# Expected: Streaming with full recommendation
```

---

## Notas Importantes

1. **Runtime Node.js**: Usar `export const runtime = "nodejs"` é obrigatório para timeout de 60s (edge tem limite de 30s)

2. **Vercel AI SDK**: Usar `StreamingTextResponse` do pacote `ai` para streaming

3. **LangSmith**: Integração completa - LANGSMITH_API_KEY já está configurada

4. **Session TTL**: 1 hora é suficiente para uma consulta completa, com cleanup automático via Supabase

5. **Dados Sensíveis**: Sempre mascarar CPF, telefone, email antes de logar ou enviar ao LangSmith

6. **Coverage Target**: Manter >80% de cobertura com `npx vitest --coverage`

---

## Histórico

| Data | Versão | Autor | Mudanças |
|------|--------|-------|----------|
| 2025-11-27 | 1.0 | Claude Code | Versão inicial do plano de execução |
