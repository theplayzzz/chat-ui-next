# Manual de Testes Retroativos - Health Plan Agent v2 (Fases 1-7)

**Data:** 2026-03-05
**Versao:** 1.0
**Objetivo:** Cobertura de testes automatizados para as 13 features implementadas sem teste unitario
**Meta de cobertura:** >80% em `lib/agents/health-plan-v2/`
**Comando principal:** `npm test -- --testPathPattern=health-plan-v2`

---

## Inventario de Testes

### Testes Existentes (10)

| # | Arquivo de Teste | Componente Testado | Status |
|---|------------------|--------------------|--------|
| 1 | `__tests__/checkpointer-persistence.test.ts` | PostgresSaver persistence | OK |
| 2 | `__tests__/orchestrator-loop.test.ts` | Orchestrator node (loop basico) | Parcial |
| 3 | `__tests__/update-client-info.test.ts` | Update client info capability | OK |
| 4 | `__tests__/router-invalidation.test.ts` | Router cache invalidation | Parcial |
| 5 | `__tests__/cache-invalidation.test.ts` | Cache invalidation logic | OK |
| 6 | `graphs/__tests__/search-plans-graph.test.ts` | RAG search graph | OK |
| 7 | `nodes/rag/__tests__/grade-by-collection.test.ts` | Collection grading | OK |
| 8 | `monitoring/__tests__/rag-evaluation.test.ts` | RAG evaluation | OK |
| 9 | `schemas/rag-schemas.test.ts` | RAG Zod schemas | OK |
| 10 | `components/health-plan/__tests__/health-plan-chat.test.tsx` | UI component | OK |

### Gaps Identificados (13)

| # | ID | Arquivo sem Teste | Prioridade | Tipo |
|---|----|--------------------|-----------|------|
| 1 | A1.1 | `intent/intent-classifier.ts` | Alta | Novo |
| 2 | A1.2 | `nodes/capabilities/search-plans.ts` | Alta | Novo |
| 3 | A1.3 | `nodes/capabilities/analyze-compatibility.ts` | Alta | Novo |
| 4 | A1.4 | `nodes/capabilities/generate-recommendation.ts` | Alta | Novo |
| 5 | A1.5 | `nodes/capabilities/fetch-prices.ts` | Baixa | Novo |
| 6 | A1.6 | `nodes/capabilities/end-conversation.ts` | Baixa | Novo |
| 7 | A1.7 | `nodes/capabilities/respond-to-user.ts` | Baixa | Novo |
| 8 | A1.8 | `nodes/rag/grade-documents.ts` | Alta | Novo |
| 9 | A1.9 | `nodes/rag/retrieve-simple.ts` | Alta | Novo |
| 10 | A1.10 | `app/api/chat/health-plan-agent-v2/route.ts` | Alta | Novo |
| 11 | A1.11 | `nodes/orchestrator.ts` | Media | Ampliar |
| 12 | A1.12 | `nodes/router.ts` | Media | Ampliar |
| 13 | A1.13 | Este manual | - | Doc |

---

## Detalhamento por Teste

### A1.1 - Intent Classifier (`intent-classifier.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/intent/intent-classifier.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/intent/__tests__/intent-classifier.test.ts`

**Funcoes exportadas a testar:**
- `classifyIntent(input: IntentClassificationInput)` - Funcao principal
- `IntentClassificationResponseSchema` - Validacao Zod
- `ExtractedDataSchema` - Validacao Zod
- `extractContextFromMessages()` - Helper
- `buildStateContext()` - Helper

**Cenarios obrigatorios:**

