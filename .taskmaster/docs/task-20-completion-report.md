# Task 20: Fase 2 - State + Persistência

**Status:** CONCLUÍDA
**Data:** 2025-12-03
**PRD:** health-plan-agent-v2-langgraph-prd.md (Seção 7, Fase 2)

---

## Resumo Executivo

A Task 20 implementou a Fase 2 do Health Plan Agent v2, integrando o sistema de persistência de estado via PostgresSaver e criando a lógica de invalidação de cache.

**Resultado:** 6 subtasks concluídas, 35 testes passando.

---

## Subtasks Completadas

### 20.1 - HealthPlanStateAnnotation (VALIDADO)

**Status:** Já existia da Fase 1

**Arquivo:** `lib/agents/health-plan-v2/state/state-annotation.ts`

**O que foi validado:**
- Todos os identificadores (workspaceId, userId, assistantId, chatId)
- messages com `messagesStateReducer` do LangGraph
- clientInfo com merge reducer `({ ...current, ...update })`
- Versionamento granular: clientInfoVersion, searchResultsVersion, analysisVersion, recommendationVersion
- Controle de fluxo: isConversationActive, pendingAction, currentResponse
- Metadata: errors com concat reducer

### 20.2 - Tipos UserIntent (VALIDADO)

**Status:** Já existia da Fase 1

**Arquivo:** `lib/agents/health-plan-v2/types.ts`

**O que foi validado:**
- 9 intenções conforme PRD seção 3.2:
  - fornecer_dados, buscar_planos, analisar, consultar_preco
  - pedir_recomendacao, conversar, alterar_dados, simular_cenario, finalizar
- IntentClassificationResult com: intent, confidence, extractedData?, reasoning?
- Interfaces: PartialClientInfo, Dependent, HealthPlanDocument, RankedAnalysis, etc.

### 20.3 - Cache Invalidation (CRIADO)

**Status:** Novo arquivo criado

**Arquivo:** `lib/agents/health-plan-v2/state/cache-invalidation.ts`

**O que foi implementado:**
```typescript
// Regras de invalidação conforme PRD seção 3.6
INVALIDATION_RULES = {
  clientInfo: ["searchResults", "compatibilityAnalysis", "recommendation"],
  searchResults: ["compatibilityAnalysis", "recommendation"],
  compatibilityAnalysis: ["recommendation"],
  erpPrices: []  // Preços não invalidam nada
}
```

**Funções exportadas:**
- `hasSignificantChange(oldInfo, newInfo)` - Detecta mudanças em campos críticos
- `onClientInfoChange(oldInfo, newData)` - Callback para mudanças de clientInfo
- `getInvalidationUpdates(changedField)` - Retorna updates de invalidação
- `processClientInfoUpdate(state, newData)` - Processa atualização completa
- `isCacheStale(cacheVersion, upstreamVersion)` - Verifica se cache está desatualizado
- `getStaleCapabilities(state)` - Lista capacidades que precisam reexecutar

**Campos críticos que disparam invalidação:**
- age, city, state, dependents, healthConditions, budget

**Campos não-críticos (não invalidam):**
- name, preferences, currentPlan, employer

### 20.4 - Integração Checkpointer no Endpoint (MODIFICADO)

**Status:** Modificação aplicada

**Arquivo:** `app/api/chat/health-plan-agent-v2/route.ts`

**Alterações:**
```typescript
// ANTES (linha 169):
const app = compileWorkflow()  // Sem checkpointer

// DEPOIS:
import { getCheckpointer } from '@/lib/agents/health-plan-v2/checkpointer/postgres-checkpointer'

let checkpointerEnabled = false
try {
  const checkpointer = await getCheckpointer()
  app = compileWorkflow(checkpointer)
  checkpointerEnabled = true
  console.log("[health-plan-v2] ✅ Checkpointer enabled")
} catch (checkpointerError) {
  // Modo degradado: funciona sem persistência
  console.warn("[health-plan-v2] ⚠️ Checkpointer unavailable")
  app = compileWorkflow()
}
```

**Novo header de resposta:**
- `X-Checkpointer-Enabled: true/false`

