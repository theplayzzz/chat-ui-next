# Manual de Testes Futuros - Health Plan Agent v2 (Fases 8-12)

**Data:** 2026-03-05
**Versao:** 1.0
**Objetivo:** Plano de testes para funcionalidades a implementar nas Fases 8-12
**Referencia:** `qa-tests-tasks-31-34.md` (Fases 6A-6D), `health-plan-agent-v2-langgraph-prd.md`
**Pipeline de validacao:** Testes unitarios → Testes de integracao → Testes E2E → QA manual → LangSmith

---

## Fase 8: Precos ERP (fetchPrices)

**PRD:** Secao Fase 8 (linha 986) | **RF:** RF-006 (Precos Opcionais)

### Testes Unitarios

| # | Cenario | Tipo | Esperado |
|---|---------|------|----------|
| 8.1 | fetchPrices com ERP disponivel | Unit | Retorna precos reais do ERPClient |
| 8.2 | fetchPrices com cache hit | Unit | Retorna precos do ERPPriceCache sem chamar API |
| 8.3 | fetchPrices com timeout 10s | Unit | Fallback para cache stale (24h) |
| 8.4 | fetchPrices sem ERP configurado | Unit | Fallback para estimativa com mensagem clara |
| 8.5 | fetchPrices com cache stale expirado | Unit | Fallback para mensagem de estimativa |
| 8.6 | generateRecommendation com erpPrices | Unit | Markdown inclui precos reais |
| 8.7 | generateRecommendation sem erpPrices | Unit | Markdown sem precos (comportamento atual) |

### Validacao LangSmith

| Span | Metrica | Threshold |
|------|---------|-----------|
| `fetchPrices` | Latencia | <10s (timeout) |
| `fetchPrices` | metadata.cacheHit | true/false |
| `fetchPrices` | metadata.source | "erp" / "cache" / "estimate" |

### Checkpoint QA - Fase 8

- [ ] ERPClient conecta ao endpoint correto
- [ ] Cache TTL funciona (verificar com TTL curto em dev)
- [ ] Graceful degradation: ERP down → cache → estimativa
- [ ] Precos aparecem na recomendacao quando disponveis
- [ ] Mensagem clara ao usuario sobre fonte do preco

---

## Fase 9: Conversa Geral + Finalizacao

**PRD:** Secao Fase 9 (linha 996) | **RF:** RF-008, RF-011

### Testes Unitarios

| # | Cenario | Tipo | Esperado |
|---|---------|------|----------|
| 9.1 | humanizeResponse com contexto completo | Unit | Resposta humanizada (nao template) |
| 9.2 | humanizeResponse com structured output | Unit | JSON valido com fallback |
| 9.3 | humanizeResponse sem contexto | Unit | Resposta generica educada |
| 9.4 | respondToUser com LLM | Unit | Resposta contextual usando ragAnalysisContext |
| 9.5 | respondToUser com pergunta tecnica | Unit | Explica termo (coparticipacao, carencia) |
| 9.6 | respondToUser com glossario | Unit | Termos do glossario corretos |
| 9.7 | endConversation com resumo LLM | Unit | Resumo da conversa gerado |
| 9.8 | endConversation salva audit | Unit | Registro em client_recommendations |
| 9.9 | endConversation com LGPD | Unit | Dados anonimizados no audit |
| 9.10 | endConversation marca isConversationActive=false | Unit | State atualizado |
| 9.11 | workflow registra humanizeResponse | Unit | Node existe no StateGraph |
| 9.12 | router roteia para respondToUser | Unit | Intent conversar → respondToUser |
| 9.13 | router roteia para endConversation | Unit | Intent finalizar → endConversation |

### Testes de Integracao

| # | Cenario | Tipo | Esperado |
|---|---------|------|----------|
| 9.14 | Fluxo: busca → humanizeResponse → resposta | Integration | Resposta humanizada com dados reais |
| 9.15 | Fluxo: pergunta educativa → respondToUser | Integration | Resposta com glossario |
| 9.16 | Fluxo: finalizar → endConversation → audit | Integration | Resumo + audit salvo |

### Validacao LangSmith

| Span | Metrica | Threshold |
|------|---------|-----------|
| `humanizeResponse` | Latencia | <5s |
| `humanizeResponse` | input/output | Texto humanizado |
| `respondToUser` | Latencia | <5s |
| `respondToUser` | contexto | ragAnalysisContext presente |
| `endConversation` | audit metadata | langsmith_run_id presente |

### Checkpoint QA - Fase 9

- [ ] Respostas humanizadas (nao template) em todas capabilities
- [ ] Perguntas sobre termos tecnicos respondidas corretamente
- [ ] Glossario de 10 termos funciona (carencia, coparticipacao, DCP, CPP, etc.)
- [ ] endConversation gera resumo personalizado
- [ ] Audit salvo em client_recommendations com dados LGPD
- [ ] humanizeResponse registrado no workflow graph

