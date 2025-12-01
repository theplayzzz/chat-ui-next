# Bateria de Testes de Front-End - Sprint Health Plan Agent

**Data de Criação:** 2025-12-01
**Versão:** 1.0
**Status:** Aprovado para Execução

---

## 1. Resumo da Sprint

### Objetivo Geral
Desenvolver um **Agente de Recomendação de Planos de Saúde** integrado à aplicação Chatbot UI existente, que coleta informações do cliente de forma conversacional, busca planos compatíveis via RAG, analisa elegibilidade usando GPT-4o, consulta preços em tempo real via API ERP, e gera recomendações personalizadas com justificativas detalhadas — tudo isso disponível apenas para workspaces autorizados.

### Principais Funcionalidades/Fluxos Afetados
- **Chat Principal:** Novo assistente especializado com fluxo de 5 passos
- **Componentes Especializados:** Progress indicator, client info card, plan comparison, recommendation panel
- **Controle de Acesso:** Visibilidade condicional do assistente por workspace
- **Admin - Workspaces:** Interface para gerenciar workspaces autorizados
- **Admin - ERP Config:** CRUD de credenciais, dashboard de cache, histórico, monitoramento
- **Admin - Auditoria:** Consulta de histórico de recomendações, exportação CSV

---

## 2. Mapa de Cobertura (Tasks x Cenários de Teste)

| ID Cenário | Nome do Cenário | Objetivo | Tasks Relacionadas |
|------------|-----------------|----------|-------------------|
| FE-S01 | Acesso ao Assistente em Workspace Autorizado | Validar visibilidade e acesso ao assistente | 3, 11 |
| FE-S02 | Bloqueio de Acesso em Workspace Não Autorizado | Verificar restrição correta de acesso | 11 |
| FE-S03 | Fluxo Completo de Recomendação - Cliente Individual | Validar jornada de ponta a ponta para titular | 5, 6, 7, 8, 9, 10, 12 |
| FE-S04 | Fluxo Completo de Recomendação - Família | Validar jornada para titular com dependentes | 5, 6, 7, 8, 9, 10, 12 |
| FE-S05 | Progress Indicator - Navegação Visual | Validar atualização do indicador de progresso | 10, 12 |
| FE-S06 | Client Info Card - Atualização Dinâmica | Verificar exibição das informações coletadas | 5, 12 |
| FE-S07 | Plan Comparison - Tabela Comparativa | Validar tabela de planos e filtros | 7, 12 |
| FE-S08 | Recommendation Panel - Recomendação Final | Verificar renderização da recomendação | 9, 12 |
| FE-S09 | Admin - Gerenciamento de Workspaces Autorizados | Testar CRUD de permissões | 11 |
| FE-S10 | Admin - Configuração ERP - CRUD Completo | Testar formulário de configuração | 8, 17 |
| FE-S11 | Admin - Dashboard de Cache ERP | Validar métricas e ações de cache | 8, 17 |
| FE-S12 | Admin - Histórico de Chamadas API | Testar tabela com filtros e paginação | 17 |
| FE-S13 | Admin - Monitor de Saúde ERP | Validar indicadores de status | 17 |
| FE-S14 | Responsividade Mobile - Componentes Health Plan | Testar layouts em dispositivos móveis | 12 |
| FE-S15 | Tema Escuro/Claro - Todos Componentes | Validar alternância de temas | 12 |
| FE-S16 | Tratamento de Erros - Timeout e Falhas de API | Verificar mensagens e fallbacks | 8, 10 |
| FE-S17 | Admin - Auditoria - Consulta de Histórico | Testar interface de auditoria | 13 |

---

## 3. Cenários de Teste de Front-End (Detalhados)

---

### FE-S01: Acesso ao Assistente em Workspace Autorizado

**Objetivo:** Validar que o assistente "Agente de Planos de Saúde" aparece e é selecionável apenas em workspaces autorizados.

**Pré-condições:**
- [ ] Ambiente de homologação/staging
- [ ] Usuário logado em workspace **autorizado** para o assistente
- [ ] Assistente de Planos de Saúde configurado e associado ao workspace
- [ ] Pelo menos uma collection de tipo `health_plan` associada ao assistente

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Fazer login na aplicação com credenciais válidas | Login bem-sucedido | ⬜ |
| 2 | Navegar até o chat principal | Chat carrega corretamente | ⬜ |
| 3 | Clicar no seletor de assistentes (Assistant Picker) | Lista de assistentes aparece | ⬜ |
| 4 | Localizar o assistente "Agente de Planos de Saúde" na lista | Assistente aparece na lista | ⬜ |
| 5 | Observar se há badge identificador "Health Plan" com ícone de coração | Badge verde/destaque visual com ícone `IconHeartbeat` | ⬜ |
| 6 | Selecionar o assistente | Seleção bem-sucedida sem erros | ⬜ |
| 7 | Verificar se o chat é iniciado com o assistente selecionado | Chat carrega com assistente ativo | ⬜ |

**Critério de Aceitação:**
O assistente é visível, tem identificação visual clara, e pode ser selecionado sem erros.

**Tasks Relacionadas:** 3, 11

**Observações:**
- Verificar no console do navegador se não há erros JavaScript
- Badge deve seguir design system existente

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S02: Bloqueio de Acesso em Workspace Não Autorizado

**Objetivo:** Verificar que o assistente de planos de saúde não aparece e tentativas de acesso são bloqueadas em workspaces não autorizados.

