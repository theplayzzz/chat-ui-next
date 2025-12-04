# PRD: Health Plan Agent 2.0 - Agente Conversacional com LangGraph.js

**Versão:** 2.5
**Data:** 2025-12-03
**Autor:** Claude Code
**Status:** Draft

---

## 1. Resumo Executivo

### 1.1 Objetivo
Criar o Health Plan Agent 2.0 como um **agente orquestrador conversacional adaptativo** utilizando **LangGraph.js**, capaz de:
- Conversar livremente com o usuário
- Avançar ou retroceder entre capacidades conforme necessidade
- Reexecutar buscas e análises quando dados mudam
- Manter o contexto vivo enquanto o usuário quiser iterar
- Gerar recomendações sob demanda, não como passo final obrigatório

### 1.2 Problema
O Health Plan Agent v1 é uma **pipeline rígida de 5 steps sequenciais**:
- Steps são fixos e executam apenas uma vez
- Usuário só interage no início (coleta)
- Não permite voltar ou reexecutar steps
- Qualquer mudança de dados requer reiniciar do zero
- ERP bloqueia o fluxo mesmo quando não configurado

**Limitações críticas do v1:**
- Usuário adiciona dependentes → precisa reiniciar tudo
- Usuário quer simular cenário diferente → não consegue
- Usuário pede "só o preço" → precisa passar por todos os steps
- Conversa acaba após recomendação → não permite iteração

### 1.3 Solução
Implementar um **agente conversacional reativo** com LangGraph.js que:
- **Interpreta intenções** do usuário a cada mensagem
- **Executa capacidades** (não "steps") sob demanda
- **Mantém estado mutável** que pode ser alterado a qualquer momento
- **Permite loops** de coleta, busca e análise
- **Permanece ativo** até o usuário explicitamente finalizar

### 1.4 Mudança de Paradigma

| Aspecto | v1 (Pipeline) | v2 (Agente Conversacional) |
|---------|---------------|---------------------------|
| Modelo | Steps sequenciais 1→2→3→4→5→END | Loop de conversa com capacidades sob demanda |
| Coleta de dados | Uma vez no início | Contínua, reentrante, a qualquer momento |
| Busca de planos | Automática após coleta | Sob demanda ou quando dados mudam |
| Análise | Uma vez | Reexecutável quando contexto muda |
| ERP/Preços | Obrigatório no fluxo | Opcional, só quando usuário pede |
| Recomendação | Passo final único | Pode ser gerada múltiplas vezes |
| Fim da conversa | Após Step 5 | Quando usuário disser "finalizar" |
| Interação | Usuário responde perguntas | Usuário conversa livremente |

---

## 2. Escopo

### 2.1 Incluído no Escopo
- Novo assistente "Health Plan Agent 2.0" selecionável no frontend
- Novo endpoint `/api/chat/health-plan-agent-v2`
- Migração da orquestração para LangGraph.js StateGraph
- Integração com PostgresSaver para checkpointing via Supabase
- Reaproveitamento de toda lógica existente (schemas, prompts, templates, steps)
- Streaming de progresso e resultados
- Integração automática com LangSmith existente
- Testes unitários e de integração

### 2.2 Fora do Escopo
- Mudanças na lógica de negócio dos 5 steps
- Mudanças no frontend além do assistant picker
- Migração de dados de sessões v1 para v2
- Deprecação imediata do v1 (coexistência inicial)

### 2.3 Premissas
- LangGraph.js é estável para produção (v0.2+)
- Supabase suporta PostgresSaver sem modificações
- Frontend existente suporta múltiplos assistentes
- LangSmith workspace atual será reaproveitado

### 2.4 Restrições
- Manter compatibilidade com Next.js 14+ e TypeScript
- Usar mesmo workspace LangSmith
- Usar mesmas tabelas Supabase existentes (exceto novas do checkpointer)
- Não quebrar funcionalidades do v1 durante migração

---

## 3. Arquitetura

### 3.1 Modelo Conceitual: Agente Orquestrador Conversacional

O agente v2 opera em um **loop de conversa contínuo** com **capacidades sob demanda**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENTE ORQUESTRADOR CONVERSACIONAL                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      LOOP PRINCIPAL (REATIVO)                        │   │
│  │                                                                      │   │
│  │   ┌──────────┐     ┌──────────────┐     ┌──────────────────┐        │   │
│  │   │ Receber  │────▶│  Interpretar │────▶│ Decidir Próxima  │        │   │
│  │   │ Mensagem │     │   Intenção   │     │      Ação        │        │   │
│  │   └──────────┘     └──────────────┘     └────────┬─────────┘        │   │
│  │        ▲                                         │                   │   │
│  │        │                                         ▼                   │   │
│  │        │           ┌─────────────────────────────────────────┐      │   │
│  │        │           │         ROUTER DE INTENÇÕES             │      │   │
│  │        │           │                                         │      │   │
│  │        │           │  • coletar_info    → updateClientInfo   │      │   │
│  │        │           │  • buscar_planos   → searchPlans        │      │   │
│  │        │           │  • analisar        → analyzeCompatibility│      │   │
│  │        │           │  • consultar_preco → fetchPrices (opcional)│    │   │
│  │        │           │  • recomendar      → generateRecommendation│   │   │
│  │        │           │  • conversar       → respondToUser      │      │   │
│  │        │           │  • finalizar       → endConversation    │      │   │
│  │        │           └─────────────────────────────────────────┘      │   │
│  │        │                                         │                   │   │
│  │        │                                         ▼                   │   │
│  │   ┌──────────┐     ┌──────────────┐     ┌──────────────────┐        │   │
│  │   │ Enviar   │◀────│   Executar   │◀────│    Invalidar     │        │   │
│  │   │ Resposta │     │  Capacidade  │     │  Cache se mudou  │        │   │
│  │   └──────────┘     └──────────────┘     └──────────────────┘        │   │
│  │                                                                      │   │
│  │   ◀─────────────── LOOP CONTINUA ATÉ "finalizar" ──────────────────▶ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Capacidades (Não "Steps")

As funcionalidades são **capacidades independentes** que podem ser chamadas em qualquer ordem:

| Capacidade | Trigger | Pode Repetir? | Invalida Cache? |
|------------|---------|---------------|-----------------|
| `updateClientInfo` | Usuário fornece dados pessoais | ✅ Sim | Sim, invalida análise |
| `searchPlans` | Dados suficientes OU usuário pede | ✅ Sim | Sim, invalida análise |
| `analyzeCompatibility` | Planos encontrados OU usuário pede | ✅ Sim | Não |
| `fetchPrices` | Usuário pede explicitamente | ✅ Sim | Não |
| `generateRecommendation` | Análise pronta OU usuário pede | ✅ Sim | Não |
| `respondToUser` | Conversa geral, dúvidas | ✅ Sim | Não |
| `endConversation` | Usuário diz "finalizar" | ❌ Não | N/A |

