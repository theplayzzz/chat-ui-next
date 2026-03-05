# Itens Pendentes - Consolidado

**Data:** 2026-03-04
**Baseado em:** Análise cruzada de PRDs, documents e código-fonte
**Objetivo:** Listar TUDO que falta para completar o Health Plan Agent v2

---

## Resumo Executivo

| Área | Itens Pendentes | Prioridade Geral |
|------|----------------|------------------|
| **Testes Retroativos (Fases 1-7)** | **13 itens** | **Alta** |
| Fase 8: Preços ERP | 4 itens | Média |
| Fase 9: Conversa + Finalização | 8 itens | Alta |
| Fase 10: Simulação de Cenários | 4 itens | Baixa |
| Fase 11: Polish + Testes E2E | 6 itens | Alta |
| Fase 12: Deploy + Monitoramento | 5 itens | Alta |
| Agentic RAG (6D pendências) | 3 itens | Baixa |
| QA Manual (qa-tests) | 2 itens | Média |
| Subtask órfã (Task 13) | 1 item | Média |
| **TOTAL** | **46 itens** | |

---

## TESTES RETROATIVOS — Features sem Cobertura (Fases 1-7)

**Manual completo:** `manual-testes-retroativos.md`
**Estado atual:** 10 testes existentes, 13 gaps identificados
**Meta:** >80% cobertura em `lib/agents/health-plan-v2/`

| # | Item | Arquivo sem Teste | Prioridade |
|---|------|-------------------|-----------|
| T1 | Intent Classifier | `intent/intent-classifier.ts` | Alta |
| T2 | Search Plans capability | `nodes/capabilities/search-plans.ts` | Alta |
| T3 | Analyze Compatibility | `nodes/capabilities/analyze-compatibility.ts` | Alta |
| T4 | Generate Recommendation | `nodes/capabilities/generate-recommendation.ts` | Alta |
| T5 | Fetch Prices stub | `nodes/capabilities/fetch-prices.ts` | Baixa |
| T6 | End Conversation stub | `nodes/capabilities/end-conversation.ts` | Baixa |
| T7 | Respond to User stub | `nodes/capabilities/respond-to-user.ts` | Baixa |
| T8 | Grade Documents | `nodes/rag/grade-documents.ts` | Alta |
| T9 | Retrieve Simple | `nodes/rag/retrieve-simple.ts` | Alta |
| T10 | API Route v2 | `app/api/chat/health-plan-agent-v2/route.ts` | Alta |
| T11 | Ampliar testes: Orchestrator | `nodes/orchestrator.ts` | Media |
| T12 | Ampliar testes: Router | `nodes/router.ts` | Media |
| T13 | Manual de Testes Retroativos | `.taskmaster/docs/manual-testes-retroativos.md` | - |

---

## FASE 8: Preços ERP (fetchPrices)

**PRD:** `health-plan-agent-v2-langgraph-prd.md` — Fase 8 (linha 986)
**Task:** #26 (status: pending)
**Requisito Funcional:** RF-006 (Preços Opcionais)
**Estado atual:** Capability `fetch-prices.ts` existe como STUB com TODO

| # | Item | Descrição | Arquivo(s) Afetado(s) |
|---|------|-----------|----------------------|
| 1 | Integrar ERPClient v1 na capability v2 | Conectar o `ERPClient` existente (`lib/clients/erp-client.ts`) e `fetchERPPrices` (`lib/tools/health-plan/fetch-erp-prices.ts`) dentro da capability `fetch-prices.ts` do agente v2. Ler config ERP do workspace, chamar API, retornar preços. | `lib/agents/health-plan-v2/nodes/capabilities/fetch-prices.ts` |
| 2 | Integrar cache ERP existente | Usar o `ERPPriceCache` singleton (`lib/cache/erp-price-cache.ts`) para cache de preços com TTL configurável. Verificar cache antes de chamar API. | `lib/agents/health-plan-v2/nodes/capabilities/fetch-prices.ts` |
| 3 | Implementar graceful degradation | Timeout de 10s, fallback para cache stale (24h), fallback para mensagem de estimativa. Mensagem clara ao usuário sobre a fonte dos preços (real vs estimativa). | `lib/agents/health-plan-v2/nodes/capabilities/fetch-prices.ts` |
| 4 | Mostrar preços na recomendação | Quando `erpPrices` estiver disponível no state, a capability `generateRecommendation` deve incluir preços reais na resposta humanizada. | `lib/agents/health-plan-v2/nodes/capabilities/generate-recommendation.ts` |