### 20.5 - Migration Supabase (VALIDADO)

**Status:** Já existia e aplicada

**Arquivo:** `supabase/migrations/20251203000002_create_langgraph_checkpoint_tables.sql`

**Tabelas verificadas no banco:**
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'langgraph';
-- Resultado: checkpoints, checkpoint_blobs, checkpoint_writes
```

**Migration aplicada:** `20251203195914_create_langgraph_checkpoint_tables`

### 20.6 - Testes de Persistência (CRIADO)

**Status:** Novos arquivos criados

**Arquivos:**
- `lib/agents/health-plan-v2/__tests__/cache-invalidation.test.ts` - 25 testes
- `lib/agents/health-plan-v2/__tests__/checkpointer-persistence.test.ts` - 10 testes

**Cobertura de testes:**
```
PASS lib/agents/health-plan-v2/__tests__/cache-invalidation.test.ts (25 tests)
  - INVALIDATION_RULES structure
  - hasSignificantChange (8 cenários)
  - onClientInfoChange (3 cenários)
  - getInvalidationUpdates (4 cenários)
  - isCacheStale
  - getStaleCapabilities (4 cenários)

PASS lib/agents/health-plan-v2/__tests__/checkpointer-persistence.test.ts (10 tests)
  - Environment Configuration
  - Cache Invalidation Integration
  - Types Validation
  - State Annotation Validation
  - Module Structure Validation
```

**Polyfills adicionados em `jest.setup.ts`:**
- TextEncoder/TextDecoder (para LangSmith)
- ReadableStream/TransformStream/WritableStream (para LangChain)

---

## Arquivos Criados/Modificados

| Arquivo | Ação | Linhas |
|---------|------|--------|
| `lib/agents/health-plan-v2/state/cache-invalidation.ts` | CRIADO | ~220 |
| `lib/agents/health-plan-v2/__tests__/cache-invalidation.test.ts` | CRIADO | ~256 |
| `lib/agents/health-plan-v2/__tests__/checkpointer-persistence.test.ts` | CRIADO | ~156 |
| `app/api/chat/health-plan-agent-v2/route.ts` | MODIFICADO | +15 |
| `jest.setup.ts` | MODIFICADO | +10 |

---

## Validações Realizadas

### 1. Banco de Dados
```sql
-- Schema langgraph criado ✅
-- Tabelas existentes ✅
checkpoints, checkpoint_blobs, checkpoint_writes

-- Índices criados ✅
idx_checkpoints_thread_id
idx_checkpoints_thread_ns
idx_checkpoints_parent
idx_checkpoint_writes_thread
idx_checkpoint_blobs_thread
```

### 2. Testes Unitários
```bash
npx jest lib/agents/health-plan-v2/__tests__/
# Test Suites: 2 passed, 2 total
# Tests:       35 passed, 35 total
```

### 3. Type Check
```bash
npx tsc --noEmit lib/agents/health-plan-v2/state/cache-invalidation.ts
# No errors
```

---

## Como Testar Persistência (QA)

### Via API
```bash
# Enviar mensagem
curl -X POST http://localhost:3000/api/chat/health-plan-agent-v2 \
  -H "Content-Type: application/json" \
  -d '{"workspaceId":"test","assistantId":"test","chatId":"test-123","messages":[{"role":"user","content":"oi"}]}'

# Verificar header de resposta
X-Checkpointer-Enabled: true
```

### Via Frontend
1. Abrir chat com assistente "Health Plan v2"
2. Enviar mensagem
3. Dar refresh na página
4. Verificar que histórico permanece
5. Abrir nova aba com mesmo chat → mesmo estado

### Via LangSmith
- chatId consistente entre mensagens
- Metadata de state nos traces

---

## Próxima Task

A próxima task disponível é a **Task 21: Fase 3 - Classificador de Intenções**.

---

## Referências

- PRD: `.taskmaster/docs/health-plan-agent-v2-langgraph-prd.md`
- Seção 3.6: Lógica de Invalidação de Cache
- Seção 7: Plano de Implementação - Fase 2