**Pré-condições:**
- [ ] Ambiente de homologação/staging
- [ ] Usuário logado em workspace **não autorizado** para o assistente
- [ ] Assistente configurado mas não associado a este workspace

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Fazer login com credenciais válidas em workspace não autorizado | Login bem-sucedido | ⬜ |
| 2 | Navegar até o chat principal | Chat carrega | ⬜ |
| 3 | Abrir o seletor de assistentes | Lista aparece | ⬜ |
| 4 | Verificar se o assistente "Agente de Planos de Saúde" está ausente da lista | Assistente **não aparece** na lista | ⬜ |
| 5 | (Opcional) Tentar acessar diretamente via URL manipulada ou API | Erro 403 ou mensagem de acesso negado | ⬜ |

**Critério de Aceitação:**
O assistente não é visível nem acessível em workspaces não autorizados.

**Tasks Relacionadas:** 11

**Observações:**
- Testar também se a mensagem de restrição (`WorkspaceRestrictionNotice`) é exibida corretamente caso usuário tente acessar por outro meio

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S03: Fluxo Completo de Recomendação - Cliente Individual

**Objetivo:** Validar o fluxo de ponta a ponta para um cliente individual (sem dependentes) obter uma recomendação de plano de saúde.

**Pré-condições:**
- [ ] Workspace autorizado
- [ ] Assistente de Planos de Saúde ativo
- [ ] Collections de planos de saúde com documentos processados
- [ ] Configuração ERP válida para o workspace (preços disponíveis)

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Selecionar o assistente "Agente de Planos de Saúde" no chat | Assistente selecionado | ⬜ |
| 2 | Enviar mensagem inicial: "Olá, preciso de ajuda para escolher um plano de saúde" | Assistente responde com pergunta sobre idade | ⬜ |
| 3 | Responder idade: "35 anos" | Assistente pergunta sobre dependentes | ⬜ |
| 4 | Responder dependentes: "Não, sou solteiro" | Assistente pergunta sobre condições | ⬜ |
| 5 | Responder condições: "Tenho hipertensão controlada" | Assistente pergunta sobre medicamentos | ⬜ |
| 6 | Responder medicamentos: "Losartana 50mg diário" | Assistente pergunta sobre localização | ⬜ |
| 7 | Responder cidade: "São Paulo, SP" | Assistente pergunta sobre orçamento | ⬜ |
| 8 | Responder orçamento: "Até R$ 800 por mês" | Assistente pergunta sobre preferências | ⬜ |
| 9 | Responder preferências: "Prefiro rede ampla, coparticipação está ok" | Progress Indicator atualiza para Step 2 | ⬜ |
| 10 | Aguardar Step 2 - Busca de planos | Mensagem de busca aparece, Progress atualiza | ⬜ |
| 11 | Aguardar Step 3 - Análise de compatibilidade | Client Info Card aparece com dados | ⬜ |
| 12 | Aguardar Step 4 - Consulta de preços | Progress atualiza para Step 4 | ⬜ |
| 13 | Aguardar Step 5 - Recomendação final | Recommendation Panel aparece | ⬜ |
| 14 | Verificar conteúdo do Recommendation Panel | Recomendação em Markdown formatado | ⬜ |
| 15 | Verificar Plan Comparison (tabela comparativa) | Tabela com top 3 planos, preços, scores | ⬜ |

**Dados para Verificação no Client Info Card:**
- Idade: 35 anos
- Dependentes: Nenhum
- Condições: Hipertensão
- Medicamentos: Losartana
- Cidade: São Paulo, SP
- Orçamento: R$ 800

**Critério de Aceitação:**
Usuário individual completa todo o fluxo em menos de 60 segundos e recebe recomendação personalizada com justificativa que menciona a hipertensão.

**Tasks Relacionadas:** 5, 6, 7, 8, 9, 10, 12

**Observações:**
- Verificar se alertas sobre carência para hipertensão são destacados
- Verificar tom empático nas mensagens
- Preços devem estar formatados em R$

**Tempo de Execução Observado:** _____ segundos

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S04: Fluxo Completo de Recomendação - Família

**Objetivo:** Validar o fluxo para uma família (titular + cônjuge + filhos) com necessidades específicas.

**Pré-condições:**
- [ ] Mesmas pré-condições de FE-S03
- [ ] API ERP configurada para retornar preços familiares

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Selecionar assistente de Planos de Saúde | Assistente selecionado | ⬜ |
| 2 | Iniciar conversa: "Quero um plano de saúde para minha família" | Assistente responde | ⬜ |
| 3 | Informar: "Titular de 42 anos" | Assistente pergunta sobre dependentes | ⬜ |
| 4 | Informar: "Esposa de 38 anos e dois filhos de 10 e 7 anos" | Assistente pergunta sobre condições | ⬜ |
| 5 | Informar: "Minha esposa tem diabetes tipo 2" | Assistente pergunta sobre medicamentos | ⬜ |
| 6 | Informar: "Metformina para a esposa" | Assistente pergunta sobre cidade | ⬜ |
| 7 | Informar: "Rio de Janeiro, RJ" | Assistente pergunta sobre orçamento | ⬜ |
| 8 | Informar: "Até R$ 2.500 para toda família" | Assistente pergunta sobre preferências | ⬜ |
| 9 | Informar: "Preferimos quartos individuais e hospital específico: Hospital Samaritano" | Processamento inicia | ⬜ |
| 10 | Aguardar processamento dos 5 steps | Todos os steps completam | ⬜ |
| 11 | Verificar Client Info Card com 4 membros listados | Card exibe titular + 3 dependentes | ⬜ |
| 12 | Verificar Plan Comparison com preços familiares | Tabela mostra preço familiar total | ⬜ |
| 13 | Analisar recomendação considerando diabetes da esposa | Recomendação menciona cobertura para diabetes | ⬜ |
| 14 | Verificar alertas sobre carência | Alertas incluem carência para diabetes tipo 2 | ⬜ |
| 15 | Verificar próximos passos | Próximos passos mencionam documentos para 4 beneficiários | ⬜ |

