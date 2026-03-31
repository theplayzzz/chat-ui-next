# Relatório de Acurácia - Health Plan Agent v2
**Data**: 2026-03-31
**Chats**: 10 | **Interações**: 150 total (15 por chat)
**Checkpointer**: Ativo (true) em todos os chats

---

## Tabela de Acurácia por Chat

| Chat | Cenário | Coleta Dados | Busca RAG | Precisão Factual | Recall Documental | Nota Geral |
|------|---------|-------------|-----------|------------------|-------------------|------------|
| 1 | Família Nova Iguaçu | 10/10 | 7/10 | 4/10 | 3/10 | 6.0/10 |
| 2 | Empresarial 10 func SP | 9/10 | 6/10 | 4/10 | 3/10 | 5.5/10 |
| 3 | Idoso 58 c/ condições | 9/10 | 7/10 | 5/10 | 3/10 | 6.0/10 |
| 4 | Jovem 24 BH baixo orç | 9/10 | 5/10 | 5/10 | 2/10 | 5.3/10 |
| 5 | Empresa 30 func Porte II | 9/10 | 6/10 | 4/10 | 3/10 | 5.5/10 |
| 6 | Família c/ idosos | 9/10 | 6/10 | 4/10 | 2/10 | 5.3/10 |
| 7 | MEI Curitiba | 8/10 | 4/10 | 5/10 | 2/10 | 4.8/10 |
| 8 | Comparativo preços | 9/10 | 6/10 | 3/10 | 2/10 | 5.0/10 |
| 9 | Carência/portabilidade | 9/10 | 5/10 | 6/10 | 3/10 | 5.8/10 |
| 10 | Família grande Campinas | 9/10 | 6/10 | 5/10 | 3/10 | 5.8/10 |
| **MÉDIA** | | **9.0** | **5.8** | **4.5** | **2.6** | **5.5** |

---

## Categorias de Avaliação

### 1. Coleta de Dados (média 9.0/10) ✅
**O que funciona bem:**
- Extração de idade, cidade, estado, orçamento, dependentes: excelente
- Confirmação visual com completude %: correto
- Fluxo empresarial: reconhece contractType, employeeCount (fix aplicado)
- Checkpointer preserva estado entre turnos (fix confirmado)

**Problemas residuais:**
- Sogro/sogra classificados como "outro" ao invés de "parent"
- MEI sem funcionários pode não ter contractType detectado corretamente

### 2. Busca RAG (média 5.8/10) ⚠️
**O que funciona:**
- Busca retorna 3-5 resultados quando acionada
- Intent classifier funciona bem para "buscar_planos"
- searchPlans encontra documentos relevantes

**Problemas identificados:**
- Muitas perguntas de follow-up classificadas como "conversar" ao invés de "consultar_preco" ou "analisar"
- respondToUser é chamado para perguntas factuais que deveriam acionar RAG
- Perguntas sobre preços específicos (P520 faixa 54-58) não encontram os chunks corretos
- Dados de abrangência (municípios do Bronze RJ) não são recuperados mesmo estando nos chunks

### 3. Precisão Factual (média 4.5/10) ❌
**Fatos que o agente DEVERIA saber (estão nos documentos indexados) mas NÃO respondeu:**