---

## Fase 10: Simulacao de Cenarios

**PRD:** Secao Fase 10 (linha 1023) | **RF:** RF-009

### Testes Unitarios

| # | Cenario | Tipo | Esperado |
|---|---------|------|----------|
| 10.1 | simulateScenario clona state | Unit | State original inalterado |
| 10.2 | simulateScenario aplica mudanca | Unit | Fork state com mudanca aplicada |
| 10.3 | Recalcula pipeline no fork | Unit | searchPlans + grading reexecutados |
| 10.4 | Confirmar simulacao | Unit | State real atualizado com fork |
| 10.5 | Descartar simulacao | Unit | State real inalterado |
| 10.6 | Comparacao antes/depois | Unit | Resposta com diff visivel |
| 10.7 | pendingAction no state | Unit | Flag correta durante simulacao |

### Testes de Integracao

| # | Cenario | Tipo | Esperado |
|---|---------|------|----------|
| 10.8 | Fluxo: simular adicionar dependente | Integration | Nova busca com dependente, comparacao |
| 10.9 | Fluxo: simular mudar orcamento | Integration | Novos planos filtrados por orcamento |
| 10.10 | Fluxo: simular → confirmar → nova busca | Integration | State persistido com mudancas |
| 10.11 | Fluxo: simular → descartar → verificar | Integration | State original mantido |

### Cenarios QA - Perfis de Teste

Usar os mesmos perfis do `qa-tests-tasks-31-34.md`:

| Perfil | Simulacao | Esperado |
|--------|-----------|----------|
| Jovem solteiro SP R$400 | "E se eu incluisse minha namorada?" | Planos para casal, orcamento dividido |
| Familia 5 pessoas R$2000 | "E se o filho mais velho saisse?" | Recalculo 4 pessoas |
| Idoso diabetico R$600 | "E se eu aumentasse para R$1000?" | Mais opcoes aparecendo |

### Validacao LangSmith

| Span | Metrica |
|------|---------|
| `simulateScenario` | Fork state criado |
| `simulateScenario` | pipeline re-execution spans |
| `simulateScenario` | confirm/discard action |

### Checkpoint QA - Fase 10

- [ ] Simulacao nao altera state real ate confirmacao
- [ ] Comparacao antes/depois clara para o usuario
- [ ] Pipeline completo reexecutado no fork
- [ ] Confirmar aplica mudancas permanentemente
- [ ] Descartar volta ao estado anterior sem residuos

---

## Fase 11: Polish + Testes E2E

**PRD:** Secao Fase 11 (linha 1033) | **Criterios:** Secao 9 do PRD

### Testes E2E

| # | Cenario | Perfil | Fluxo Esperado |
|---|---------|--------|----------------|
| E2E-1 | Happy path completo | Jovem 28, solteiro, SP, R$400 | Coleta → busca → planos Einstein → analise → recomendacao |
| E2E-2 | Happy path familia | Casal 42+40, 3 filhos, SP, R$2000 | Coleta → busca → planos familia → recomendacao |
| E2E-3 | Perfil dificil | Idoso 70, diabetico, SP, R$600 | Coleta → busca → mencao condicao → recomendacao cautelosa |
| E2E-4 | Busca impossivel | Manaus, R$150, tratamento experimental | Coleta → busca → sem resultados → sugestoes alternativas |
| E2E-5 | Fluxo iterativo | Familia → remover dependente → nova busca | Cache invalidation → nova busca → novos resultados |
| E2E-6 | Alteracao de dados | 35 anos → "na verdade 55" → confirma 35 | Dados atualizados corretamente |
| E2E-7 | Conversa geral | "O que e coparticipacao?" | Resposta educativa do glossario |
| E2E-8 | Finalizacao com audit | "Obrigado, pode encerrar" | Resumo + audit salvo |
| E2E-9 | Simulacao | "E se eu incluisse esposa?" | Fork → recalculo → comparacao |
| E2E-10 | Edge: mensagem vazia | "" | Tratamento gracioso |
| E2E-11 | Edge: dados invalidos | idade=200, orcamento=-1 | Validacao + mensagem |
| E2E-12 | Edge: timeout ERP | ERP mock com delay 15s | Fallback ativado |
| E2E-13 | Edge: loop excessivo | 15+ mensagens sem progresso | Loop protection ativado |
| E2E-14 | Edge: refresh mid-conversation | F5 no meio do chat | Checkpointer restaura estado |

### Criterios de Sucesso (PRD Secao 9)

