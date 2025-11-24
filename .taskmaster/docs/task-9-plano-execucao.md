# Plano de Execução - Tarefa #9: generateRecommendation

> **Data de Criação:** 2025-11-24
> **Status:** Pendente
> **Responsável:** Claude Code

---

## 📋 Visão Geral

| Campo | Valor |
|-------|-------|
| **Tarefa** | Desenvolver ferramenta generateRecommendation |
| **ID** | 9 |
| **Arquivo Principal** | `/lib/tools/health-plan/generate-recommendation.ts` |
| **Referência PRD** | RF-007 - Ferramenta de Geração de Recomendação |
| **Dependência** | Task #8 (concluída - integração ERP) |
| **Complexidade** | 5 |
| **Subtarefas** | 5 |

---

## 🎯 Objetivo

Implementar geração de recomendação humanizada usando GPT-4o que produz:
- Recomendação principal + justificativa
- Alternativas (econômica/premium)
- Comparativo top 3 em tabela Markdown
- Alertas importantes (carências, exclusões)
- Próximos passos

**Configurações:**
- Temperatura: 0.1 (baixa para consistência)
- Linguagem: empática e clara
- Termos técnicos: explicados automaticamente

---

## 🔄 Fluxo de Execução

### **ETAPA 0: Preparação**

```bash
task-master set-status --id=9 --status=in-progress
```

**Verificações prévias:**
- [ ] Task #8 (ERP Integration) está concluída
- [ ] Types em `lib/tools/health-plan/types.ts` estão atualizados
- [ ] `RankedAnalysis` da Task #7 está disponível

---

### **ETAPA 1: Subtarefa 9.1 - Template de Recomendação**

| Campo | Valor |
|-------|-------|
| **ID** | 9.1 |
| **Título** | Projetar template de recomendação humanizada com seções estruturadas |
| **Dependências** | Nenhuma |
| **Status** | Pendente |

#### Objetivo
Definir estrutura do template de recomendação com seções claras: introdução empática, recomendação principal, justificativa, alternativas, comparativo, alertas e próximos passos em formato Markdown.

#### Ações
1. Criar arquivo `lib/tools/health-plan/templates/recommendation-template.ts`
2. Definir interfaces TypeScript para cada seção:
   - `RecommendationIntro` - Introdução empática
   - `MainRecommendation` - Plano principal + justificativa
   - `AlternativesSection` - Opções econômica/premium
   - `ComparisonTable` - Tabela comparativa top 3
   - `AlertsSection` - Carências e exclusões
   - `NextStepsSection` - Próximos passos acionáveis
3. Criar funções helper de formatação Markdown:
   - `formatCurrency()` - Formata valores em R$
   - `formatDate()` - Formata datas
   - `formatPercentage()` - Formata percentuais

#### Estratégia de Testes
- Validar estrutura do template com dados mock
- Verificar todos os placeholders estão definidos
- Testar renderização Markdown
- Confirmar formatação de valores monetários e datas

#### Atualização Task Master
```bash
task-master set-status --id=9.1 --status=in-progress
# ... após implementação ...
task-master update-subtask --id=9.1 --prompt="Template estruturado criado com interfaces para todas seções. Helpers de formatação Markdown implementados."
task-master set-status --id=9.1 --status=done
```

---

### **ETAPA 2: Subtarefa 9.2 - Recomendação Principal**

| Campo | Valor |
|-------|-------|
| **ID** | 9.2 |
| **Título** | Implementar geração da recomendação principal com justificativa empática |
| **Dependências** | 9.1 |
| **Status** | Pendente |

#### Objetivo
Desenvolver função que usa GPT-4o para gerar recomendação principal do plano mais adequado com justificativa humanizada e empática baseada no perfil do cliente.

#### Ações
1. Criar schema Zod em `lib/tools/health-plan/schemas/recommendation-schemas.ts`:
   - `MainRecommendationResponseSchema`
   - Validação de campos obrigatórios
2. Criar prompt em `lib/tools/health-plan/prompts/recommendation-prompts.ts`:
   - `createMainRecommendationPrompt()`
   - Instruções para tom empático
   - Diretrizes para explicar termos técnicos