### 3.3 Estrutura de Diretórios

```
lib/tools/health-plan-v2/
├── graph/
│   ├── state.ts                    # StateAnnotation com estado mutável
│   ├── orchestrator.ts             # Nó orquestrador principal (interpreta intenção)
│   ├── router.ts                   # Router de intenções → capacidades
│   ├── workflow.ts                 # StateGraph com loop conversacional
│   └── capabilities/               # Capacidades (não "nodes sequenciais")
│       ├── update-client-info.ts   # Atualizar/coletar info do cliente
│       ├── search-plans.ts         # Buscar planos (idempotente)
│       ├── analyze-compatibility.ts # Analisar compatibilidade
│       ├── fetch-prices.ts         # Consultar preços (opcional)
│       ├── generate-recommendation.ts # Gerar recomendação
│       ├── respond-to-user.ts      # Responder conversa geral
│       └── end-conversation.ts     # Finalizar conversa
├── intents/
│   ├── intent-classifier.ts        # Classificador de intenções via GPT
│   ├── intent-types.ts             # Tipos de intenção
│   └── prompts/
│       └── intent-classification-prompt.ts
├── state/
│   ├── state-manager.ts            # Gerenciador de estado mutável
│   ├── cache-invalidation.ts       # Lógica de invalidação de cache
│   └── data-change-detector.ts     # Detecta mudanças nos dados
├── checkpointer/
│   └── supabase-checkpointer.ts    # Persistência via Supabase
├── schemas/                        # REUTILIZAR de health-plan/
├── prompts/                        # REUTILIZAR de health-plan/
├── templates/                      # REUTILIZAR de health-plan/
├── core/                           # Lógica de negócio (reutilizada)
│   ├── extract-client-info.ts      # IMPORTAR de health-plan/
│   ├── search-health-plans.ts      # IMPORTAR de health-plan/
│   ├── analyze-compatibility.ts    # IMPORTAR de health-plan/
│   ├── fetch-erp-prices.ts         # IMPORTAR de health-plan/
│   └── generate-recommendation.ts  # IMPORTAR de health-plan/
├── types.ts
├── logger.ts
├── audit-logger.ts
└── index.ts
```

### 3.4 Diagrama do Grafo LangGraph (Conversacional)

```
                              ┌─────────────────────────────────────────┐
                              │                  START                   │
                              └─────────────────────────────────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ORCHESTRATOR NODE                                   │
│                                                                                  │
│    Recebe: mensagem do usuário + estado atual                                   │
│    Faz: Classifica intenção via GPT                                             │
│    Retorna: { intent, extractedData }                                           │
│    NOTA: Não gera resposta - capacidades são responsáveis por respostas         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                  │
                                    ┌─────────────┼─────────────┐
                                    │             │             │
                    ┌───────────────┴──┐    ┌────┴────┐    ┌───┴───────────────┐
                    ▼                  ▼    ▼         ▼    ▼                   ▼
          ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
          │ updateClientInfo│ │   searchPlans   │ │analyzeCompatib. │ │  fetchPrices    │
          │                 │ │                 │ │                 │ │   (OPCIONAL)    │
          │ • Atualiza dados│ │ • RAG search    │ │ • Scoring GPT   │ │ • Só se pedido  │
          │ • Invalida cache│ │ • Idempotente   │ │ • Ranking       │ │ • Mock/Real     │
          └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                   │                   │                   │                   │
                   └───────────────────┴───────────────────┴───────────────────┘
                                                  │
                                                  ▼
          ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
          │generateRecomm.  │ │  respondToUser  │ │ endConversation │
          │                 │ │                 │ │                 │
          │ • Markdown      │ │ • Conversa geral│ │ • Salva audit   │
          │ • Pode repetir  │ │ • Dúvidas       │ │ • Fecha sessão  │
          └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                   │                   │                   │
                   │                   │                   ▼
                   │                   │          ┌─────────────────┐
                   │                   │          │       END       │
                   │                   │          │  (Só aqui!)     │
                   └───────────────────┘          └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ AGUARDAR PRÓXIMA│◀─────────────────────────────────────┐
                    │    MENSAGEM     │                                       │
                    └────────┬────────┘                                       │
                             │                                                │
                             └────────────────────────────────────────────────┘
                                         LOOP CONTÍNUO
```

### 3.5 State Annotation (Mutável e Reativo)

```typescript
import { Annotation } from "@langchain/langgraph";

// Intenções possíveis do usuário
type UserIntent =
  | "fornecer_dados"      // Fornecendo idade, dependentes, cidade, etc.
  | "buscar_planos"       // "Quero ver os planos", "Busque opções"
  | "analisar"            // "Analise esses planos", "Qual é melhor?"
  | "consultar_preco"     // "Quanto custa?", "Me dê os preços"
  | "pedir_recomendacao"  // "Me recomende", "Qual você sugere?"
  | "conversar"           // Dúvidas gerais, perguntas
  | "alterar_dados"       // "Na verdade tenho 35 anos", "Adicione meu filho"
  | "simular_cenario"     // "E se eu tirar meu filho?", "Simule só para mim"
  | "finalizar";          // "Obrigado", "Pode fechar", "Finalizar"

// Estado do agente (mutável)
const HealthPlanStateAnnotation = Annotation.Root({
  // === IDENTIFICADORES ===
  workspaceId: Annotation<string>,
  userId: Annotation<string>,
  assistantId: Annotation<string>,
  chatId: Annotation<string>,

  // === CONVERSA ===
  messages: Annotation<Array<{ role: string; content: string }>>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  lastIntent: Annotation<UserIntent | null>({
    default: () => null,
  }),

  // === DADOS DO CLIENTE (MUTÁVEIS) ===
  clientInfo: Annotation<PartialClientInfo>({
    reducer: (current, update) => ({ ...current, ...update }), // Merge, não substitui
    default: () => ({}),
  }),
  clientInfoVersion: Annotation<number>({
    reducer: (_, v) => v,
    default: () => 0,
  }),

  // === RESULTADOS DE BUSCA (CACHEÁVEIS) ===
  searchResults: Annotation<HealthPlanDocument[]>({
    default: () => [],
  }),
  searchResultsVersion: Annotation<number>({
    default: () => 0, // Incrementa quando clientInfo muda
  }),

  // === ANÁLISE (CACHEÁVEL) ===
  compatibilityAnalysis: Annotation<RankedAnalysis | null>({
    default: () => null,
  }),
  analysisVersion: Annotation<number>({
    default: () => 0, // Incrementa quando searchResults muda
  }),

  // === PREÇOS (OPCIONAL, SOB DEMANDA) ===
  erpPrices: Annotation<ERPPriceResult | null>({
    default: () => null,
  }),
  pricesRequested: Annotation<boolean>({
    default: () => false, // Só busca se usuário pedir
  }),

  // === RECOMENDAÇÃO (PODE GERAR MÚLTIPLAS VEZES) ===
  recommendation: Annotation<GenerateRecommendationResult | null>({
    default: () => null,
  }),
  recommendationVersion: Annotation<number>({
    default: () => 0,
  }),

  // === CONTROLE DE FLUXO ===
  isConversationActive: Annotation<boolean>({
    default: () => true, // Só false quando usuário finaliza
  }),
  pendingAction: Annotation<string | null>({
    default: () => null,
  }),

  // === METADATA ===
  errors: Annotation<Array<{ capability: string; message: string; timestamp: string }>>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});
```