---

## FASE 9: Conversa Geral + Finalização

**PRD:** `health-plan-agent-v2-langgraph-prd.md` — Fase 9 (linha 996)
**Task:** #27 (status: in-progress, subtasks todas pending)
**Requisitos Funcionais:** RF-008 (Conversa Geral), RF-011 (Finalização Explícita)
**Estado atual:** `respondToUser` e `endConversation` são STUBs; `humanizeResponse` não existe

| # | Item | Descrição | Arquivo(s) Afetado(s) |
|---|------|-----------|----------------------|
| 5 | Criar capability `humanizeResponse` | Nova capability com GPT-5-mini que lê o estado completo (clientInfo, ragAnalysisContext, collectionAnalyses, etc.) e gera respostas humanizadas em vez de templates. Structured output com fallback. Metadata LangSmith. | `lib/agents/health-plan-v2/nodes/capabilities/humanize-response.ts` (CRIAR) |
| 6 | Integrar humanizeResponse nas capabilities existentes | As capabilities `update-client-info`, `search-plans` e `generate-recommendation` atualmente retornam mensagens template/hardcoded. Integrar `humanizeResponse` como camada de polimento para gerar respostas naturais e contextuais. | `update-client-info.ts`, `search-plans.ts`, `generate-recommendation.ts` |
| 7 | Implementar `respondToUser` com LLM contextual | Substituir a resposta genérica atual por chamada GPT-5-mini que usa o contexto completo: `ragAnalysisContext` (quando disponível), `clientInfo`, `collectionAnalyses`, e histórico de mensagens. Deve responder perguntas educativas sobre termos técnicos (coparticipação, carência, etc.). | `lib/agents/health-plan-v2/nodes/capabilities/respond-to-user.ts` |
| 8 | Implementar `endConversation` com resumo + auditoria | Gerar resumo personalizado da conversa via LLM. Salvar registro completo em `client_recommendations` para auditoria LGPD (conecta com Task 13.3). Marcar `isConversationActive = false`. | `lib/agents/health-plan-v2/nodes/capabilities/end-conversation.ts` |
| 9 | Adicionar glossário de termos técnicos | Quando `respondToUser` detecta pergunta sobre termo técnico, explicar de forma educativa. Base: glossário já existente em `lib/tools/health-plan/templates/recommendation-template.ts` (10 termos: carência, coparticipação, DCP, CPP, etc.). | `respond-to-user.ts` |
| 10 | Registrar nós no workflow | Adicionar `humanizeResponse` como nó no StateGraph se necessário. Garantir que router roteia corretamente para `respondToUser` e `endConversation`. | `workflow/workflow.ts`, `nodes/router.ts` |
| 11 | Testes de integração para fluxo humanizado | Testes cobrindo: fluxo completo com humanizeResponse, auditoria em endConversation, respostas educativas em respondToUser. | `__tests__/` (CRIAR) |
| 12 | Validar os 2 ajustes críticos do Task 27 | (a) Respostas de capabilities devem ser humanizadas, não template. (b) endConversation deve salvar audit. Validar ambos end-to-end. | Diversos |

---

## FASE 10: Simulação de Cenários

**PRD:** `health-plan-agent-v2-langgraph-prd.md` — Fase 10 (linha 1023)
**Task:** #28 (status: pending)
**Requisito Funcional:** RF-009 (Simulação de Cenários)
**Estado atual:** Completamente inexistente no código