| # | Cenario | Input | Esperado |
|---|---------|-------|----------|
| 1 | Fornece dados pessoais | "Tenho 30 anos, moro em SP" | intent=`fornecer_dados`, extractedData.idade=30, extractedData.cidade="SP" |
| 2 | Pede busca de planos | "Busca planos para mim" | intent=`buscar_planos`, confidence >= 0.5 |
| 3 | Pede recomendacao | "Qual plano voce recomenda?" | intent=`pedir_recomendacao` |
| 4 | Conversa generica | "O que e coparticipacao?" | intent=`conversar` |
| 5 | Finalizar conversa | "Obrigado, pode encerrar" | intent=`finalizar` |
| 6 | Alterar dados | "Na verdade tenho 35 anos" | intent=`alterar_dados` |
| 7 | Simular cenario | "E se eu adicionasse um dependente?" | intent=`simular_cenario` |
| 8 | Baixa confianca (fallback) | Mensagem ambigua | Fallback para `conversar` quando confidence < 0.3 |
| 9 | Schema Zod valida | Output correto | Parse sem erro |
| 10 | Schema Zod invalida | Output malformado | Zod error capturado |

**Mocks necessarios:**
```typescript
jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        intent: "fornecer_dados",
        confidence: 0.95,
        extractedData: { idade: 30, cidade: "SP" },
        reasoning: "Usuario forneceu idade e cidade",
        alternativeIntents: []
      })
    })
  }))
}))
```

**Validacao LangSmith:** Span `intent-classifier`, latencia <2s

---

### A1.2 - Search Plans Capability (`search-plans.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/capabilities/search-plans.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/nodes/capabilities/__tests__/search-plans.test.ts`

**Funcoes exportadas a testar:**
- `searchPlans(state: HealthPlanState)` - Funcao principal

**Cenarios obrigatorios:**

| # | Cenario | Input State | Esperado |
|---|---------|-------------|----------|
| 1 | Dados completos | clientInfo com idade+cidade+orcamento | searchResults com planos, searchMetadata preenchido |
| 2 | Dados insuficientes | clientInfo sem idade | Retorno antecipado com mensagem de orientacao |
| 3 | Sem cidade | clientInfo sem cidade | Retorno antecipado |
| 4 | Sub-grafo retorna vazio | Mock searchPlansGraph sem resultados | searchResults=[], mensagem adequada |
| 5 | Erro no sub-grafo | Mock searchPlansGraph com erro | Fallback com mensagem de erro gracioso |
| 6 | Multiplas execucoes (idempotencia) | Executar 2x com mesmo state | Resultados consistentes |

**Mocks necessarios:**
```typescript
// Mock do sub-grafo searchPlansGraph
jest.mock("../../graphs/search-plans-graph", () => ({
  searchPlansGraph: {
    invoke: jest.fn().mockResolvedValue({
      identifiedPlans: [...],
      collectionAnalyses: [...],
      ragAnalysisContext: "...",
      searchMetadata: {...}
    })
  }
}))
```

**Validacao LangSmith:** Span `searchPlans`, docs relevantes >= 5

---

### A1.3 - Analyze Compatibility (`analyze-compatibility.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/capabilities/analyze-compatibility.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/nodes/capabilities/__tests__/analyze-compatibility.test.ts`

**Funcoes exportadas a testar:**
- `analyzeCompatibility(state: HealthPlanState)` - Funcao principal

**Cenarios obrigatorios:**

| # | Cenario | Input State | Esperado |
|---|---------|-------------|----------|
| 1 | Analise com searchResults | state com searchResults + clientInfo | compatibilityAnalysis com scores 0-100 |
| 2 | Analise com ragAnalysisContext | state com ragAnalysisContext | compatibilityAnalysis preenchido |
| 3 | Sem planos disponives | searchResults=[] | Resposta informando ausencia |
| 4 | Ranking correto | 3+ planos | Top plan tem maior score |
| 5 | Medals corretos | 3 planos | Resposta com emojis medal |
| 6 | Erro LLM | ChatOpenAI falha | Fallback gracioso |

**Mocks necessarios:**
```typescript
jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnThis(),
    invoke: jest.fn().mockResolvedValue({
      analyses: [
        { planId: "p1", planName: "Einstein Basic", score: 85, pros: [...], cons: [...] },
        { planId: "p2", planName: "Einstein Plus", score: 72, pros: [...], cons: [...] }
      ],
      topRecommendation: "p1",
      reasoning: "..."
    })
  }))
}))
```