### 3.6 Lógica de Invalidação de Cache

Quando dados mudam, caches anteriores são invalidados:

```typescript
// Regras de invalidação
const INVALIDATION_RULES = {
  // Se clientInfo mudar → invalidar searchResults e analysis
  clientInfo: ["searchResults", "compatibilityAnalysis", "recommendation"],

  // Se searchResults mudar → invalidar analysis
  searchResults: ["compatibilityAnalysis", "recommendation"],

  // Se analysis mudar → invalidar recommendation
  compatibilityAnalysis: ["recommendation"],

  // Preços não invalidam nada (são consultivos)
  erpPrices: [],
};

// Exemplo: usuário adiciona dependente
function onClientInfoChange(state: HealthPlanState, newData: Partial<ClientInfo>) {
  return {
    ...state,
    clientInfo: { ...state.clientInfo, ...newData },
    clientInfoVersion: state.clientInfoVersion + 1,
    // Invalida caches dependentes
    searchResults: [],
    searchResultsVersion: 0,
    compatibilityAnalysis: null,
    analysisVersion: 0,
    recommendation: null,
    recommendationVersion: 0,
  };
}
```

### 3.7 Checkpointer (Persistência)

```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// Em produção (Vercel): usar connection pooler para evitar esgotamento de conexões
// Em desenvolvimento: conexão direta é ok
const checkpointer = PostgresSaver.fromConnString(
  process.env.NODE_ENV === 'production'
    ? process.env.DATABASE_URL_POOLER!   // PgBouncer (porta 6543)
    : process.env.DATABASE_URL!,         // Conexão direta
  { schema: "langgraph" }
);

// Config por thread (chat)
const config = {
  configurable: {
    thread_id: chatId, // Cada chat é uma thread
  },
};

// O estado é persistido automaticamente após cada node
// Permite retomar conversa de onde parou
```

> 📝 **Nota**: Ver seção 6.4 para configuração completa de deploy na Vercel.

### 3.8 Fluxos de Exemplo

**Fluxo 1: Coleta → Busca → Análise → Recomendação**
```
Usuário: "Preciso de um plano de saúde"
→ Orchestrator detecta: "fornecer_dados" (implícito, precisa coletar)
→ Responde perguntando idade

Usuário: "Tenho 35 anos, moro em SP"
→ updateClientInfo: { age: 35, city: "São Paulo", state: "SP" }
→ Orchestrator: dados insuficientes, pergunta sobre dependentes

Usuário: "Sou solteiro, sem dependentes, orçamento de R$800"
→ updateClientInfo: { dependents: [], budget: 800 }
→ Dados completos! Orchestrator decide: searchPlans

→ searchPlans executa
→ analyzeCompatibility executa
→ generateRecommendation executa
→ Usuário recebe recomendação
→ LOOP CONTINUA (não termina)

Usuário: "E se eu adicionar minha mãe de 60 anos?"
→ Orchestrator detecta: "alterar_dados" + "simular_cenario"
→ updateClientInfo: { dependents: [{ age: 60, relationship: "parent" }] }
→ Cache invalidado!
→ searchPlans reexecuta
→ analyzeCompatibility reexecuta
→ generateRecommendation reexecuta
→ Nova recomendação

Usuário: "Perfeito, pode finalizar"
→ Orchestrator detecta: "finalizar"
→ endConversation: salva audit, marca sessão completa
→ END
```

**Fluxo 2: Usuário pede preço explicitamente**
```
Usuário: "Quanto custa o Bradesco Saúde?"
→ Orchestrator detecta: "consultar_preco"
→ fetchPrices executa (se ERP configurado) ou retorna mock
→ Responde com preços
→ LOOP CONTINUA
```

**Fluxo 3: Conversa geral**
```
Usuário: "O que é coparticipação?"
→ Orchestrator detecta: "conversar"
→ respondToUser: explica coparticipação
→ LOOP CONTINUA (não executa nenhuma capacidade de negócio)
```

---

## 4. Requisitos Funcionais

### RF-001: Orquestrador Conversacional
**Prioridade:** Alta
**Descrição:** Implementar nó orquestrador que interpreta intenções do usuário e decide qual capacidade executar.

**Critérios de Aceitação:**
- [ ] Classifica intenções via GPT (fornecer_dados, buscar_planos, analisar, etc.)
- [ ] Extrai dados do usuário da mensagem quando aplicável
- [ ] Decide próxima capacidade baseado em intenção + estado atual
- [ ] Mantém conversa natural mesmo quando executando capacidades

### RF-002: Loop de Conversa Contínuo
**Prioridade:** Alta
**Descrição:** Grafo permanece ativo até usuário explicitamente finalizar, permitindo iterações infinitas.

**Critérios de Aceitação:**
- [ ] Conversa não termina após recomendação
- [ ] Usuário pode fazer perguntas a qualquer momento
- [ ] Só finaliza com intenção "finalizar" explícita
- [ ] Suporta múltiplas recomendações na mesma sessão

### RF-003: Coleta de Dados Reentrante
**Prioridade:** Alta
**Descrição:** Capacidade `updateClientInfo` pode ser chamada múltiplas vezes, em qualquer momento.

**Critérios de Aceitação:**
- [ ] Usuário pode adicionar/remover dependentes a qualquer momento
- [ ] Usuário pode corrigir dados já fornecidos
- [ ] Dados são mergeados, não substituídos
- [ ] Mudanças invalidam caches dependentes automaticamente

### RF-004: Busca de Planos Sob Demanda
**Prioridade:** Alta
**Descrição:** Capacidade `searchPlans` é idempotente e executável sob demanda.

**Critérios de Aceitação:**
- [ ] Executa automaticamente quando dados suficientes
- [ ] Reexecuta quando clientInfo muda
- [ ] Usuário pode pedir "busque novamente" explicitamente
- [ ] Suporta filtros específicos ("planos com hospital X")

### RF-005: Análise Reexecutável
**Prioridade:** Alta
**Descrição:** Capacidade `analyzeCompatibility` pode ser chamada múltiplas vezes.

**Critérios de Aceitação:**
- [ ] Reexecuta quando searchResults muda
- [ ] Usuário pode pedir "analise novamente"
- [ ] Suporta análise comparativa específica ("compare A e B")

### RF-006: Preços Opcionais
**Prioridade:** Média
**Descrição:** Capacidade `fetchPrices` é opcional e só executa quando usuário pede.