| # | Item | Descrição | Arquivo(s) Afetado(s) |
|---|------|-----------|----------------------|
| 13 | Criar capability `simulateScenario` com fork de estado | Implementar lógica de clonagem do state atual. Aplicar mudanças hipotéticas (ex: adicionar/remover dependente, alterar orçamento) sem alterar o estado real. | `lib/agents/health-plan-v2/nodes/capabilities/simulate-scenario.ts` (CRIAR) |
| 14 | Recalcular pipeline no cenário simulado | Após fork, reexecutar searchPlans + gradeByCollection + generateRecommendation no estado simulado para mostrar impacto das mudanças. | `simulate-scenario.ts` |
| 15 | Mecanismo de confirmar/descartar simulação | Permitir que o usuário diga "confirmar" (aplica mudanças ao estado real) ou "descartar" (volta ao estado anterior). Usar `pendingAction` no state. | `simulate-scenario.ts`, `router.ts` |
| 16 | Comparação antes/depois | Gerar resposta que mostra lado a lado: estado atual vs estado simulado (planos encontrados, preços, recomendação). | `simulate-scenario.ts` |

---

## FASE 11: Polish + Testes E2E

**PRD:** `health-plan-agent-v2-langgraph-prd.md` — Fase 11 (linha 1033)
**Task:** #29 (status: pending)
**Critérios de Sucesso:** Seção 9 do PRD (linha 1214)
**Estado atual:** Nenhum teste E2E do agente v2 existe

| # | Item | Descrição | Arquivo(s) Afetado(s) |
|---|------|-----------|----------------------|
| 17 | Testes E2E: Fluxo happy path | Testar fluxo completo: saudação → coleta de dados → busca → recomendação humanizada. Validar que todas as capabilities executam na ordem correta. | `__tests__/e2e/` (CRIAR) |
| 18 | Testes E2E: Fluxo iterativo | Testar: coleta → busca → alterar dados → nova busca → nova recomendação. Validar cache invalidation em cada etapa. | `__tests__/e2e/` |
| 19 | Testes E2E: Conversa geral + finalização | Testar: pergunta educativa → resposta contextual → finalização → resumo + audit salvo. | `__tests__/e2e/` |
| 20 | Testes E2E: Edge cases | Testar: mensagens vazias, dados inválidos (idade 200), timeout de ERP, loops excessivos, refresh mid-conversation. | `__tests__/e2e/` |
| 21 | Validar critérios de sucesso técnicos | Classificação de intenção >90% de acurácia. Orquestrador <3s. Workflow completo <90s. Cobertura de testes >80%. Zero erros TypeScript. | Medição + relatório |
| 22 | Ajustes de UX baseados em feedback QA | Incorporar feedback dos testes manuais (qa-tests-tasks-31-34.md). Corrigir bugs encontrados, ajustar prompts, melhorar mensagens. | Diversos |

---

## FASE 12: Deploy e Monitoramento

**PRD:** `health-plan-agent-v2-langgraph-prd.md` — Fase 12 (linha 1045)
**Task:** #30 (status: pending)
**Estado atual:** Não iniciado

| # | Item | Descrição | Arquivo(s) Afetado(s) |
|---|------|-----------|----------------------|
| 23 | Code review final | Revisão completa do código do agente v2. Verificar: segurança, performance, tipos TypeScript, tratamento de erros, logs. | Todo `lib/agents/health-plan-v2/` |
| 24 | Configurar variáveis de ambiente em produção | Configurar no Vercel: `DATABASE_URL_POOLER` (PgBouncer porta 6543), `LANGCHAIN_CALLBACKS_BACKGROUND=false`, API keys. Verificar que `maxDuration=300` está configurado. | Vercel Dashboard |
| 25 | Deploy staging + validação completa | Deploy em ambiente staging. Executar roteiro de testes E2E. Validar persistência de estado, cache invalidation, traces LangSmith. | Infraestrutura |
| 26 | Deploy produção | Deploy em produção com rollback plan. Manter v1 como fallback (`/api/chat/health-plan-agent` inalterado). Zero downtime. | Infraestrutura |
| 27 | Validar monitoramento LangSmith em produção | Confirmar traces aparecendo. Validar dashboards (RAG Quality, RAG Performance, Agent Quality, Agent Performance). Configurar alertas para latência >90s, erros, loops excessivos. | LangSmith Dashboard |