| Criterio | Meta | Como Medir |
|----------|------|------------|
| Classificacao de intencao | >90% acuracia | Dataset de 50+ mensagens classificadas manualmente |
| Tempo orquestrador | <3s | LangSmith span `orchestrator` p95 |
| Workflow completo | <90s | LangSmith trace total p95 |
| Zero erros TypeScript | 0 | `npm run type-check` |
| Cobertura testes | >80% | `npm test --coverage` |
| Traces LangSmith | 100% completos | Dashboard Agent Performance |
| Loop funcional | Sem interrupcoes | E2E-1 a E2E-9 passando |
| Conversa retomavel | Apos desconexao | E2E-14 passando |

### Validacao LangSmith - Dashboards

| Dashboard | Metricas a Verificar |
|-----------|---------------------|
| RAG Quality | Relevancia media, distribuicao high/medium/low |
| RAG Performance | Latencia retrieve, latencia grading, throughput |
| Agent Quality | Acuracia intent, qualidade recomendacao |
| Agent Performance | Latencia total, latencia por capability |

### Checkpoint QA - Fase 11

- [ ] Todos os E2E passando
- [ ] Criterios de sucesso do PRD atingidos
- [ ] 4 dashboards LangSmith configurados
- [ ] Feedback de QA incorporado
- [ ] Prompts ajustados com base em resultados

---

## Fase 12: Deploy + Monitoramento

**PRD:** Secao Fase 12 (linha 1045)

### Checklist Pre-Deploy

| # | Item | Verificacao |
|---|------|------------|
| 12.1 | Code review final | Seguranca, performance, tipos, erros |
| 12.2 | Build sem erros | `npm run build` passa |
| 12.3 | Type check | `npm run type-check` passa |
| 12.4 | Lint | `npm run lint` passa |
| 12.5 | Todos os testes | `npm test` passa |
| 12.6 | Cobertura >80% | `npm test --coverage` |

### Variaveis de Ambiente (Vercel)

| Variavel | Valor | Obrigatorio |
|----------|-------|-------------|
| DATABASE_URL_POOLER | PgBouncer :6543 | Sim |
| LANGCHAIN_CALLBACKS_BACKGROUND | false | Sim |
| OPENAI_API_KEY | (prod key) | Sim |
| LANGCHAIN_TRACING_V2 | true | Sim |
| LANGCHAIN_API_KEY | (prod key) | Sim |

### Testes Pos-Deploy

| # | Teste | Ambiente | Esperado |
|---|-------|----------|----------|
| 12.7 | Fluxo completo em staging | Staging | Happy path funciona |
| 12.8 | Persistencia de estado | Staging | Refresh mantem contexto |
| 12.9 | Coexistencia v1/v2 | Staging | Ambos endpoints respondem |
| 12.10 | Fluxo completo em producao | Producao | Happy path funciona |
| 12.11 | LangSmith traces em producao | Producao | Traces aparecendo |
| 12.12 | Alertas configurados | LangSmith | Latencia >90s, erros, loops >10 |

### Rollback Plan

1. v1 permanece inalterado em `/api/chat/health-plan-agent`
2. Em caso de falha critica: desativar assistente v2 no admin
3. Checkpoint: monitorar 24h apos deploy
4. Criterio de rollback: taxa de erro >5% ou latencia p95 >120s

### Checkpoint QA - Fase 12

- [ ] Deploy staging validado
- [ ] Deploy producao sem downtime
- [ ] v1 coexiste com v2
- [ ] LangSmith traces em producao
- [ ] Alertas configurados e testados
- [ ] Runbook de troubleshooting documentado

---

## Referencia: Cenarios do QA Existente (Fases 6A-6D)

Os cenarios abaixo ja estao documentados em `qa-tests-tasks-31-34.md` e devem ser reutilizados nos E2E:

| Cenario | Origem | Reutilizar em |
|---------|--------|---------------|
| Jovem solteiro SP R$400 | Teste 33.1 | E2E-1 |
| Familia 5 pessoas R$2000 | Teste 33.3 | E2E-2 |
| Idoso diabetico R$600 | Teste 32.1 | E2E-3 |
| Busca impossivel Manaus R$150 | Teste 32.2 | E2E-4 |
| Mudar de ideia | Teste 33.4 | E2E-5 |
| Informacoes contraditorias | Teste 33.5 | E2E-6 |
| Jornada completa | Teste 34.5 | E2E-1 (expandido) |
| Refresh mid-conversation | Teste Extra 5 | E2E-14 |

---

## Comandos de Execucao

```bash
# Testes unitarios Fase 8
npm test -- --testPathPattern=fetch-prices

# Testes unitarios Fase 9
npm test -- --testPathPattern="humanize-response|respond-to-user|end-conversation"

# Testes unitarios Fase 10
npm test -- --testPathPattern=simulate-scenario

# Testes E2E
npm test -- --testPathPattern=e2e

# Cobertura completa
npm test -- --coverage --testPathPattern=health-plan-v2

# Type check
npm run type-check

# Build
npm run build
```