**Critérios de Aceitação:**
- [ ] Não bloqueia fluxo de recomendação
- [ ] Só executa com intenção "consultar_preco"
- [ ] Funciona com mock quando ERP não configurado
- [ ] Retorna estimativa se ERP indisponível

### RF-007: Recomendação Iterativa
**Prioridade:** Alta
**Descrição:** Capacidade `generateRecommendation` pode gerar múltiplas recomendações.

**Critérios de Aceitação:**
- [ ] Gera nova recomendação quando análise muda
- [ ] Usuário pode pedir "recomende novamente"
- [ ] Suporta recomendações comparativas ("e se eu tirar meu filho?")
- [ ] Cada recomendação é salva no audit log

### RF-008: Conversa Geral
**Prioridade:** Média
**Descrição:** Capacidade `respondToUser` responde dúvidas sem executar lógica de negócio.

**Critérios de Aceitação:**
- [ ] Responde perguntas sobre planos de saúde
- [ ] Explica termos técnicos (coparticipação, carência, etc.)
- [ ] Não invalida caches
- [ ] Usa contexto do estado atual

### RF-009: Simulação de Cenários
**Prioridade:** Alta
**Descrição:** Suportar simulações "e se" sem alterar estado permanente.

**Critérios de Aceitação:**
- [ ] "E se eu adicionar minha mãe?" → simula e mostra resultado
- [ ] "E se meu orçamento fosse R$1000?" → simula e mostra resultado
- [ ] Usuário pode confirmar ou descartar simulação
- [ ] Simulações não invalidam estado atual até confirmação

### RF-010: Invalidação Inteligente de Cache
**Prioridade:** Alta
**Descrição:** Sistema de versionamento que invalida caches quando dados upstream mudam.

**Critérios de Aceitação:**
- [ ] Mudança em clientInfo invalida searchResults, analysis, recommendation
- [ ] Mudança em searchResults invalida analysis, recommendation
- [ ] Mudança em analysis invalida recommendation
- [ ] Preços não invalidam nada

### RF-011: Finalização Explícita
**Prioridade:** Média
**Descrição:** Conversa só termina quando usuário pede explicitamente.

**Critérios de Aceitação:**
- [ ] Detecta intenções de finalização ("obrigado", "finalizar", "pode fechar")
- [ ] Salva auditoria completa antes de fechar
- [ ] Oferece resumo final antes de encerrar
- [ ] Não finaliza acidentalmente

### RF-012: Estado Persistente via Checkpointer
**Prioridade:** Alta
**Descrição:** Estado completo persistido automaticamente via PostgresSaver.

**Critérios de Aceitação:**
- [ ] Estado salvo após cada capacidade executada
- [ ] Retomada de conversa funcional
- [ ] Versões de cache preservadas
- [ ] Histórico de mensagens preservado

### RF-013: Integração LangSmith Automática
**Prioridade:** Média
**Descrição:** Traces automáticos no LangSmith para cada execução.

**Critérios de Aceitação:**
- [ ] Cada capacidade aparece como span
- [ ] Intenção classificada no trace
- [ ] Metadata de negócio incluída
- [ ] Agrupamento por chatId

### RF-014: Endpoint API v2
**Prioridade:** Alta
**Descrição:** Novo endpoint para o agente conversacional.

**Critérios de Aceitação:**
- [ ] POST `/api/chat/health-plan-agent-v2`
- [ ] Aceita mensagem única (não lista)
- [ ] Retorna streaming de resposta
- [ ] Mantém compatibilidade com frontend existente

### RF-015: Novo Assistente no Frontend
**Prioridade:** Alta
**Descrição:** Criar assistente "Health Plan Agent 2.0" selecionável.

**Critérios de Aceitação:**
- [ ] Aparece no picker para workspaces autorizados
- [ ] Badge visual diferente do v1
- [ ] Usa endpoint v2

### RF-016: Coexistência v1/v2
**Prioridade:** Média
**Descrição:** Ambas versões funcionando simultaneamente.

**Critérios de Aceitação:**
- [ ] v1 inalterado em `/api/chat/health-plan-agent`
- [ ] v2 em `/api/chat/health-plan-agent-v2`
- [ ] Seleção via assistente diferente

---

## 5. Requisitos Não-Funcionais

### RNF-001: Performance
- Tempo de resposta do grafo completo: < 90s
- Tempo de streaming do primeiro chunk: < 2s
- Cold start (primeiro request): < 5s (aceitável em serverless)
- Requests subsequentes (warm): < 2s para primeiro chunk
- Overhead do LangGraph vs v1: < 5%

### RNF-002: Confiabilidade
- Retry automático em falhas transientes (configurável)
- Graceful degradation em falha de ERP
- Recovery via checkpoint em crash

### RNF-003: Observabilidade
- 100% dos nodes rastreados no LangSmith
- Logs estruturados mantidos
- Métricas de negócio no trace

### RNF-004: Manutenibilidade
- Documentação inline em todos os nodes
- Testes com cobertura > 80%

### RNF-005: Compatibilidade
- Next.js 14+
- TypeScript 5+
- Node.js 18+
- Supabase (PostgreSQL 15+)

### RNF-006: Compatibilidade Vercel (Plano Pro)
- Runtime: `nodejs` (não `edge` - PostgresSaver requer Node.js APIs)
- maxDuration: 300 segundos (5 minutos)
- Connection pooling via Supabase PgBouncer (porta 6543)
- LangSmith tracing síncrono (`LANGCHAIN_CALLBACKS_BACKGROUND=false`)
- Versão `@langchain/openai` fixada em 0.5.10 (evitar breaking changes)

---

## 6. Dependências Técnicas

### 6.1 Pacotes NPM Necessários

```json
{
  "dependencies": {
    "@langchain/langgraph": "0.4.9",
    "@langchain/langgraph-checkpoint-postgres": "0.1.2",
    "@langchain/core": "0.3.68",
    "@langchain/openai": "0.6.15"
  }
}
```

> ⚠️ **ATUALIZAÇÃO (Fase 1)**: As versões originais (0.2.0, 0.0.6) não existem no npm ou são incompatíveis. As versões acima foram instaladas e testadas. O pacote `@langchain/langgraph-checkpoint` não é instalado diretamente - vem como dependência transitiva.

> 📝 **Nota sobre versões**: Recomenda-se fixar as versões SEM caret (^) para evitar upgrades automáticos que podem quebrar compatibilidade. O upgrade para 1.0.x requer migração de todo o stack LangChain simultaneamente.

### 6.2 Variáveis de Ambiente