**Dados para Verificação:**
- Titular: 42 anos
- Dependentes: Esposa 38, Filho 10, Filho 7
- Condições: Diabetes tipo 2 (esposa)
- Medicamentos: Metformina
- Cidade: Rio de Janeiro, RJ
- Orçamento: R$ 2.500

**Critério de Aceitação:**
Sistema processa corretamente família de 4 pessoas e gera recomendação que atende necessidades específicas (diabetes, pediatria, preferência de hospital).

**Tasks Relacionadas:** 5, 6, 7, 8, 9, 10, 12

**Observações:**
- Verificar cálculo de preço familiar (titular + 3 dependentes)
- Testar se preferência de hospital específico é considerada

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S05: Progress Indicator - Navegação Visual

**Objetivo:** Validar que o indicador de progresso de 5 steps funciona corretamente durante todo o fluxo.

**Pré-condições:**
- [ ] Fluxo de recomendação em andamento

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Iniciar nova conversa com assistente de planos de saúde | Conversa iniciada | ⬜ |
| 2 | Durante Step 1 (coleta), verificar indicador | Step 1 "Coleta de Informações" ativo (azul) | ⬜ |
| 3 | Ao completar coleta, observar transição para Step 2 | Animação suave de transição | ⬜ |
| 4 | Verificar Step 1 completado | Status "completed" (verde/check) | ⬜ |
| 5 | Verificar Step 2 atual | Status "in-progress" (azul/animação) | ⬜ |
| 6 | Verificar Steps 3-5 futuros | Status "pending" (cinza) | ⬜ |
| 7 | Testar em viewport mobile (< 768px) | Layout vertical | ⬜ |
| 8 | Testar em viewport desktop (> 1024px) | Layout horizontal | ⬜ |

**Labels dos 5 Steps:**
1. Coleta de Informações
2. Busca de Planos
3. Análise de Compatibilidade
4. Consulta de Preços
5. Recomendação Final

**Critério de Aceitação:**
Progress Indicator reflete corretamente o estado atual do fluxo em ambos os viewports.

**Tasks Relacionadas:** 10, 12

**Observações:**
- Verificar acessibilidade (role="progressbar")
- Verificar cores em tema claro e escuro

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S06: Client Info Card - Atualização Dinâmica

**Objetivo:** Verificar que o card de informações do cliente atualiza em tempo real conforme dados são coletados.

**Pré-condições:**
- [ ] Step 1 (coleta) em andamento

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Iniciar conversa e informar idade: "Tenho 45 anos" | Client Info Card exibe idade imediatamente | ⬜ |
| 2 | Informar dependentes: "Tenho um filho de 15 anos" | Card atualiza com dependente | ⬜ |
| 3 | Informar condição: "Tenho asma" | Badge de condição aparece | ⬜ |
| 4 | Informar cidade: "Belo Horizonte, MG" | Localização atualiza com ícone MapPin | ⬜ |
| 5 | Informar orçamento: "R$ 600" | Orçamento formatado corretamente | ⬜ |
| 6 | Verificar skeleton UI para campos não preenchidos | Skeleton/placeholder visível | ⬜ |
| 7 | Verificar highlight em campos recém-atualizados | Animação sutil de destaque | ⬜ |
| 8 | Em mobile, verificar se card é colapsável | Funcionalidade de colapso disponível | ⬜ |
| 9 | Testar expandir/colapsar em mobile | Toggle funciona corretamente | ⬜ |

**Ícones Esperados:**
- Idade: User
- Dependentes: Users
- Condições: Heart
- Medicamentos: Pill
- Localização: MapPin
- Orçamento: DollarSign

**Critério de Aceitação:**
Card atualiza dinamicamente sem necessidade de refresh, com feedback visual claro.

**Tasks Relacionadas:** 5, 12

**Observações:**
- Campos não preenchidos devem mostrar skeleton/placeholder
- Formato de moeda deve ser "R$ X.XXX,XX"

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S07: Plan Comparison - Tabela Comparativa

**Objetivo:** Validar a tabela comparativa de planos com filtros e ordenação.

**Pré-condições:**
- [ ] Fluxo completo executado
- [ ] Pelo menos 3 planos disponíveis para comparação

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Completar fluxo até Step 5 | Fluxo completo | ⬜ |
| 2 | Localizar tabela de comparação de planos | Tabela visível | ⬜ |
| 3 | Verificar colunas presentes | Plano/Operadora, Score, Cobertura, Preço, Rede, Carência, Alertas | ⬜ |
| 4 | Verificar formatação de preços | Formato R$ X.XXX,XX | ⬜ |
| 5 | Verificar score com visual indicator | Barra ou badge colorido (0-100) | ⬜ |
| 6 | Clicar em header de coluna "Preço" para ordenar | Tabela reordena | ⬜ |
| 7 | Verificar reordenação da tabela | Ordem correta (asc/desc) | ⬜ |
| 8 | Aplicar filtro por operadora (se disponível) | Tabela filtra corretamente | ⬜ |
| 9 | Verificar badges de alerta em planos com carência longa | ⚠️ visível | ⬜ |
| 10 | Testar em viewport mobile | Cards empilhados | ⬜ |
| 11 | Testar scroll horizontal em desktop (se > 5 colunas) | Scroll funcional | ⬜ |

**Cores de Score:**
- Verde: > 70
- Amarelo: 40-70
- Vermelho: < 40