| Fato Documental | Status | Documento Fonte |
|-----------------|--------|-----------------|
| Bronze RJ cobre 5 municípios (RJ, Duque de Caxias, Niterói, Nova Iguaçu, São Gonçalo) | ❌ Não informou | AMIL PME p.6 |
| Bronze RJ Mais cobre 31 municípios | ❌ Não informou | AMIL PME p.6 |
| Bronze SP cobre 23 municípios | ❌ Não informou | AMIL PME p.6 |
| Bronze SP Mais cobre 53 municípios incluindo Campinas | ❌ Não informou | AMIL PME p.6 |
| Bronze PR cobre 14 municípios incluindo Curitiba | ❌ Não informou | AMIL PME p.6 |
| Porte I = 2 a 29 vidas | ⚠️ Genérico | AMIL PME p.27 |
| Porte II = 30 a 99 vidas | ⚠️ Genérico | AMIL PME p.27 |
| Exclusivo Mais (Alice) faixa 29-33 = R$1.626,74 | ❌ Não informou | Einstein p.1 |
| S2500 R1 (Amil) faixa 29-33 = R$2.018,15 | ❌ Não informou | Einstein p.1 |
| Black R1 (Bradesco) faixa 29-33 = R$1.841,87 | ❌ Não informou | Einstein p.1 |
| Nacional Plus 4 (Porto) faixa 29-33 = R$2.234,99 | ❌ Não informou | Einstein p.1 |
| P520 (Porto) faixa 29-33 = R$1.528,85 | ❌ Não informou | Einstein p.1 |
| Executivo R1 (SulAmérica) faixa 24-28 = R$1.473,47 | ❌ Não informou | Einstein p.1 |
| Carência urgência/emergência = 24 horas | ✅ Correto | ANS + AMIL PME |
| Carência parto = 300 dias | ✅ Correto | ANS + AMIL PME |
| PRC 609 = plano anterior >12 meses não congênere | ❌ Não encontrou | AMIL PME p.36 |
| PRC 607 = sem vínculo anterior | ⚠️ Genérico | AMIL PME p.36 |
| CPT = Cobertura Parcial Temporária | ✅ Correto | AMIL PME |
| MEI pode contratar PME | ✅ Correto | AMIL PME |
| Dental 100 Promo disponível | ❌ Não encontrou | AMIL PME p.21 |
| S2500 R1 e Black R1 têm coparticipação parcial | ❌ Não informou | Einstein p.1 |
| Linha Selecionada (S380/S450/S750/S2500) tem reembolso | ❌ Não informou | AMIL PME p.5 |
| CNPJ MEI precisa 180 dias ativo | ✅ Correto (Chat 7, Turn 12) | AMIL PME |
| Hospital Sabará está na rede (Consolação/SP) | ❌ Não confirmou | Einstein p.2 |
| Sírio Libanês na rede (Bela Vista/SP) | ❌ Não confirmou | Einstein p.2 |

### 4. Recall Documental (média 2.6/10) ❌
**Problema central**: O agente tem os dados nos chunks mas não os recupera quando perguntado diretamente.

**Análise de retrieval:**
- Chunks de preço (tabela Einstein) parecem não ser bem recuperados por busca vetorial
- Chunks de abrangência geográfica (municípios) não são recuperados
- Chunks de carência (tabela PRC) não são recuperados
- Respostas genéricas ("não encontrei no material") para dados que ESTÃO nos chunks

**Causa provável:**
- Busca vetorial não é eficiente para dados tabulares (preços, listas de municípios)
- O formato de chunking pode estar quebrando tabelas em pedaços sem contexto
- O grading pode estar filtrando chunks relevantes como "irrelevantes"
- Level 1 (default) faz retrieval por file sem BM25, perdendo matches exatos

---

## Tabela de Acurácia por Tipo de Pergunta

| Tipo de Pergunta | Perguntas | Corretas | Parciais | Incorretas | Sem Resposta | Acurácia |
|------------------|-----------|----------|----------|------------|--------------|----------|
| Coleta de dados | 20 | 18 | 2 | 0 | 0 | 90% |
| Busca de planos | 10 | 7 | 2 | 0 | 1 | 70% |
| Preço específico | 15 | 0 | 2 | 0 | 13 | 0% |
| Cobertura geográfica | 12 | 0 | 3 | 0 | 9 | 0% |
| Carência/PRC | 15 | 4 | 5 | 1 | 5 | 27% |
| Rede credenciada | 8 | 0 | 2 | 0 | 6 | 0% |
| Regras PME/empresarial | 12 | 3 | 6 | 0 | 3 | 25% |
| Coparticipação/reembolso | 10 | 2 | 4 | 0 | 4 | 20% |
| Comparativo/ranking | 10 | 5 | 3 | 0 | 2 | 50% |
| Explicação conceitual | 20 | 16 | 3 | 1 | 0 | 80% |
| Dependentes/elegibilidade | 10 | 5 | 3 | 0 | 2 | 50% |
| Recomendação final | 8 | 4 | 3 | 0 | 1 | 50% |
| **TOTAL** | **150** | **64** | **38** | **2** | **46** | **43%** |