3. Implementar função `generateMainRecommendation()`:
   - Input: `RankedAnalysis` (da Task #7) + `ERPPriceResult` (da Task #8)
   - Configuração GPT-4o: temperatura 0.1, max_tokens 1500
   - Output: Texto humanizado com justificativa estruturada
4. Implementar tradução automática de termos técnicos:
   - Glossário de termos de planos de saúde
   - Inserção de explicações entre parênteses

#### Estratégia de Testes
- Testar com 3+ perfis diferentes (jovem solteiro, família com crianças, idoso)
- Validar tom empático da resposta
- Verificar explicação de termos técnicos
- Confirmar temperatura baixa gera respostas consistentes
- Validar schema Zod

#### Atualização Task Master
```bash
task-master set-status --id=9.2 --status=in-progress
# ... após implementação ...
task-master update-subtask --id=9.2 --prompt="Função generateMainRecommendation implementada com GPT-4o. Schema Zod validando output. Termos técnicos explicados automaticamente."
task-master set-status --id=9.2 --status=done
```

---

### **ETAPA 3: Subtarefa 9.3 - Alternativas Econômica/Premium**

| Campo | Valor |
|-------|-------|
| **ID** | 9.3 |
| **Título** | Desenvolver geração de alternativas econômica e premium |
| **Dependências** | 9.1 |
| **Status** | Pendente |

#### Objetivo
Implementar função que gera sugestões de alternativas ao plano principal, incluindo opção econômica (menor custo) e premium (maior cobertura).

#### Ações
1. Implementar função `generateAlternatives()`:
   - Input: `RankedAnalysis` com campos `budget` e `premium`
   - Identificar opção econômica (maior `score.breakdown.budget`)
   - Identificar opção premium (maior `score.breakdown.coverage`)
2. Gerar descrições comparativas com plano principal:
   - Diferença de preço
   - Diferença de cobertura
   - Trade-offs principais
3. Tratar casos especiais:
   - Quando não há alternativa econômica viável
   - Quando não há alternativa premium diferente do recomendado
   - Quando budget === premium === recommended

#### Estratégia de Testes
- Testar identificação de alternativas econômica/premium
- Validar descrições são claras e objetivas
- Verificar comparação com plano principal
- Testar casos sem alternativas viáveis
- Confirmar formato Markdown

#### Atualização Task Master
```bash
task-master set-status --id=9.3 --status=in-progress
# ... após implementação ...
task-master update-subtask --id=9.3 --prompt="Alternativas econômica/premium implementadas. Comparação com plano principal clara. Trade-offs destacados."
task-master set-status --id=9.3 --status=done
```

---

### **ETAPA 4: Subtarefa 9.4 - Tabela Comparativa Markdown**

| Campo | Valor |
|-------|-------|
| **ID** | 9.4 |
| **Título** | Criar comparativo top 3 em tabela Markdown formatada |
| **Dependências** | 9.1 |
| **Status** | Pendente |

#### Objetivo
Implementar função que gera tabela comparativa em Markdown dos 3 melhores planos, destacando características principais, coberturas, valores e diferenciais.

#### Ações
1. Implementar função `generateComparisonTable()`:
   - Input: `rankedPlans` (top 3) + `badges`
   - Colunas da tabela:
     - Plano (nome + badge)
     - Score (X/100)
     - Preço (R$ X.XXX,XX/mês)
     - Cobertura (score breakdown)
     - Rede (score breakdown)
     - Destaque (principal diferencial)
2. Formatação visual:
   - Valores monetários: `R$ 1.234,56`
   - Ícones visuais: ✅ (bom) ⚠️ (atenção) ❌ (ruim)
   - Badges: 💰 Econômico, ⭐ Recomendado, 💎 Premium, 🏆 Melhor Custo-Benefício
3. Tratar edge cases:
   - Menos de 3 planos disponíveis
   - Planos sem preço (aguardando ERP)
   - Empates de score

#### Estratégia de Testes
- Testar renderização da tabela Markdown em diferentes viewers
- Validar formatação de valores monetários
- Verificar alinhamento de colunas
- Confirmar ícones aparecem corretamente
- Testar com menos de 3 planos

#### Atualização Task Master
```bash
task-master set-status --id=9.4 --status=in-progress
# ... após implementação ...
task-master update-subtask --id=9.4 --prompt="Tabela comparativa Markdown implementada. Formatação de valores, ícones e badges funcionando. Edge cases tratados."
task-master set-status --id=9.4 --status=done
```

---

### **ETAPA 5: Subtarefa 9.5 - Próximos Passos e Alertas**

| Campo | Valor |
|-------|-------|
| **ID** | 9.5 |
| **Título** | Implementar geração de próximos passos e alertas importantes |
| **Dependências** | 9.1, 9.2, 9.3, 9.4 |
| **Status** | Pendente |

#### Objetivo
Desenvolver função que gera seção de próximos passos acionáveis e alertas críticos sobre carências, exclusões e limitações em linguagem clara e acessível.

#### Ações
1. Implementar função `generateAlertsSection()`:
   - Input: `criticalAlerts.byUrgency` do `RankedAnalysis`
   - Priorização: crítico > importante > informativo
   - Linguagem clara e acessível
   - Explicar impacto de cada alerta no perfil do cliente
   - Formatação visual com ícones: 🚨 (crítico) ⚠️ (importante) ℹ️ (info)
2. Implementar função `generateNextSteps()`:
   - Checklist acionável de próximos passos:
     - [ ] Verificar documentação necessária
     - [ ] Agendar contato com corretor/operadora
     - [ ] Preparar documentos pessoais
     - [ ] Avaliar período de carências
   - Documentos necessários para contratação
   - Timeline estimado do processo
3. Criar função orquestradora `generateRecommendation()`:
   - Combina todas as seções na ordem correta
   - Estrutura final do output Markdown:
     1. Introdução empática
     2. Recomendação principal
     3. Alternativas
     4. Tabela comparativa
     5. Alertas importantes
     6. Próximos passos
   - Adiciona metadata (timestamp, versão)
   - Retorna `GenerateRecommendationResult`

#### Estratégia de Testes
- Testar identificação de alertas críticos relevantes ao perfil
- Validar clareza da linguagem nos alertas
- Verificar checklist de próximos passos é acionável
- Testar integração de todas seções no output final
- Validar output Markdown completo

#### Atualização Task Master
```bash
task-master set-status --id=9.5 --status=in-progress
# ... após implementação ...
task-master update-subtask --id=9.5 --prompt="Alertas e próximos passos implementados. Função principal generateRecommendation orquestra todas seções. Output Markdown completo validado."
task-master set-status --id=9.5 --status=done
```

---

## 🧪 Estratégia de Testes

### Arquivo de Testes
`lib/tools/health-plan/__tests__/generate-recommendation.test.ts`

### Testes Unitários
| Teste | Descrição |
|-------|-----------|
| Template Rendering | Renderização do template com dados mock |
| Currency Formatting | Formatação de valores monetários (R$) |
| Table Generation | Geração de tabela Markdown |
| Alert Prioritization | Priorização de alertas por urgência |
| Next Steps Generation | Geração de checklist de próximos passos |

### Testes de Integração
| Teste | Descrição |
|-------|-----------|
| Full Flow | Fluxo completo com `RankedAnalysis` mock |
| Profile: Young Single | Perfil jovem solteiro |
| Profile: Family | Perfil família com crianças |
| Profile: Elderly | Perfil idoso |
| No Alternatives | Caso sem alternativas viáveis |
| Critical Alerts | Caso com alertas críticos |

### Cobertura Esperada
- **Target:** > 85% de cobertura
- **Foco:** Funções de geração e formatação

---

## 📁 Estrutura de Arquivos

```
lib/tools/health-plan/
├── generate-recommendation.ts           # Função principal exportada
├── templates/
│   └── recommendation-template.ts       # Templates e formatadores
├── prompts/
│   ├── compatibility-prompts.ts         # (existente)
│   └── recommendation-prompts.ts        # Prompts para recomendação (NOVO)
├── schemas/
│   ├── client-info-schema.ts            # (existente)
│   ├── compatibility-schemas.ts         # (existente)
│   └── recommendation-schemas.ts        # Schemas Zod (NOVO)
└── __tests__/
    ├── extract-client-info.test.ts      # (existente)
    ├── search-health-plans.test.ts      # (existente)
    ├── analyze-compatibility.test.ts    # (existente)
    └── generate-recommendation.test.ts  # Testes da Task #9 (NOVO)
```

---

## 📤 Exports Esperados

```typescript
// lib/tools/health-plan/generate-recommendation.ts

export {
  // Função principal
  generateRecommendation,

  // Funções auxiliares
  generateMainRecommendation,
  generateAlternatives,
  generateComparisonTable,
  generateAlertsSection,
  generateNextSteps,

  // Types
  type GenerateRecommendationParams,
  type GenerateRecommendationResult,
  type RecommendationSection,
}
```

---

## ⏱️ Comandos Task Master (Resumo)

### Início da Tarefa
```bash
task-master set-status --id=9 --status=in-progress
```

### Durante Execução (para cada subtarefa)
```bash
# Iniciar subtarefa
task-master set-status --id=9.X --status=in-progress

# Registrar progresso
task-master update-subtask --id=9.X --prompt="<notas de implementação>"

# Concluir subtarefa
task-master set-status --id=9.X --status=done
```

### Conclusão da Tarefa
```bash
task-master set-status --id=9 --status=done
```

---

## ✅ Checklist de Conclusão

- [ ] Subtarefa 9.1 concluída
- [ ] Subtarefa 9.2 concluída
- [ ] Subtarefa 9.3 concluída
- [ ] Subtarefa 9.4 concluída
- [ ] Subtarefa 9.5 concluída
- [ ] Testes unitários passando
- [ ] Testes de integração passando
- [ ] Cobertura > 85%
- [ ] Code review realizado
- [ ] Documentação atualizada
- [ ] Task #9 marcada como done
- [ ] Relatório de conclusão criado

---

## 🔗 Referências

- **PRD:** [health-plan-agent-prd.md](.taskmaster/docs/health-plan-agent-prd.md) - RF-007
- **Task #7:** analyze-compatibility.ts (fonte de `RankedAnalysis`)
- **Task #8:** fetch-erp-prices.ts (fonte de `ERPPriceResult`)
- **Task #10:** Orquestrador multi-step (dependente desta tarefa)

---

## 📝 Notas Adicionais

1. **Temperatura GPT-4o:** Usar 0.1 para consistência nas respostas
2. **Linguagem:** Sempre empática, evitar jargões sem explicação
3. **Markdown:** Validar renderização em diferentes viewers
4. **Performance:** Minimizar chamadas à API OpenAI agrupando informações
5. **Error Handling:** Fallbacks graceful se GPT-4o falhar

---

*Documento gerado automaticamente pelo Claude Code em 2025-11-24*