---

## AGENTIC RAG — Pendências da Fase 6D

**PRD:** `agentic-rag-implementation-prd.md` — Fase 6D (linha 472)
**Task:** #34 (status: done, mas com pendências documentadas)
**Estado atual:** Framework de avaliação existe mas não está totalmente adaptado ao pivot arquitetural

| # | Item | Descrição | Arquivo(s) Afetado(s) |
|---|------|-----------|----------------------|
| 28 | Adaptar avaliadores para FileGradingResult | Os avaliadores em `rag-evaluation.ts` foram criados para a arquitetura original (chunk-based). Precisam ser atualizados para a arquitetura atual (file-based grading com `FileGradingResult`). | `lib/agents/health-plan-v2/monitoring/rag-evaluation.ts` |
| 29 | Atualizar dataset de testes para nova arquitetura | O dataset de 24 casos pode precisar de ajustes para refletir a saída `ragAnalysisContext` (texto) em vez de `searchResults[]` (JSON). | `lib/agents/health-plan-v2/monitoring/` |
| 30 | Testes de integração atualizados | Testes de integração do sub-grafo `searchPlansGraph` precisam cobrir o fluxo completo: initialize → retrieveByFile → gradeByFile → gradeByCollection → formatResults. | `__tests__/` |

---

## QA MANUAL — Cenários Não Validados

**Documento:** `qa-tests-tasks-31-34.md`
**Estado atual:** Plano de QA existe mas sem evidência de execução formal

| # | Item | Descrição | Referência |
|---|------|-----------|-----------|
| 31 | Executar testes QA do documento qa-tests-tasks-31-34 | 17 cenários de teste (31.1-34.5) + 5 testes extras. Incluem: verificações SQL, perfis difíceis, busca impossível, família grande, contradições, refresh, jornada completa do usuário. | `qa-tests-tasks-31-34.md` |
| 32 | Documentar resultados e bugs encontrados | Preencher o template de resultados do documento QA. Registrar bugs com severidade e reprodutibilidade. Decisão de aprovação/reprovação. | `qa-tests-tasks-31-34.md` |

---

## SUBTASK ÓRFÃ — Auditoria Automática