---

## Análise dos Vetores

### Chunks que deveriam ser recuperados mas não foram:

Verificação via Supabase - os chunks existem no banco:
- `manual_de_vendas_pme_amil.pdf` chunk com "Amil Bronze RJ: abrangência em 5 municípios" ✅ existe
- `planos_com_einstein.pdf` chunk com tabela de preços por faixa ✅ existe
- `manual_de_vendas_pme_amil.pdf` chunk com "Prazos Reduzidos de Carência (PRC)" ✅ existe

**Diagnóstico**: Os embeddings existem e são válidos. O problema é no retrieval:
1. **Busca semântica vs léxica**: Perguntas como "Bronze RJ cobre Duque de Caxias?" são léxicas — BM25 acharia facilmente, mas vector search pode não ranquear bem
2. **Grading agressivo**: O grading por file pode estar descartando chunks de tabelas como "baixa relevância"
3. **Level 1 limita top 5 chunks por file**: Pode não pegar o chunk correto em documentos grandes (AMIL tem 31 chunks, Einstein 50)

### Recomendação: Ativar Level 3 (USE_RAG_LEVEL3=true)
O pipeline Level 3 adicionaria:
- BM25 + vector com RRF fusion (hybrid search)
- Rerank de top 20 → top 8
- Melhor retrieval para dados tabulares e listas

---

## Problemas de Estado e Conversação

| Problema | Frequência | Impacto |
|----------|------------|---------|
| Checkpointer funcional | 100% ativado | ✅ Resolvido |
| Estado preservado entre turnos | 100% | ✅ Resolvido |
| __DEBUG__ no banco | 0 novas ocorrências | ✅ Resolvido |
| Intent "conversar" para perguntas factuais | ~60% dos follow-ups | ⚠️ Alto |
| respondToUser sem RAG context | ~40% das perguntas específicas | ⚠️ Alto |
| Eco de mensagem do usuário (bug de captura?) | ~15% dos turnos | ⚠️ Médio |
| Resposta duplicada (mesma do turno anterior) | ~10% dos turnos | ⚠️ Médio |

---

## Resumo Executivo

### O que funciona bem (>70% acurácia):
- ✅ Coleta de dados (90%)
- ✅ Explicações conceituais (80%)
- ✅ Busca de planos (70%)
- ✅ Persistência de estado (100%)

### O que precisa melhorar (<30% acurácia):
- ❌ Preços específicos por faixa etária (0%)
- ❌ Cobertura geográfica detalhada (0%)
- ❌ Rede credenciada de hospitais (0%)
- ❌ Regras de carência/PRC (27%)
- ❌ Coparticipação/reembolso detalhado (20%)

### Causa raiz: Retrieval, não geração
O LLM responde bem quando tem contexto (explicações, comparativos). O problema é que o RAG Level 1 **não recupera os chunks certos** para perguntas específicas sobre dados tabulares. A ativação do Level 3 (hybrid search + rerank) é o próximo passo crítico.

### Ações prioritárias:
1. **Ativar `USE_RAG_LEVEL3=true`** para hybrid search (BM25 + vector)
2. **Melhorar classificação de intent**: perguntas sobre preço/cobertura não devem ser "conversar"
3. **Rechunking de tabelas**: chunks de tabelas de preço precisam manter contexto (cabeçalho + linhas)
4. **Reclassificar intent "consultar_preco"**: quando user pergunta preço específico, deve buscar RAG, não respondToUser