**Validacao LangSmith:** Confidence scores dos planos

---

### A1.4 - Generate Recommendation (`generate-recommendation.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/capabilities/generate-recommendation.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/nodes/capabilities/__tests__/generate-recommendation.test.ts`

**Funcoes exportadas a testar:**
- `generateRecommendation(state: HealthPlanState)` - Funcao principal

**Cenarios obrigatorios:**

| # | Cenario | Input State | Esperado |
|---|---------|-------------|----------|
| 1 | Recomendacao com analysis | state com compatibilityAnalysis | recommendation com markdown, topPlanId |
| 2 | Sem analysis | state sem compatibilityAnalysis | Resposta pedindo analise primeiro |
| 3 | Markdown valido | Output LLM | recommendation.markdown contem headers |
| 4 | Highlights e warnings | Output completo | Arrays preenchidos |
| 5 | Next steps presentes | Output completo | nextSteps nao vazio |
| 6 | Fallback LLM | ChatOpenAI falha | Recomendacao fallback gerada |
| 7 | Version tracking | Multiplas execucoes | version incrementa |

**Mocks necessarios:** Similar ao A1.3 (ChatOpenAI com withStructuredOutput)

**Validacao LangSmith:** Qualidade da recomendacao

---

### A1.5 - Fetch Prices Stub (`fetch-prices.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/capabilities/fetch-prices.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/nodes/capabilities/__tests__/fetch-prices.test.ts`

**Funcoes exportadas a testar:**
- `fetchPrices(state: HealthPlanState)` - Funcao stub

**Cenarios obrigatorios:**

| # | Cenario | Input State | Esperado |
|---|---------|-------------|----------|
| 1 | Comportamento stub | Qualquer state | Resposta placeholder sobre precos |
| 2 | Nao altera state existente | State com dados | Outros campos nao modificados |

**Nota:** Teste simples pois e um stub. Sera expandido na Fase 8.

---

### A1.6 - End Conversation Stub (`end-conversation.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/capabilities/end-conversation.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/nodes/capabilities/__tests__/end-conversation.test.ts`

**Funcoes exportadas a testar:**
- `endConversation(state: HealthPlanState)` - Funcao stub

**Cenarios obrigatorios:**

| # | Cenario | Input State | Esperado |
|---|---------|-------------|----------|
| 1 | Finaliza conversa | Qualquer state | `isConversationActive = false` |
| 2 | Mensagem de despedida | Qualquer state | response contem despedida |

---

### A1.7 - Respond to User Stub (`respond-to-user.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/capabilities/respond-to-user.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/nodes/capabilities/__tests__/respond-to-user.test.ts`

**Funcoes exportadas a testar:**
- `respondToUser(state: HealthPlanState)` - Funcao stub

**Cenarios obrigatorios:**

| # | Cenario | Input State | Esperado |
|---|---------|-------------|----------|
| 1 | Com currentResponse | state com currentResponse do orchestrator | Retorna currentResponse |
| 2 | Sem currentResponse | state sem currentResponse | Retorna saudacao/mensagem generica |
| 3 | Nao invalida caches | Qualquer state | searchResults inalterado |

---

### A1.8 - Grade Documents (`grade-documents.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/rag/grade-documents.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/nodes/rag/__tests__/grade-documents.test.ts`

**Funcoes exportadas a testar:**
- `gradeByFile(fileResults, clientInfo, conversationMessages, options)` - Funcao principal

**Types exportados:**
- `FileRelevance` = "high" | "medium" | "low" | "irrelevant"
- `FileGradingResult`, `GradeByFileOptions`, `GradeByFileResult`

**Cenarios obrigatorios:**