```bash
# Existentes (sem mudança)
OPENAI_API_KEY=sk-...
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=health-plan-agent

# Conexão Supabase (usar POOLER para serverless)
DATABASE_URL=postgresql://...                    # Conexão direta (desenvolvimento local)
DATABASE_URL_POOLER=postgresql://...:6543/...?pgbouncer=true  # Via PgBouncer (produção Vercel)

# LangSmith em Serverless (OBRIGATÓRIO para Vercel)
LANGCHAIN_CALLBACKS_BACKGROUND=false             # Garante que traces são enviados antes da função terminar

# Novas (opcional)
LANGGRAPH_CHECKPOINT_SCHEMA=langgraph
```

### 6.3 Tabelas Supabase

**Existentes (sem mudança):**
- `health_plan_sessions`
- `client_recommendations`
- `erp_config`
- `erp_price_cache`

**Novas (criadas na Fase 1 - schema `langgraph`):**
- `langgraph.checkpoints` - Estados salvos do workflow
- `langgraph.checkpoint_blobs` - Dados binários grandes
- `langgraph.checkpoint_writes` - Writes pendentes

> 📝 **ATUALIZAÇÃO (Fase 1)**: O schema segue a estrutura do `@langchain/langgraph-checkpoint-postgres@0.1.2`. A tabela `langgraph.writes` mencionada anteriormente não existe nesta versão - foi substituída por `checkpoint_writes`.

### 6.4 Configuração de Deploy (Vercel Pro)

#### Configuração do Endpoint (Estado Atual - Fase 1)

```typescript
// app/api/chat/health-plan-agent-v2/route.ts
import { StreamingTextResponse } from 'ai';

// Configuração obrigatória para Vercel
export const runtime = 'nodejs';     // NÃO usar 'edge' - PostgresSaver requer Node.js
export const maxDuration = 300;      // 5 minutos (máximo do Vercel Pro)

export async function POST(req: Request) {
  // ... implementação stub

  // Fase 1: Streaming manual via StreamingTextResponse
  return new StreamingTextResponse(stream);
}
```

> ⚠️ **DIVERGÊNCIA (Fase 1)**: O código acima reflete a implementação ATUAL (stub). As features abaixo estão planejadas para fases posteriores:
> - **Checkpointer (PostgresSaver)**: Fase 2 - Não integrado no endpoint ainda
> - **LangChainAdapter**: Requer upgrade do pacote `ai` para 5.x+ e instalação de `@ai-sdk/langchain`
> - **Streaming real do LLM**: Fase 4 - Atualmente simula streaming dividindo resposta em palavras

#### Configuração Alvo (Fase 2+)

```typescript
// Implementação futura quando checkpointer for integrado
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const checkpointer = PostgresSaver.fromConnString(
  process.env.NODE_ENV === 'production'
    ? process.env.DATABASE_URL_POOLER!
    : process.env.DATABASE_URL!,
  { schema: "langgraph" }
);

const app = workflow.compile({ checkpointer });
```

#### Variáveis de Ambiente no Vercel

Configurar no dashboard da Vercel (Settings → Environment Variables):

| Variável | Valor | Ambiente |
|----------|-------|----------|
| `DATABASE_URL_POOLER` | `postgresql://...@db.xxx.supabase.co:6543/postgres?pgbouncer=true` | Production |
| `LANGCHAIN_CALLBACKS_BACKGROUND` | `false` | Production |
| `OPENAI_API_KEY` | `sk-...` | All |
| `LANGSMITH_API_KEY` | `lsv2_...` | All |
| `LANGSMITH_PROJECT` | `health-plan-agent` | All |

#### Connection Pooling (PgBouncer)

Em serverless, cada request pode criar uma nova conexão de banco. Para evitar esgotamento:

1. **Usar Supabase Connection Pooler** (já incluso no Supabase)
2. **Porta 6543** ao invés de 5432
3. **Parâmetro `?pgbouncer=true`** na connection string

```bash
# Conexão direta (NÃO usar em produção serverless)
DATABASE_URL=postgresql://user:pass@db.xxx.supabase.co:5432/postgres

# Conexão via pooler (USAR em produção)
DATABASE_URL_POOLER=postgresql://user:pass@db.xxx.supabase.co:6543/postgres?pgbouncer=true
```

#### Limites do Vercel Pro

| Recurso | Limite |
|---------|--------|
| Duração máxima da função | 5 minutos |
| Tamanho do payload | 4.5 MB |
| Memória | 1024 MB (padrão) |
| Concurrent executions | 1000 |

---

## 7. Plano de Implementação

> 📝 **Filosofia**: "Endpoint First, Features Later" - O endpoint é criado na Fase 1, permitindo que QA teste incrementalmente cada nova funcionalidade à medida que é implementada.

### Fase 1: Setup + Endpoint Stub + Frontend (2 dias)
**🎯 QA pode testar: Assistente aparece no frontend, endpoint responde**

- [x] Instalar dependências LangGraph.js (versões 0.4.9/0.1.2/0.3.68/0.6.15)
- [x] Criar estrutura de diretórios `lib/agents/health-plan-v2/`
- [x] **Criar endpoint `/api/chat/health-plan-agent-v2`** com resposta stub
- [~] Configurar streaming básico ~~com `LangChainAdapter`~~ → Usando `StreamingTextResponse` (LangChainAdapter requer ai@5.x)
- [x] **Criar assistente "Health Plan v2" no banco** (via INSERT manual, migration cria função)
- [x] Copiar/importar schemas, prompts, templates do v1 (re-exports)
- [x] Configurar PostgresSaver com Supabase (integrado na Fase 2)
- [x] Criar migration para tabelas de checkpoint (schema langgraph)
- [x] Atualizar frontend para detectar v2 e rotear para endpoint correto

**Legenda**: [x] Completo | [~] Parcial/Divergente | [ ] Pendente

> ⚠️ **NOTA (Fase 1 Implementada)**:
> - **Workflow**: Grafo simplificado `START→orchestrator→END` (loop conversacional vem na Fase 4)
> - **Streaming**: Simula streaming dividindo resposta em palavras (streaming real do LLM na Fase 4)
> - **Assistente**: Criado manualmente via SQL. Migration cria função, mas não executa seed automático
> - **System Messages**: Convertidas para AIMessage (correção necessária)

**Checkpoint QA**: Frontend mostra assistente v2, enviar mensagem retorna resposta stub "Olá! Sou o assistente de planos de saúde v2. Em breve estarei totalmente funcional."

### Fase 2: State + Persistência (1-2 dias) ✅ IMPLEMENTADA
**🎯 QA pode testar: Conversa persiste entre refreshes de página**

- [x] Implementar `HealthPlanStateAnnotation` completo (já existia da Fase 1, validado)
- [x] Definir tipos de intenção (`UserIntent`) (já existia da Fase 1, validado)
- [x] Integrar checkpointer no endpoint (`route.ts` modificado com try/catch e modo degradado)
- [x] Testar persistência: refresh da página mantém histórico
- [x] Implementar sistema de versionamento de estado
- [x] **Adicional**: Criar `cache-invalidation.ts` com `INVALIDATION_RULES` (PRD seção 3.6)
- [x] **Adicional**: 35 testes unitários para cache e persistência