**Critério de Aceitação:**
Tabela é informativa, interativa (ordenação) e responsiva.

**Tasks Relacionadas:** 7, 12

**Observações:**
- Se não houver alternativas econômicas/premium, verificar graceful degradation
- Verificar tooltip em alertas truncados

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S08: Recommendation Panel - Recomendação Final

**Objetivo:** Verificar renderização completa e formatação da recomendação final.

**Pré-condições:**
- [ ] Fluxo completo até Step 5 finalizado

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Localizar Recommendation Panel após conclusão | Panel visível | ⬜ |
| 2 | Verificar seção "Recomendação Principal" | Destaque visual presente | ⬜ |
| 3 | Verificar justificativa detalhada | Linguagem empática e clara | ⬜ |
| 4 | Localizar seção "Alternativas" | Opções econômica e premium listadas | ⬜ |
| 5 | Verificar tabela comparativa em Markdown | Tabela renderizada corretamente | ⬜ |
| 6 | Localizar seção "Alertas Importantes" | Alertas com ícones de severidade | ⬜ |
| 7 | Verificar seção "Próximos Passos" | Checklist acionável | ⬜ |
| 8 | Verificar tooltips em termos técnicos | Tooltips de glossário funcionais | ⬜ |
| 9 | Testar botões de ação (se disponíveis) | Botões clicáveis | ⬜ |
| 10 | Verificar formatação em tema escuro | Contraste adequado, legível | ⬜ |

**Seções Esperadas:**
1. Recomendação Principal
2. Alternativas (Econômica/Premium)
3. Tabela Comparativa
4. Alertas Importantes
5. Próximos Passos

**Ícones de Alerta:**
- ⚠️ Importante (amber)
- ❌ Crítico (red)
- ℹ️ Informativo (blue)

**Critério de Aceitação:**
Recomendação é legível, bem formatada, com informações críticas destacadas visualmente.

**Tasks Relacionadas:** 9, 12

**Observações:**
- Verificar que tabelas Markdown não quebram o layout
- Próximos passos devem ser acionáveis (verbo no infinitivo)

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S09: Admin - Gerenciamento de Workspaces Autorizados

**Objetivo:** Testar interface de administração para controle de acesso ao assistente.

**Pré-condições:**
- [ ] Usuário com permissão de admin
- [ ] Página admin acessível: `/[locale]/[workspaceId]/admin`

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Navegar até página de admin | Página carrega | ⬜ |
| 2 | Localizar seção "Workspace Permissions" | Seção visível | ⬜ |
| 3 | Verificar tabela de workspaces | Lista com status Authorized/Not Authorized | ⬜ |
| 4 | Selecionar um workspace não autorizado | Workspace selecionado | ⬜ |
| 5 | Clicar em "Grant Access" | Dialog de confirmação (se houver) | ⬜ |
| 6 | Confirmar ação | Operação executada | ⬜ |
| 7 | Verificar atualização da tabela | Workspace agora autorizado | ⬜ |
| 8 | Selecionar workspace autorizado | Workspace selecionado | ⬜ |
| 9 | Clicar em "Revoke Access" | Dialog de confirmação | ⬜ |
| 10 | Confirmar ação | Operação executada | ⬜ |
| 11 | Verificar atualização | Workspace não autorizado | ⬜ |
| 12 | Testar acesso com usuário não-admin | "Access Denied" exibido | ⬜ |

**Critério de Aceitação:**
Admin consegue conceder e revogar acesso a workspaces com feedback claro.

**Tasks Relacionadas:** 11

**Observações:**
- Se assistente não existir, verificar se mensagem orientativa aparece
- Verificar que não há erro ao tentar revogar acesso de workspace já sem acesso

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S10: Admin - Configuração ERP - CRUD Completo

**Objetivo:** Testar formulário de configuração de credenciais ERP.

**Pré-condições:**
- [ ] Usuário admin
- [ ] Página: `/[locale]/[workspaceId]/admin/erp-config`

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Acessar página de configuração ERP | Página carrega | ⬜ |
| 2 | Verificar campos do formulário | URL, API Key, Headers, Timeout, Retries, Cache TTL | ⬜ |
| 3 | Preencher URL: "https://api.erp-teste.com/v1/planos" | Campo preenchido | ⬜ |
| 4 | Preencher API Key: "sk-test-key-12345" | Campo preenchido (type=password) | ⬜ |
| 5 | Preencher Custom Headers: `{"X-Custom": "value"}` | JSON válido aceito | ⬜ |
| 6 | Ajustar Timeout: 15000ms | Valor ajustado | ⬜ |
| 7 | Ajustar Retries: 2 | Valor ajustado | ⬜ |
| 8 | Ajustar Cache TTL: 900s | Valor ajustado | ⬜ |
| 9 | Clicar em "Salvar" | Requisição enviada | ⬜ |
| 10 | Verificar feedback de sucesso | Toast/mensagem de sucesso | ⬜ |
| 11 | Recarregar página | Dados persistidos (exceto API Key) | ⬜ |
| 12 | Clicar em "Testar Conectividade" | Teste executado | ⬜ |
| 13 | Verificar resultado do teste | Status sucesso ou erro específico | ⬜ |
| 14 | Editar configuração (mudar timeout) | Campo editado | ⬜ |
| 15 | Salvar e verificar atualização | Update bem-sucedido | ⬜ |
| 16 | Clicar em "Excluir Configuração" | Dialog de confirmação | ⬜ |
| 17 | Confirmar exclusão | Exclusão executada | ⬜ |
| 18 | Verificar formulário | Estado vazio | ⬜ |