| # | Cenario | Input | Esperado |
|---|---------|-------|----------|
| 1 | Grading com 3 arquivos | 3 fileResults + clientInfo | 3 FileGradingResults com relevancia |
| 2 | Distribuicao de relevancia | Arquivos variados | Mix de high/medium/low/irrelevant |
| 3 | Filtra irrelevantes | Arquivo sem relacao | Marcado como `irrelevant` |
| 4 | Stats corretas | 4 arquivos | stats.highRelevance + medium + low + irrelevant = 4 |
| 5 | Batch paralelo (default 3) | 6 arquivos | Processados em 2 batches |
| 6 | Erro LLM em 1 arquivo | 1 falha de 3 | 2 resultados OK + 1 fallback |
| 7 | Analysis text gerado | Qualquer input | analysisText nao vazio |

**Mocks necessarios:**
```typescript
jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn()
      .mockResolvedValueOnce({ content: "COMPATIBILIDADE: Alta\n\nAnalise detalhada..." })
      .mockResolvedValueOnce({ content: "COMPATIBILIDADE: Baixa\n\nNao relevante..." })
  }))
}))
```

**Validacao LangSmith:** Distribuicao de scores (high/medium/low/irrelevant)

---

### A1.9 - Retrieve Simple (`retrieve-simple.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/rag/retrieve-simple.ts`
**Arquivo de teste:** `lib/agents/health-plan-v2/nodes/rag/__tests__/retrieve-simple.test.ts`

**Funcoes exportadas a testar:**
- `retrieveSimple(options)` - Busca vetorial principal
- `concatenateFileChunks(fileResult)` - Junta chunks por arquivo
- `formatEnrichedContext(chunk)` - Formata chunk enriquecido
- `getAllChunks(fileResults)` - Flatten de resultados
- `filterEmptyFiles(fileResults)` - Remove arquivos vazios

**Cenarios obrigatorios:**

| # | Cenario | Input | Esperado |
|---|---------|-------|----------|
| 1 | Busca basica | query + collectionIds | fileResults agrupados por arquivo |
| 2 | Top-5 chunks por arquivo | Mock com 10 chunks/arquivo | Max 5 chunks por arquivo |
| 3 | concatenateFileChunks | fileResult com 3 chunks | String com separadores |
| 4 | formatEnrichedContext | chunk com metadata | String formatada com headers |
| 5 | getAllChunks (flatten) | 3 arquivos, 5 chunks cada | Array de 15 chunks |
| 6 | filterEmptyFiles | 3 arquivos, 1 vazio | Array de 2 arquivos |
| 7 | Erro Supabase RPC | Mock com erro | Excecao capturada |
| 8 | Metadata preenchido | Busca OK | metadata.totalChunks, totalFiles, query |

**Mocks necessarios:**
```typescript
// Mock Supabase client
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({
      data: [
        { id: "c1", content: "...", file_id: "f1", file_name: "plano.pdf", collection_id: "col1", ... },
        { id: "c2", content: "...", file_id: "f1", file_name: "plano.pdf", collection_id: "col1", ... }
      ],
      error: null
    })
  }))
}))

// Mock OpenAI Embeddings
jest.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, ...])
  }))
}))
```

---

### A1.10 - API Route v2 (`route.ts`)

**Arquivo fonte:** `app/api/chat/health-plan-agent-v2/route.ts`
**Arquivo de teste:** `app/api/chat/health-plan-agent-v2/__tests__/route.test.ts`

**Funcoes exportadas a testar:**
- `POST(request: NextRequest)` - Handler principal

**Cenarios obrigatorios:**

| # | Cenario | Input | Esperado |
|---|---------|-------|----------|
| 1 | Request valido | workspaceId + messages + auth | Status 200, streaming response |
| 2 | Sem autenticacao | Request sem profile | Status 401 |
| 3 | Body invalido | JSON malformado | Status 400 |
| 4 | Sem messages | Body sem messages[] | Status 400 |
| 5 | Streaming funciona | Request completo | Chunks recebidos progressivamente |
| 6 | Debug headers | Request valido | X-Last-Intent, X-Intent-Confidence presentes |
| 7 | Checkpointer fallback | Checkpointer indisponivel | Funciona sem persistencia |
| 8 | Timeout 300s | Workflow lento (mock) | Timeout error |