**Implementação:**
- `lib/agents/health-plan-v2/state/cache-invalidation.ts` - Lógica de invalidação
- `lib/agents/health-plan-v2/__tests__/cache-invalidation.test.ts` - 25 testes
- `lib/agents/health-plan-v2/__tests__/checkpointer-persistence.test.ts` - 10 testes
- `jest.setup.ts` - Polyfills (TextEncoder, ReadableStream) para LangChain

**Headers de resposta adicionados:**
- `X-Checkpointer-Enabled: true/false`
- `X-Last-Intent`, `X-Intent-Confidence`, `X-Client-Info-Version` (debug)

**Checkpoint QA**: Enviar mensagens, dar refresh, histórico permanece. Abrir nova aba com mesmo chat, ver mesmo estado. Verificar header `X-Checkpointer-Enabled: true`.

### Fase 3: Classificador de Intenções (2 dias) ✅ IMPLEMENTADA
**🎯 QA pode testar: Intenções são classificadas (debug panel)**

- [x] Criar prompt de classificação de intenções
- [x] Implementar `intent-classifier.ts`
- [x] Integrar classificador no orchestrator node
- [x] **Adicionar metadata de debug na resposta** (intenção detectada)
- [x] Testar com diversos inputs naturais
- [x] Ajustar prompt baseado em testes

**Implementação:**
- `lib/agents/health-plan-v2/intent/intent-classification-types.ts` - Tipos, constantes e helpers (~200 linhas)
- `lib/agents/health-plan-v2/intent/prompts/intent-classification-prompt.ts` - System prompt + 25 few-shot examples (~400 linhas)
- `lib/agents/health-plan-v2/intent/intent-classifier.ts` - Classificador GPT-4o + validação Zod (~250 linhas)
- `lib/agents/health-plan-v2/intent/index.ts` - Re-exports do módulo (~35 linhas)
- `lib/agents/health-plan-v2/nodes/orchestrator.ts` - Integração com merge de clientInfo
- `lib/agents/health-plan-v2/state/state-annotation.ts` - Campo `lastIntentConfidence`
- `app/api/chat/health-plan-agent-v2/route.ts` - Debug metadata no stream + headers HTTP

**Decisões técnicas:**
- **Tracing LangSmith**: Usa tags nativas do LangChain (`tags: ["intent-classifier"]`) ao invés de `@traceable` do langsmith. Motivo: `@traceable` conflita com tracing automático do LangGraph (erro "dotted_order must contain at least two parts").
- **Threshold de confiança**: MIN_CONFIDENCE_THRESHOLD = 0.5. Abaixo disso, classifica como "conversar".
- **Merge de clientInfo**: Incremental (não substitui dados existentes). Arrays são unidos com Set para evitar duplicatas.

**Headers de debug adicionados:**
- `X-Last-Intent: fornecer_dados`
- `X-Intent-Confidence: 0.95`
- `X-Client-Info-Version: 1`

**Checkpoint QA**: Enviar "quero um plano de saúde" → ver intent=`buscar_planos`. Enviar "e se eu tiver 2 filhos?" → ver intent=`simular_cenario`. Enviar "oi, tudo bem?" → ver intent=`conversar`. Debug visível em console/devtools e headers HTTP.

### Fase 4: Orquestrador + Loop Básico (2 dias) ✅ IMPLEMENTADA
**🎯 QA pode testar: Conversa flui em loop contínuo**

- [x] Implementar `orchestrator.ts` (nó principal - apenas classifica intenção)
- [x] Implementar `router.ts` (decisão de próxima capacidade com redirecionamento)
- [x] Implementar `workflow.ts` com loop conversacional
- [x] Integrar orquestrador no endpoint
- [x] Conversa em loop: responde → aguarda → processa → responde
- [x] **Corrigir persistência de mensagens** (ver abaixo)

**Arquitetura de Respostas:**
- Orchestrator: apenas classifica intenção e extrai dados, NÃO gera resposta
- Capacidades: cada uma gera sua própria resposta contextual e adiciona `AIMessage` ao estado
- Padronização: todas as respostas ao usuário vêm das capacidades

**Correção de Persistência de Mensagens (Bug identificado na Fase 2):**

O `messagesStateReducer` do LangGraph faz append de mensagens por ID. Problema: mensagens criadas sem ID explícito geram novo UUID a cada chamada, causando duplicação quando checkpointer restaura estado.

**Solução implementada:**
1. **route.ts**: Quando checkpointer ativo, passar apenas a **última mensagem** (nova) no `initialState.messages`
2. **Capacidades**: Cada capacidade adiciona `AIMessage` ao estado após gerar resposta

**Checkpoint QA**: Enviar múltiplas mensagens em sequência. Conversa não "termina" sozinha. Agente sempre aguarda próxima mensagem. Verificar que mensagens não duplicam ao recarregar página.

### Fase 5: Capacidade - Coleta de Dados (1-2 dias)
**🎯 QA pode testar: Agente pergunta e coleta informações**

- [ ] Implementar `updateClientInfo` capability
- [ ] Extrair dados de mensagens do usuário
- [ ] Fazer perguntas de follow-up inteligentes
- [ ] Validar dados coletados
- [ ] Atualizar state com informações do cliente

**Checkpoint QA**: Dizer "tenho 35 anos, moro em SP". Agente extrai e confirma. Perguntar "quantos dependentes?" se não informado.

### Fase 6: Capacidade - Busca RAG (1-2 dias)
**🎯 QA pode testar: Busca de planos funciona**

- [ ] Implementar `searchPlans` capability (idempotente)
- [ ] Integrar com busca RAG existente (v1)
- [ ] Cache de resultados por hash de parâmetros
- [ ] Mostrar planos encontrados na resposta

**Checkpoint QA**: Fornecer dados completos → agente busca planos → mostra resumo dos planos encontrados.

### Fase 7: Capacidade - Análise + Recomendação (2 dias)
**🎯 QA pode testar: Análise e recomendação completa**

- [ ] Implementar `analyzeCompatibility` capability (com cache)
- [ ] Implementar `generateRecommendation` capability
- [ ] Lógica de invalidação de cache
- [ ] Recomendação iterativa (pode melhorar com mais dados)

**Checkpoint QA**: Fluxo completo: dados → busca → análise → recomendação humanizada. Alterar dado → recomendação se atualiza.

### Fase 8: Capacidade - Preços ERP (1 dia)
**🎯 QA pode testar: Preços reais aparecem (se ERP configurado)**

- [ ] Implementar `fetchPrices` capability (opcional)
- [ ] Integrar com ERP existente (v1)
- [ ] Graceful degradation se ERP indisponível
- [ ] Mostrar preços na recomendação

**Checkpoint QA**: Se ERP ativo, preços reais aparecem. Se não, mensagem informando estimativa.

### Fase 9: Capacidades - Conversa Geral + Finalização (1 dia)
**🎯 QA pode testar: Perguntas genéricas e finalização**