---

## Apêndice: Validação Detalhada com Fatos Documentais

### A. Preços (Einstein PDF — dados EXATOS nos chunks)

| Plano | Faixa | Preço Real | Respondeu? |
|-------|-------|-----------|------------|
| Alice Exclusivo Mais | 24-28 | R$1.439,73 | ❌ |
| Alice Exclusivo Mais | 29-33 | R$1.626,74 | ❌ |
| Alice Exclusivo Mais | 34-38 | R$1.867,29 | ❌ |
| Alice Exclusivo Mais | 44-48 | R$2.414,62 | ❌ |
| Alice Exclusivo Mais | 54-58 | R$3.791,77 | ❌ |
| Amil S2500 R1 | 29-33 | R$2.018,15 | ❌ |
| Bradesco Black R1 | 29-33 | R$1.841,87 | ❌ |
| Porto Nacional Plus 4 | 29-33 | R$2.234,99 | ❌ |
| Porto P520 | 29-33 | R$1.528,85 | ❌ |
| Porto P520 | 44-48 | R$2.043,54 | ❌ |
| Porto P520 | 54-58 | R$2.718,21 | ❌ |
| SulAmérica Executivo R1 | 24-28 | R$1.473,47 | ❌ |
| **Acurácia preços**: **0/12 = 0%** | | | |

### B. Cobertura Geográfica (AMIL PME PDF)

| Fato | Respondeu? |
|------|------------|
| Bronze RJ = 5 municípios: RJ, Duque de Caxias, Niterói, Nova Iguaçu, São Gonçalo | ❌ |
| Bronze SP = 23 municípios | ❌ |
| Bronze SP Mais = 53 municípios incl. Campinas | ❌ |
| Bronze PR = 14 municípios incl. Curitiba | ❌ |
| **Acurácia geográfica**: **0/4 = 0%** | |

### C. Carência/PRC

| Fato | Respondeu? |
|------|------------|
| Urgência = 24h | ✅ |
| Parto = 300 dias | ✅ |
| CPT = 24 meses | ✅ |
| PRC 609 = >12 meses não congênere, consulta = 1 dia | ❌ |
| PRC 617 = >6 meses congênere | ❌ |
| 30+ vidas = isenção total de carência | ❌ |
| Intervalo máximo 60 dias entre planos | ✅ |
| MEI CNPJ precisa 180 dias ativo | ✅ |
| **Acurácia carência**: **5/8 = 63%** | |

### D. Coparticipação

| Fato | Respondeu? |
|------|------------|
| S2500 R1 e Black R1 = copart parcial | ❌ |
| Alice, Bradesco, Porto, SulAmérica = sem copart | ❌ |
| Bronze consulta = 30%/R$30 | ❌ |
| Quimio/radio/hemodiálise = isento | ❌ |
| **Acurácia copart**: **0/4 = 0%** | |

### E. Rede Credenciada

| Fato | Respondeu? |
|------|------------|
| Einstein Morumbi em todos os 6 planos | ❌ |
| Sírio Libanês em todos os 6 planos | ❌ |
| Hospital Sabará na rede | ❌ |
| Amil Espaço Saúde Nova Iguaçu | ❌ |
| **Acurácia rede**: **0/4 = 0%** | |

### F. Explicações Conceituais

| Conceito | Correto? |
|----------|----------|
| O que é CPT | ✅ |
| QC vs QP | ✅ |
| PF vs PME | ✅ |
| Portabilidade | ✅ |
| Congênere | ✅ |
| Reembolso | ✅ |
| Compra de carência | ✅ |
| **Acurácia conceitual**: **7/7 = 100%** | |

### Acurácia Total Verificada: **12/39 = 31%**

O agente é excelente em explicações conceituais (100%) mas falha em recuperar dados específicos dos documentos (preços 0%, geografia 0%, rede 0%, copart 0%). O gargalo é o retrieval Level 1, não a geração.