**Documento:** `task-13-execution-plan.md` — Subtask 13.3
**Task:** #13.3 (status: in-progress)
**Estado atual:** Parcialmente coberto — depende da implementação de `endConversation` (Fase 9, item #8)

| # | Item | Descrição | Arquivo(s) Afetado(s) |
|---|------|-----------|----------------------|
| 33 | Registro automático de recomendações em client_recommendations | Quando o agente gera uma recomendação final e o usuário finaliza a conversa, salvar automaticamente em `client_recommendations` com: client_info, recommended_item, reasoning, confidence_score, langsmith_run_id. Inclui anonimização LGPD. | `end-conversation.ts`, `db/` |

---

## Mapa de Dependências

```
Fase 8 (Preços ERP)     ← independente, pode ser feita a qualquer momento
       │
       ▼
Fase 9 (Conversa + Finalização)  ← depende logicamente de Fase 8
       │                            (fetchPrices deve estar pronto para
       │                             mostrar preços nas respostas)
       │
       ├── Item #33 (Subtask 13.3)  ← resolvida pelo item #8 (endConversation)
       │
       ▼
Fase 10 (Simulação)     ← depende de Fase 9
       │                    (humanizeResponse necessário para respostas do simulador)
       ▼
Fase 11 (Polish + E2E)  ← depende de todas as fases anteriores
       │
       ▼
Fase 12 (Deploy)        ← última fase, depende de Fase 11
```

---

## O Que Falta para Completar o PRD Principal

### Requisitos Funcionais (RFs) — Status de Implementação

| RF | Descrição | Status | Itens Pendentes |
|----|-----------|--------|-----------------|
| RF-001 | Orquestrador Conversacional | **Implementado** | — |
| RF-002 | Loop de Conversa Contínuo | **Implementado** | — |
| RF-003 | Coleta de Dados Reentrante | **Implementado** | — |
| RF-004 | Busca de Planos Sob Demanda | **Implementado** | — |
| RF-005 | Análise Reexecutável | **Parcial** | Coberto pelo grading por collection, mas `analyzeCompatibility` standalone não está na v2 |
| RF-006 | Preços Opcionais | **Stub** | Itens #1-4 |
| RF-007 | Recomendação Iterativa | **Parcial** | Falta salvar cada recomendação no audit log (item #8) |
| RF-008 | Conversa Geral | **Stub** | Itens #7, #9 |
| RF-009 | Simulação de Cenários | **Inexistente** | Itens #13-16 |
| RF-010 | Invalidação de Cache | **Implementado** | — |
| RF-011 | Finalização Explícita | **Stub** | Item #8 |
| RF-012 | Estado Persistente | **Implementado** | — |
| RF-013 | LangSmith Automático | **Implementado** | — |
| RF-014 | Endpoint API v2 | **Implementado** | — |
| RF-015 | Assistente no Frontend | **Implementado** | — |
| RF-016 | Coexistência v1/v2 | **Implementado** | — |

### Critérios de Sucesso (Seção 9 do PRD) — Status

| Critério | Meta | Status |
|----------|------|--------|
| Classificação de intenção | >90% acurácia | Precisa ser medido (item #21) |
| Tempo de resposta orquestrador | <3s | Precisa ser medido |
| Workflow completo | <90s | Precisa ser medido |
| Zero erros TypeScript | 0 erros | Validar com `npm run type-check` |
| Cobertura de testes | >80% | Precisa ser medido |
| Traces LangSmith | Completos | Implementado, validar em produção |
| Loop funciona sem interrupções | Funcional | Implementado |
| Adicionar dependentes pós-recomendação | Funcional | Implementado |
| Simulação "e se" | Funcional | Inexistente (item #13) |
| Conversa retomável após desconexão | Funcional | Implementado (checkpointer) |
| Deploy sem downtime do v1 | Zero downtime | Pendente (item #26) |
| Documentação completa | Existente | Parcial |
| Runbook de troubleshooting | Existente | Inexistente |

---

## Sugestões para Completar o PRD

Além dos 33 itens listados acima, considere adicionar ao PRD principal:

### 1. Runbook de Troubleshooting (Critério de Sucesso 9.4)
O PRD exige um "Runbook de troubleshooting" nos critérios operacionais, mas nenhum documento ou task cobre isso. Deveria incluir:
- Como diagnosticar classificação de intenção incorreta
- Como investigar loops excessivos
- Como limpar checkpoints corrompidos
- Como forçar invalidação de cache manual
- Procedimento de rollback v2 → v1

### 2. Monitoramento de Classificação de Intenções (Critério 9.4)
O PRD menciona "monitoramento de classificação de intenções" e "alertas para loops excessivos" como critérios operacionais. A infraestrutura de alertas existe (`lib/monitoring/alerts.ts`), mas não está conectada ao agente v2 em produção. Falta:
- Dashboard de acurácia de classificação por tipo de intenção
- Alerta quando taxa de fallback para "conversar" excede threshold

### 3. Plano de QA para Fases 8-12
O `qa-tests-tasks-31-34.md` cobre apenas Fases 6A-6D. Não existe plano de QA equivalente para as Fases 8-12. Deveria ser criado com cenários para:
- Preços ERP (com e sem ERP configurado)
- Respostas humanizadas vs template
- Finalização com auditoria
- Simulação de cenários
- Fluxos E2E completos

### 4. Documentação de Arquitetura Atualizada
O README do agente v2 existe mas pode estar desatualizado após o pivot do Agentic RAG. Deveria refletir:
- Fluxo atual completo (com gradeByCollection)
- Diferenças entre v1 e v2
- Como adicionar novas capabilities
- Configuração de ambiente para desenvolvimento

### 5. Estratégia de Migração v1 → v2
O PRD menciona coexistência (RF-016) mas não define quando/como desativar o v1. Considerar:
- Critérios para promoção do v2 como default
- Período de observação em produção antes de depreciar v1
- Plano de comunicação para usuários