**Validações Esperadas:**
- URL: Formato válido (https://...)
- Timeout: Range 1000-60000
- Retries: Range 0-5
- Cache TTL: Range 60-86400
- JSON Headers: Sintaxe válida

**Critério de Aceitação:**
Admin consegue criar, ler, atualizar, testar e excluir configurações ERP.

**Tasks Relacionadas:** 8, 17

**Observações:**
- API Key nunca deve aparecer em plaintext
- Verificar validação client-side antes de submit

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S11: Admin - Dashboard de Cache ERP

**Objetivo:** Validar dashboard de métricas do cache e ações relacionadas.

**Pré-condições:**
- [ ] Configuração ERP ativa
- [ ] Algumas chamadas à API já realizadas (cache populado)

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Acessar aba "Cache" na página de configuração ERP | Aba carrega | ⬜ |
| 2 | Verificar cards de métricas | Hit Rate, Miss Rate, Total Entries, Evictions | ⬜ |
| 3 | Verificar cores dos indicadores | Verde > 70%, Amarelo 40-70%, Vermelho < 40% | ⬜ |
| 4 | Verificar gráfico temporal de hits/misses | Gráfico renderiza (Recharts) | ⬜ |
| 5 | Verificar período do gráfico | Últimas 24h | ⬜ |
| 6 | Clicar em "Limpar Cache" | Dialog de confirmação | ⬜ |
| 7 | Confirmar ação | Cache limpo | ⬜ |
| 8 | Verificar Total Entries = 0 após limpeza | Contador zerado | ⬜ |
| 9 | Realizar nova consulta ao agente | Consulta executada | ⬜ |
| 10 | Verificar métricas atualizadas | Contadores incrementados | ⬜ |
| 11 | Aguardar 30s e verificar auto-refresh | Dados atualizados automaticamente | ⬜ |

**Métricas Esperadas:**
- Hit Rate: % de requisições atendidas pelo cache
- Miss Rate: % de requisições que foram à API
- Total Entries: Número de entradas no cache
- Evictions: Entradas removidas (últimas 24h)

**Critério de Aceitação:**
Dashboard exibe métricas precisas e ação de limpeza funciona.

**Tasks Relacionadas:** 8, 17

**Observações:**
- Se cache vazio, exibir estado apropriado (0% hit rate)
- Skeleton loading durante carregamento

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S12: Admin - Histórico de Chamadas API

**Objetivo:** Testar tabela de histórico de chamadas à API ERP com filtros e paginação.

**Pré-condições:**
- [ ] Chamadas à API ERP já realizadas (erp_api_logs populado)

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Acessar aba "Histórico" na página ERP Config | Aba carrega | ⬜ |
| 2 | Verificar tabela com colunas | Timestamp, Status, Response Time, Cache Hit, Error | ⬜ |
| 3 | Verificar formatação de timestamp | Data/hora legível | ⬜ |
| 4 | Verificar badges de status | Verde=success, Vermelho=error, Amarelo=timeout | ⬜ |
| 5 | Aplicar filtro de data: últimas 24 horas | Tabela atualiza | ⬜ |
| 6 | Aplicar filtro de status: apenas "error" | Apenas erros exibidos | ⬜ |
| 7 | Limpar filtros | Todos registros exibidos | ⬜ |
| 8 | Testar paginação: clicar em "Próxima" | Navegação funcional | ⬜ |
| 9 | Verificar informação "Página X de Y" | Info de paginação correta | ⬜ |
| 10 | Hover em error message truncada | Tooltip com mensagem completa | ⬜ |

**Colunas da Tabela:**
| Coluna | Formato |
|--------|---------|
| Timestamp | DD/MM/YYYY HH:mm:ss |
| Status | Badge colorido |
| Response Time | XXX ms |
| Cache Hit | ✓ ou ✗ |
| Error | Texto truncado |

**Critério de Aceitação:**
Histórico é consultável, filtrável e paginável corretamente.

**Tasks Relacionadas:** 17

**Observações:**
- Empty state se não houver registros
- Verificar performance com muitos registros (> 100)

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S13: Admin - Monitor de Saúde ERP

**Objetivo:** Validar painel de monitoramento de saúde da API ERP.

**Pré-condições:**
- [ ] Configuração ERP ativa
- [ ] Health checks sendo executados (tabela erp_health_checks populada)

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Acessar aba "Monitoramento" na página ERP Config | Aba carrega | ⬜ |
| 2 | Verificar indicador visual de status | Círculo verde/amarelo/vermelho | ⬜ |
| 3 | Verificar semântica das cores | Verde=healthy, Amarelo=degraded, Vermelho=down | ⬜ |
| 4 | Verificar tabela dos últimos 5 health checks | Tabela com 5 registros | ⬜ |
| 5 | Verificar colunas da tabela | Timestamp, Latency (ms), Status | ⬜ |
| 6 | Se taxa de erro > 20%, verificar card de alerta | Alerta amarelo/vermelho visível | ⬜ |
| 7 | Aguardar 60s e verificar auto-refresh | Dados atualizados | ⬜ |
| 8 | (Se possível) Simular falha | Status muda para vermelho | ⬜ |

**Status do Monitor:**
| Cor | Significado |
|-----|-------------|
| 🟢 Verde | API healthy, latência normal |
| 🟡 Amarelo | API degraded, latência alta |
| 🔴 Vermelho | API down, falhas frequentes |

**Critério de Aceitação:**
Monitor reflete status real da API ERP com alertas apropriados.

**Tasks Relacionadas:** 17

**Observações:**
- Se não houver health checks, exibir mensagem apropriada
- Verificar que indicador não "pisca" no refresh

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S14: Responsividade Mobile - Componentes Health Plan

**Objetivo:** Testar layouts responsivos em dispositivos móveis.

**Pré-condições:**
- [ ] DevTools do navegador com emulação mobile (iPhone 12, Galaxy S21)

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Acessar chat em viewport 375px (iPhone) | Chat carrega | ⬜ |
| 2 | Verificar Progress Indicator | Layout vertical | ⬜ |
| 3 | Verificar Client Info Card | Card colapsável | ⬜ |
| 4 | Expandir/colapsar Client Info Card | Toggle funciona | ⬜ |
| 5 | Verificar Plan Comparison | Cards empilhados | ⬜ |
| 6 | Verificar Recommendation Panel | Scroll suave | ⬜ |
| 7 | Testar navegação touch (swipe, tap) | Touch responsivo | ⬜ |
| 8 | Acessar Admin ERP Config em mobile | Página carrega | ⬜ |
| 9 | Verificar formulário | Coluna única | ⬜ |
| 10 | Verificar tabelas | Scroll horizontal funcional | ⬜ |
| 11 | Testar em viewport 768px (tablet) | Layouts intermediários corretos | ⬜ |

**Breakpoints Testados:**
| Viewport | Dispositivo | Comportamento |
|----------|-------------|---------------|
| 375px | iPhone 12 | Mobile |
| 414px | iPhone 12 Pro Max | Mobile |
| 768px | iPad | Tablet |
| 1024px+ | Desktop | Desktop |

**Critério de Aceitação:**
Aplicação é totalmente funcional em mobile sem perda de usabilidade.

**Tasks Relacionadas:** 12

**Observações:**
- Testar em dispositivo real se possível
- Verificar que modais não cortam em mobile
- Touch targets mínimos de 44px

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S15: Tema Escuro/Claro - Todos Componentes

**Objetivo:** Validar que todos os componentes funcionam corretamente em ambos os temas.

**Pré-condições:**
- [ ] Toggle de tema acessível na aplicação

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Com tema claro ativo, navegar por componentes Health Plan | Todos visíveis | ⬜ |
| 2 | Verificar contraste de texto em Client Info Card | Texto legível | ⬜ |
| 3 | Verificar cores de status em Progress Indicator | Cores distinguíveis | ⬜ |
| 4 | Verificar badges e alertas em Recommendation Panel | Cores adequadas | ⬜ |
| 5 | Verificar tabela de comparação | Linhas distinguíveis | ⬜ |
| 6 | Alternar para tema escuro | Transição suave | ⬜ |
| 7 | Repetir verificações 2-5 em tema escuro | Todos elementos visíveis | ⬜ |
| 8 | Verificar transição (sem flickering) | Transição smooth | ⬜ |
| 9 | Verificar gráficos do dashboard de cache | Gráficos legíveis | ⬜ |
| 10 | Verificar formulários de admin | Inputs e labels visíveis | ⬜ |

**Verificações de Contraste:**
- Texto principal: ratio mínimo 4.5:1 (WCAG AA)
- Texto grande: ratio mínimo 3:1
- Elementos interativos: focus ring visível

**Critério de Aceitação:**
Aplicação é igualmente usável e legível em tema claro e escuro.

**Tasks Relacionadas:** 12

**Observações:**
- Verificar focus rings visíveis em ambos os temas
- Testar com daltonismo simulado (DevTools) se possível

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S16: Tratamento de Erros - Timeout e Falhas de API

**Objetivo:** Verificar comportamento do sistema em cenários de falha.

**Pré-condições:**
- [ ] Capacidade de simular falha (desconectar rede ou mock de erro)

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Iniciar fluxo de recomendação | Fluxo inicia | ⬜ |
| 2 | Durante Step 4 (preços), simular timeout da API ERP | Timeout simulado | ⬜ |
| 3 | Verificar mensagem de erro | Mensagem amigável exibida | ⬜ |
| 4 | Verificar se fluxo continua com dados parciais ou fallback | Graceful degradation | ⬜ |
| 5 | Verificar Progress Indicator | Não fica "travado" | ⬜ |
| 6 | Reiniciar fluxo com conexão normal | Fluxo funciona | ⬜ |
| 7 | Simular erro 500 da API | Erro simulado | ⬜ |
| 8 | Verificar mensagem diferenciada | Mensagem específica para erro de servidor | ⬜ |
| 9 | Verificar botão "Tentar novamente" | Botão disponível (se implementado) | ⬜ |
| 10 | Simular timeout geral (> 60s) | Timeout global | ⬜ |
| 11 | Verificar mensagem de timeout | Orientação ao usuário | ⬜ |

**Mensagens de Erro Esperadas:**
| Cenário | Mensagem |
|---------|----------|
| Timeout ERP | "Não conseguimos consultar preços no momento. Tente novamente." |
| Erro 500 | "Houve um problema no servidor. Nossa equipe foi notificada." |
| Timeout geral | "A operação demorou mais que o esperado. Por favor, tente novamente." |

**Critério de Aceitação:**
Sistema trata erros graciosamente com feedback adequado ao usuário.

**Tasks Relacionadas:** 8, 10

**Observações:**
- Verificar logs no console para debugging
- Verificar se dados parciais são preservados
- Nenhum erro técnico deve ser exposto ao usuário final

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

### FE-S17: Admin - Auditoria - Consulta de Histórico

**Objetivo:** Testar interface de consulta de histórico de auditoria de recomendações.

**Pré-condições:**
- [ ] Tabela client_recommendations com dados
- [ ] Interface de auditoria implementada

**Passos de Teste:**

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Acessar página de auditoria admin | Página carrega | ⬜ |
| 2 | Verificar tabela de histórico | Tabela visível | ⬜ |
| 3 | Verificar colunas | Data, Workspace, Usuário, Planos, Recomendação, Score | ⬜ |
| 4 | Verificar anonimização de usuário | Dados sensíveis ocultos | ⬜ |
| 5 | Aplicar filtro de período (última semana) | Resultados filtrados | ⬜ |
| 6 | Clicar em uma recomendação para ver detalhes | Modal/página de detalhes | ⬜ |
| 7 | Verificar detalhes completos | Reasoning, alertas visíveis | ⬜ |
| 8 | Testar botão "Exportar CSV" (se disponível) | Download iniciado | ⬜ |
| 9 | Abrir CSV e verificar dados | Dados anonimizados no arquivo | ⬜ |

**Campos Esperados no CSV:**
- Timestamp
- Workspace Name
- User (anonimizado)
- Client Age Range (não CPF/nome)
- Analyzed Plans Count
- Recommended Plan Name
- Confidence Score
- LangSmith Run ID

**Critério de Aceitação:**
Interface de auditoria permite consulta e exportação respeitando LGPD.

**Tasks Relacionadas:** 13

**Observações:**
- Verificar rate limiting em exportações (1/min)
- Verificar que langsmith_run_id é preservado para rastreabilidade

**Resultado:** ⬜ Passou | ⬜ Falhou | ⬜ Bloqueado

**Evidências/Bugs:**
```
[Inserir screenshots ou IDs de bugs aqui]
```

---

## 4. Cenários de Borda e Regressão

### FE-E01: Entrada de Idade Inválida

**Objetivo:** Testar validação de idade fora dos limites (0-120 anos).

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Na coleta, informar idade "150 anos" | Sistema pede correção ou trata como inválido | ⬜ |
| 2 | Informar idade "0 anos" | Validação ou pergunta de confirmação | ⬜ |
| 3 | Informar idade negativa "-5 anos" | Erro de validação | ⬜ |

**Tasks:** 5

**Resultado:** ⬜ Passou | ⬜ Falhou

---

### FE-E02: Orçamento Zero ou Negativo

**Objetivo:** Testar comportamento com orçamento inválido.

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Informar orçamento "R$ 0" | Solicitação de valor válido | ⬜ |
| 2 | Informar orçamento "R$ -100" | Erro de validação | ⬜ |
| 3 | Informar orçamento muito alto "R$ 999.999" | Aceito ou alerta | ⬜ |

**Tasks:** 5

**Resultado:** ⬜ Passou | ⬜ Falhou

---

### FE-E03: Muitos Dependentes (> 10)

**Objetivo:** Testar performance com família grande.

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Informar 12 dependentes com idades variadas | Sistema processa | ⬜ |
| 2 | Verificar Client Info Card | Todos listados ou scroll interno | ⬜ |
| 3 | Verificar cálculo de preço familiar | Preço total correto | ⬜ |

**Tasks:** 5, 12

**Resultado:** ⬜ Passou | ⬜ Falhou

---

### FE-E04: Navegação com Back/Forward do Browser

**Objetivo:** Testar comportamento ao usar navegação do browser durante fluxo.

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Iniciar fluxo até Step 3 | Fluxo em andamento | ⬜ |
| 2 | Clicar em "Voltar" do browser | Estado preservado ou mensagem | ⬜ |
| 3 | Clicar em "Avançar" do browser | Retorna ao estado anterior | ⬜ |

**Tasks:** 10, 12

**Resultado:** ⬜ Passou | ⬜ Falhou

---

### FE-E05: Refresh Durante Processamento

**Objetivo:** Testar recuperação após refresh em meio ao fluxo.

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Durante Step 4 (preços), pressionar F5 | Página recarrega | ⬜ |
| 2 | Verificar estado após reload | Sessão preservada ou reinício com mensagem | ⬜ |

**Tasks:** 10

**Resultado:** ⬜ Passou | ⬜ Falhou

---

### FE-E06: Múltiplas Abas com Mesmo Workspace

**Objetivo:** Testar concorrência de sessões.

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Abrir duas abas com mesmo workspace | Ambas carregam | ⬜ |
| 2 | Iniciar fluxo em ambas simultaneamente | Fluxos iniciam | ⬜ |
| 3 | Verificar se há conflito ou interferência | Sessões independentes | ⬜ |

**Tasks:** 10

**Resultado:** ⬜ Passou | ⬜ Falhou

---

### FE-E07: Admin - Configuração ERP com JSON Malformado

**Objetivo:** Testar validação de JSON em custom headers.

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | No formulário ERP, inserir headers: `{"invalido": }` | Erro de validação JSON | ⬜ |
| 2 | Tentar salvar | Submit bloqueado | ⬜ |
| 3 | Corrigir JSON e salvar | Sucesso | ⬜ |

**Tasks:** 17

**Resultado:** ⬜ Passou | ⬜ Falhou

---

### FE-E08: Workspace Sem Collections de Health Plan

**Objetivo:** Testar comportamento quando não há documentos.

| # | Ação | Resultado Esperado | Status |
|---|------|-------------------|--------|
| 1 | Em workspace autorizado mas sem collections | Workspace acessado | ⬜ |
| 2 | Iniciar fluxo de recomendação | Fluxo inicia | ⬜ |
| 3 | Verificar mensagem na busca de planos | Mensagem sobre falta de planos cadastrados | ⬜ |

**Tasks:** 4, 6

**Resultado:** ⬜ Passou | ⬜ Falhou

---

## 5. Inconsistências / Dúvidas / Pontos de Validação

### 5.1 Inconsistências Identificadas

| Item | Descrição | Tasks Relacionadas | Ação Recomendada |
|------|-----------|-------------------|------------------|
| IC-01 | Task 10 (Orquestrador) tem subtarefas "pending" mas task está "done" | 10 | Verificar se subtasks foram implementadas sem atualizar status |
| IC-02 | Task 13 (Auditoria) subtask 3 está "in-progress", subtasks 4 e 5 estão "pending" | 13 | Confirmar escopo de testes para features não completas |
| IC-03 | Task 14 (LangSmith) subtasks 4-8 estão "pending" mas task está "done" | 14 | Verificar se implementação parcial atende ao PRD |
| IC-04 | Task 15 (Admin Documents) está "pending" mas não tem subtasks | 15 | Esclarecer se será incluída nesta sprint |

### 5.2 Dúvidas para o Time

1. **Sessão persistente:** Há gerenciamento de sessão entre steps? Se usuário fechar e reabrir, o fluxo continua?
2. **Timeout parcial:** Se Step 4 (preços) falhar por timeout, o que acontece com Steps 1-3 já coletados?
3. **Anonimização configurável:** Como admin configura nível de anonimização por workspace?
4. **Health check cron:** O cron de health check está implementado? Com qual frequência?
5. **Export CSV:** Há limit de 10k registros implementado? Como usuário é informado?

### 5.3 Requisitos do PRD vs Implementação

| Requisito PRD | Status | Observação |
|---------------|--------|------------|
| RF-001: Assistente Personalizado | ✅ Implementado | Task 3 done |
| RF-002: Coleta Estruturada | ✅ Implementado | Task 5 done |
| RF-003: Sistema RAG | ✅ Implementado | Task 4 done |
| RF-004: Busca Inteligente | ✅ Implementado | Task 6 done |
| RF-005: Análise Compatibilidade | ✅ Implementado | Task 7 done |
| RF-006: Integração ERP | ✅ Implementado | Task 8 done |
| RF-007: Geração Recomendação | ✅ Implementado | Task 9 done |
| RF-008: Orquestrador | ⚠️ Parcial | Task 10 done, mas subtasks pending |
| RF-009: Controle Acesso | ✅ Implementado | Task 11 done |
| RF-010: Interface Especializada | ✅ Implementado | Task 12 done |
| RF-011: Admin Collections | ⏳ Pendente | Task 15 pending |
| RF-012: Auditoria | ⚠️ Parcial | Task 13, algumas subtasks pending |
| RF-013: LangSmith | ⚠️ Parcial | Task 14, algumas subtasks pending |

---

## 6. Checklist de Execução para QA

### Pré-Execução
- [ ] Ambiente de staging configurado
- [ ] Workspace de teste autorizado criado
- [ ] Workspace de teste não autorizado criado
- [ ] Collections de health_plan com documentos de teste
- [ ] Configuração ERP de teste válida
- [ ] Usuário admin de teste
- [ ] Usuário regular de teste
- [ ] DevTools preparado para emulação mobile
- [ ] Credenciais LangSmith para verificar traces (se aplicável)

### Execução Principal
- [ ] FE-S01: Acesso Autorizado
- [ ] FE-S02: Bloqueio Não Autorizado
- [ ] FE-S03: Fluxo Individual
- [ ] FE-S04: Fluxo Família
- [ ] FE-S05: Progress Indicator
- [ ] FE-S06: Client Info Card
- [ ] FE-S07: Plan Comparison
- [ ] FE-S08: Recommendation Panel
- [ ] FE-S09: Admin Workspaces
- [ ] FE-S10: Admin ERP CRUD
- [ ] FE-S11: Admin Cache Dashboard
- [ ] FE-S12: Admin Histórico API
- [ ] FE-S13: Admin Health Monitor
- [ ] FE-S14: Responsividade
- [ ] FE-S15: Temas
- [ ] FE-S16: Tratamento Erros
- [ ] FE-S17: Admin Auditoria

### Cenários de Borda
- [ ] FE-E01: Idade Inválida
- [ ] FE-E02: Orçamento Inválido
- [ ] FE-E03: Muitos Dependentes
- [ ] FE-E04: Back/Forward Browser
- [ ] FE-E05: Refresh Durante Processamento
- [ ] FE-E06: Múltiplas Abas
- [ ] FE-E07: JSON Malformado
- [ ] FE-E08: Sem Collections

### Pós-Execução
- [ ] Documentar bugs encontrados
- [ ] Classificar por severidade (Crítico/Alto/Médio/Baixo)
- [ ] Tirar screenshots de evidências
- [ ] Registrar tempos de execução observados
- [ ] Atualizar status dos cenários

---

## 7. Registro de Execução

### Informações da Execução
| Campo | Valor |
|-------|-------|
| Data de Execução | _________________ |
| QA Responsável | _________________ |
| Ambiente | _________________ |
| Browser/Versão | _________________ |
| SO | _________________ |

### Resumo dos Resultados
| Categoria | Passou | Falhou | Bloqueado | Total |
|-----------|--------|--------|-----------|-------|
| Cenários Principais (FE-S) | | | | 17 |
| Cenários de Borda (FE-E) | | | | 8 |
| **Total** | | | | **25** |

### Bugs Encontrados
| ID Bug | Cenário | Severidade | Descrição | Status |
|--------|---------|------------|-----------|--------|
| | | | | |
| | | | | |
| | | | | |

### Observações Gerais
```
[Inserir observações relevantes sobre a execução]
```

---

**Fim do Documento de Testes de Front-End**

*Documento gerado automaticamente em 2025-12-01*