**Mocks necessarios:**
```typescript
// Mock getServerProfile
jest.mock("@/lib/server/server-chat-helpers", () => ({
  getServerProfile: jest.fn().mockResolvedValue({ user_id: "test-user" })
}))

// Mock workflow
jest.mock("@/lib/agents/health-plan-v2", () => ({
  compileWorkflow: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      response: "Ola! Como posso ajudar?",
      lastIntent: "conversar",
      intentConfidence: 0.9
    })
  })
}))

// Mock NextRequest
const request = new NextRequest("http://localhost/api/chat/health-plan-agent-v2", {
  method: "POST",
  body: JSON.stringify({
    workspaceId: "ws-1",
    assistantId: "ast-1",
    chatId: "chat-1",
    messages: [{ role: "user", content: "Oi" }]
  })
})
```

---

### A1.11 - Ampliar Testes: Orchestrator (`orchestrator.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/orchestrator.ts`
**Arquivo de teste existente:** `lib/agents/health-plan-v2/__tests__/orchestrator-loop.test.ts`
**Acao:** AMPLIAR testes existentes

**Cenarios a adicionar:**

| # | Cenario | Esperado |
|---|---------|----------|
| 1 | Mock classifyIntent → fornecer_dados | Rota para updateClientInfo |
| 2 | Mock classifyIntent → buscar_planos | Rota para searchPlans |
| 3 | Mock classifyIntent → pedir_recomendacao | Rota para generateRecommendation |
| 4 | Mock classifyIntent → conversar | Rota para respondToUser |
| 5 | Mock classifyIntent → finalizar | Rota para endConversation |
| 6 | Fluxo completo: dados → busca → recomendacao | 3 iteracoes do loop |
| 7 | Loop protection (max iterations) | Para apos N iteracoes |

**Mock principal:**
```typescript
jest.mock("../../intent/intent-classifier", () => ({
  classifyIntent: jest.fn()
    .mockResolvedValueOnce({ intent: "fornecer_dados", confidence: 0.95 })
    .mockResolvedValueOnce({ intent: "buscar_planos", confidence: 0.90 })
}))
```

---

### A1.12 - Ampliar Testes: Router (`router.ts`)

**Arquivo fonte:** `lib/agents/health-plan-v2/nodes/router.ts`
**Arquivo de teste existente:** `lib/agents/health-plan-v2/__tests__/router-invalidation.test.ts`
**Acao:** AMPLIAR testes existentes

**Cenarios a adicionar:**

| # | Cenario | Esperado |
|---|---------|----------|
| 1 | Route para cada intent (9 intents) | Retorna nome do node correto |
| 2 | Pre-requisitos: buscar sem dados | Redireciona para updateClientInfo |
| 3 | Pre-requisitos: recomendar sem busca | Redireciona para searchPlans |
| 4 | Pre-requisitos: analisar sem busca | Redireciona para searchPlans |
| 5 | Intent desconhecido | Fallback para respondToUser |
| 6 | isConversationActive=false | Rota para END |

---

### A1.13 - Criar este Manual

**Arquivo:** `.taskmaster/docs/manual-testes-retroativos.md`
**Status:** Este documento.

---

## Fixtures Recomendadas

### State Factory (`test-helpers.ts`)