- [ ] Implementar `respondToUser` capability (perguntas fora do escopo)
- [ ] Implementar `endConversation` capability
- [ ] Finalização gera audit/summary
- [ ] Usuário controla quando encerra

**Checkpoint QA**: Perguntar "o que é coparticipação?" → resposta clara. Dizer "obrigado, pode encerrar" → finalização com resumo.

### Fase 10: Simulação de Cenários (1-2 dias)
**🎯 QA pode testar: Cenários "e se" funcionam**

- [ ] Implementar lógica de "fork" do estado
- [ ] Simulação sem alteração permanente
- [ ] Confirmação/descarte de simulação
- [ ] Comparação antes/depois

**Checkpoint QA**: "E se eu adicionar um dependente de 60 anos?" → simulação mostra impacto. "Confirmar" ou "descartar".

### Fase 11: Polish + Testes E2E (2 dias)
**🎯 QA pode testar: Fluxos completos end-to-end**

- [ ] Testes de integração do grafo completo
- [ ] Testes de fluxos conversacionais variados
- [ ] Testes de invalidação de cache
- [ ] Testes de persistência/retomada
- [ ] Testes de edge cases
- [ ] Ajustes de UX baseados em feedback QA

**Checkpoint QA**: Roteiro completo de testes. Todos os cenários do PRD funcionando.

### Fase 12: Deploy e Monitoramento (1 dia)
**🎯 QA pode testar: Produção funciona igual staging**

- [ ] Code review final
- [ ] Deploy em staging (validação completa)
- [ ] Deploy em produção
- [ ] Monitoramento LangSmith ativo
- [ ] Alertas configurados

**Total estimado: 16-20 dias úteis**

---

### Matriz de Testabilidade por Fase

| Fase | Funcionalidade Testável | Critério de Aceite QA | Status |
|------|-------------------------|----------------------|--------|
| 1 | Assistente no frontend | Aparece na lista, aceita mensagens | ✅ |
| 2 | Persistência | Refresh mantém conversa, header `X-Checkpointer-Enabled: true` | ✅ |
| 3 | Classificação | Debug mostra intenção correta, headers X-Last-Intent/X-Intent-Confidence | ✅ |
| 4 | Loop conversacional | Múltiplas mensagens fluem | |
| 5 | Coleta de dados | Extrai e confirma informações | |
| 6 | Busca RAG | Encontra planos compatíveis | |
| 7 | Recomendação | Gera recomendação humanizada | |
| 8 | Preços ERP | Mostra preços ou fallback | |
| 9 | Conversa geral | Responde perguntas, finaliza | |
| 10 | Simulação | "E se" funciona | |
| 11 | E2E | Todos os fluxos passam | |
| 12 | Produção | Igual staging | |

---

### LangSmith para QA - Guia de Análise por Fase

> 🔍 **Acesso**: O time de QA tem acesso ao workspace LangSmith do projeto. Cada trace pode ser analisado em tempo real durante os testes.

#### Fase 1-2: Setup e Persistência
**O que aparece no LangSmith:**
- Trace básico do endpoint
- Span único: `health-plan-agent-v2`
- Metadata: `chatId`, `userId`, `timestamp`

**QA deve verificar:**
- [ ] Traces aparecem ao enviar mensagem
- [ ] `chatId` é consistente entre mensagens da mesma conversa
- [ ] Metadata básica está presente

#### Fase 3: Classificador de Intenções
**O que aparece no LangSmith:**
- Span: `intent-classifier`
- Input: mensagem do usuário
- Output: `{ intent: "fornecer_dados" | "simular_cenario" | ... }`
- Latência da classificação

**QA deve verificar:**
- [ ] Intent classificada corretamente para cada tipo de mensagem
- [ ] Latência < 2s para classificação
- [ ] Dados extraídos junto com intenção (se aplicável)

#### Fase 4: Orquestrador
**O que aparece no LangSmith:**
- Span: `orchestrator`
- Span: `router`
- Decisão de roteamento: qual capacidade foi escolhida
- Estado atual do grafo

**QA deve verificar:**
- [ ] Orquestrador escolhe capacidade correta
- [ ] Loop não entra em ciclo infinito
- [ ] Transições de estado visíveis

#### Fases 5-9: Capacidades
**O que aparece no LangSmith:**
- Span separado para cada capacidade executada:
  - `updateClientInfo` - dados extraídos/validados
  - `searchPlans` - query RAG, planos encontrados
  - `analyzeCompatibility` - scores, análise
  - `fetchPrices` - chamada ERP, preços
  - `generateRecommendation` - prompt, resposta
  - `respondToUser` - resposta conversacional
  - `endConversation` - audit/summary
- Cache hit/miss para capacidades idempotentes
- Tempo de execução de cada capacidade

**QA deve verificar:**
- [ ] Capacidade correta é executada para cada intenção
- [ ] Cache funciona (mesma query = cache hit)
- [ ] Invalidação de cache (dado mudou = cache miss)
- [ ] Tempo total < 90s para fluxo completo

#### Fase 10: Simulação
**O que aparece no LangSmith:**
- Span: `simulation-fork`
- Estado original vs estado simulado
- Diferenças de recomendação

**QA deve verificar:**
- [ ] Fork de estado aparece como span separado
- [ ] Comparação antes/depois visível
- [ ] Confirmação/descarte registrado

#### Métricas para QA Monitorar no LangSmith

| Métrica | Threshold | Onde Ver |
|---------|-----------|----------|
| Latência total | < 90s | Trace duration |
| Primeiro chunk | < 2s | Tempo até primeiro span de resposta |
| Classificação | < 2s | Span `intent-classifier` |
| Cache hit rate | > 70% | Tag `cache: hit/miss` |
| Erros | 0 | Status: Error |
| Loops excessivos | < 10 iterações | Count de spans `orchestrator` |

#### Tags Úteis para Filtrar

```
# Filtrar por chat específico
metadata.chatId = "abc123"

# Ver apenas erros
status = "error"

# Ver capacidade específica
name = "searchPlans"

# Ver classificações de intenção
name = "intent-classifier" AND output.intent = "simular_cenario"

# Ver cache misses
tags CONTAINS "cache:miss"
```

#### Dashboards Sugeridos para QA

1. **Accuracy Dashboard**: Taxa de classificação correta por tipo de intenção
2. **Performance Dashboard**: P50/P95 de latência por capacidade
3. **Cache Dashboard**: Hit rate por capacidade
4. **Error Dashboard**: Erros por tipo e fase
5. **Conversation Flow**: Visualização de sequência de capacidades

---

### Marcos (Milestones)

| Milestone | Fases | Entrega | QA Validation |
|-----------|-------|---------|---------------|
| **M1: Testável** | 1-2 | Endpoint no frontend com persistência | ✅ Pode começar testes |
| **M2: Inteligente** | 3-4 | Classifica intenções, loop funciona | ✅ Testa classificação |
| **M3: Funcional** | 5-7 | Coleta → Busca → Recomendação | ✅ Fluxo principal |
| **M4: Completo** | 8-10 | Preços, conversa, simulação | ✅ Features avançadas |
| **M5: Produção** | 11-12 | Deploy e monitoramento | ✅ Release ready |

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **Classificação de intenção imprecisa** | Alta | Alto | Fine-tuning do prompt, fallback para "conversar", testes extensivos |
| **Loop infinito no grafo** | Média | Alto | Limite de iterações, timeout global, detecção de ciclos |
| **Invalidação excessiva de cache** | Média | Médio | Granularidade fina na detecção de mudanças, só invalidar se dados relevantes mudarem |
| **LangGraph.js bugs em produção** | Média | Alto | Manter v1 como fallback, testar extensivamente em staging |
| **PostgresSaver incompatível com Supabase** | Baixa | Alto | Testar em ambiente isolado, ter plano B com MemorySaver |
| **Overhead de performance** | Média | Médio | Classificação de intenção adiciona latência; cache agressivo, modelo rápido |
| **Simulação de cenários complexa** | Alta | Médio | MVP sem simulação, adicionar em fase posterior |
| **Usuário não entende que pode iterar** | Média | Baixo | UX clara, mensagens que convidam a continuar |
| **Estado muito grande no checkpoint** | Baixa | Médio | Limpar dados antigos, não persistir resultados de busca completos |

---

## 9. Critérios de Sucesso

### 9.1 Técnicos
- [ ] Classificação de intenção com acurácia > 90%
- [ ] Tempo de resposta do orquestrador < 3s
- [ ] Workflow completo (coleta → recomendação) executa em < 90s
- [ ] Zero erros de tipo TypeScript
- [ ] Cobertura de testes > 80%
- [ ] Traces completos no LangSmith

### 9.2 Funcionais
- [ ] Loop de conversa funciona sem interrupções indesejadas
- [ ] Usuário consegue adicionar dependentes após recomendação
- [ ] Usuário consegue simular cenários "e se"
- [ ] Invalidação de cache funciona corretamente
- [ ] Recomendações têm mesma qualidade do v1
- [ ] Conversa retomável após desconexão

### 9.3 Experiência do Usuário
- [ ] Conversa flui naturalmente
- [ ] Agente entende intenções em linguagem natural
- [ ] Usuário sabe que pode continuar iterando
- [ ] Finalização é clara e controlada pelo usuário

### 9.4 Operacionais
- [ ] Deploy em produção sem downtime do v1
- [ ] Documentação completa
- [ ] Runbook de troubleshooting
- [ ] Monitoramento de classificação de intenções
- [ ] Alertas para loops excessivos

---

## 10. Referências

### 10.1 Documentação
- [LangGraph.js Official](https://github.com/langchain-ai/langgraphjs)
- [LangGraph.js Docs](https://langchain-ai.github.io/langgraphjs/)
- [@langchain/langgraph-checkpoint-postgres](https://www.npmjs.com/package/@langchain/langgraph-checkpoint-postgres)

### 10.2 Exemplos de Código
- [langgraphjs-examples](https://github.com/bracesproul/langgraphjs-examples)
- [fullstack-langgraph-nextjs-agent](https://github.com/IBJunior/fullstack-langgraph-nextjs-agent)
- [agents-from-scratch-ts](https://github.com/langchain-ai/agents-from-scratch-ts)

### 10.3 Projeto Atual
- PRD Original: `.taskmaster/docs/health-plan-agent-prd.md`
- Testes Frontend: `.taskmaster/docs/health-plan-agent-frontend-tests.md`
- Código v1: `lib/tools/health-plan/`

---

## 11. Aprovações

| Papel | Nome | Data | Assinatura |
|-------|------|------|------------|
| Product Owner | | | |
| Tech Lead | | | |
| QA Lead | | | |

---

## Changelog

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2025-12-03 | Claude Code | Versão inicial (pipeline sequencial de 5 steps) |
| 2.0 | 2025-12-03 | Claude Code | **Reescrita completa**: Mudança de pipeline para agente conversacional. Novo modelo com loop contínuo, capacidades sob demanda, invalidação de cache, simulação de cenários, e finalização explícita. 16 RFs atualizados. |
| 2.1 | 2025-12-03 | Claude Code | **Adicionado requisitos Vercel Pro**: RNF-006 (compatibilidade Vercel), seção 6.4 (configuração de deploy), connection pooling via PgBouncer, cold start expectations, versão fixa @langchain/openai@0.5.10, LANGCHAIN_CALLBACKS_BACKGROUND=false. |
| 2.2 | 2025-12-03 | Claude Code | **Reorganização para testabilidade incremental**: Seção 7 reescrita com filosofia "Endpoint First, Features Later". Frontend integration movido para Fase 1. Cada fase tem checkpoint QA específico. Adicionada Matriz de Testabilidade e milestones com validação QA. 12 fases (antes 11) com foco em permitir testes pelo frontend desde o início. |
| 2.3 | 2025-12-03 | Claude Code | **LangSmith para QA**: Nova seção "LangSmith para QA - Guia de Análise por Fase" com detalhes do que QA pode verificar em cada fase via LangSmith. Inclui: spans esperados por fase, checklists de verificação, métricas com thresholds, tags de filtro úteis, e 5 dashboards sugeridos. |
| 2.4 | 2025-12-03 | Claude Code | **Fase 2 Implementada**: Checkpointer integrado no endpoint com modo degradado (try/catch). Criado `cache-invalidation.ts` com INVALIDATION_RULES. 35 testes unitários. Headers de debug adicionados (X-Checkpointer-Enabled, X-Last-Intent). Polyfills para Jest (TextEncoder, ReadableStream). Matriz de Testabilidade atualizada com coluna Status. |
| 2.5 | 2025-12-03 | Claude Code | **Fase 3 Implementada**: Classificador de intenções via GPT-4o com 9 tipos de intenção e 25 few-shot examples. Arquivos criados em `lib/agents/health-plan-v2/intent/`. Extração automática de dados (idade, cidade, dependentes). Integração no orchestrator com merge incremental de clientInfo. Debug metadata no stream (`__DEBUG__...`) e headers HTTP. Tracing via tags nativas do LangChain (não `@traceable` devido a conflito com LangGraph). Latência média: 1.4s (target <2s). |
| 2.6 | 2025-12-04 | Claude Code | **Fase 4 Implementada**: Router com lógica de redirecionamento (verifica pré-requisitos). Workflow LangGraph com StateGraph e conditional edges. Arquitetura de respostas definida: orchestrator apenas classifica, capacidades geram respostas. Bug fixes: duplicação de mensagens (route.ts passa só última msg) e AIMessage persistida pelas capacidades. Proteção contra loop infinito (MAX_LOOP_ITERATIONS=10). |