```typescript
// lib/agents/health-plan-v2/__tests__/test-helpers.ts

import { HealthPlanState } from "../state/state-annotation"

export function createMockState(overrides?: Partial<HealthPlanState>): HealthPlanState {
  return {
    messages: [],
    response: "",
    lastIntent: undefined,
    intentConfidence: 0,
    clientInfo: {},
    clientInfoVersion: 0,
    searchResults: [],
    searchMetadata: undefined,
    collectionAnalyses: [],
    ragAnalysisContext: "",
    compatibilityAnalysis: undefined,
    recommendation: undefined,
    erpPrices: undefined,
    currentResponse: undefined,
    isConversationActive: true,
    loopCount: 0,
    ...overrides
  }
}

export function createMockClientInfo(overrides?: Record<string, unknown>) {
  return {
    idade: 30,
    cidade: "Sao Paulo",
    estado: "SP",
    dependentes: [],
    orcamento: 800,
    ...overrides
  }
}

export function createMockSearchResults(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `plan-${i + 1}`,
    operadora: "Einstein",
    nome_plano: `Plano ${i + 1}`,
    tipo: "individual",
    abrangencia: "municipal",
    coparticipacao: false,
    rede_credenciada: ["Hospital Einstein"],
    carencias: { urgencia: 24, eletiva: 180 },
    preco_base: 400 + (i * 100),
    metadata: {}
  }))
}
```

---

## Referencia Cruzada: PRD → RF → Arquivo → Teste

| RF | Descricao | Arquivo(s) | Teste Existente | Gap |
|----|-----------|------------|-----------------|-----|
| RF-001 | Orquestrador Conversacional | orchestrator.ts, router.ts | Parcial | A1.11, A1.12 |
| RF-002 | Loop de Conversa | orchestrator.ts | Parcial | A1.11 |
| RF-003 | Coleta de Dados | update-client-info.ts | OK | - |
| RF-004 | Busca de Planos | search-plans.ts, searchPlansGraph | Parcial | A1.2 |
| RF-005 | Analise Reexecutavel | analyze-compatibility.ts | Nao | A1.3 |
| RF-006 | Precos Opcionais | fetch-prices.ts | Nao | A1.5 |
| RF-007 | Recomendacao | generate-recommendation.ts | Nao | A1.4 |
| RF-008 | Conversa Geral | respond-to-user.ts | Nao | A1.7 |
| RF-010 | Invalidacao de Cache | cache-invalidation.ts | OK | - |
| RF-011 | Finalizacao | end-conversation.ts | Nao | A1.6 |
| RF-012 | Estado Persistente | checkpointer | OK | - |
| RF-013 | LangSmith | Tracings | OK | - |
| RF-014 | Endpoint API v2 | route.ts | Nao | A1.10 |
| - | Intent Classifier | intent-classifier.ts | Nao | A1.1 |
| - | Grade Documents | grade-documents.ts | Nao | A1.8 |
| - | Retrieve Simple | retrieve-simple.ts | Nao | A1.9 |

---

## Validacao LangSmith por Componente

| Componente | Span a verificar | Metricas |
|------------|------------------|----------|
| Intent Classifier | `intent-classifier` | Latencia <2s, confidence > 0.3 |
| Search Plans | `searchPlans` | docs relevantes >= 5 |
| Analyze Compatibility | `analyzeCompatibility` | scores 0-100 presentes |
| Generate Recommendation | `generateRecommendation` | markdown gerado |
| Grade Documents | `gradeByFile` | Distribuicao high/medium/low/irrelevant |
| Grade by Collection | `gradeByCollection` | Planos identificados |
| Retrieve Simple | `retrieveSimple` | chunks retornados |
| API Route | `health-plan-agent-v2` | Trace completo |

---

## Comandos de Execucao

```bash
# Rodar todos os testes do agente v2
npm test -- --testPathPattern=health-plan-v2

# Rodar teste especifico
npm test -- --testPathPattern=intent-classifier

# Rodar com cobertura
npm test -- --coverage --testPathPattern=health-plan-v2

# Rodar em modo watch
npm test -- --watch --testPathPattern=health-plan-v2

# Verificar cobertura minima (80%)
npm test -- --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80}}'
```

---

## Criterios de Aceite

- [ ] Todos os 13 gaps cobertos com testes
- [ ] Cobertura >80% em `lib/agents/health-plan-v2/`
- [ ] Zero testes falhando
- [ ] Mocks nao dependem de servicos externos (Supabase, OpenAI)
- [ ] Cada teste roda em <5s individualmente
- [ ] Testes sao deterministicos (sem flakiness)
