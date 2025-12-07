# Plano de Testes QA - Tasks 31, 32, 33, 34 (Fases 6A-6D)

**Versão:** 1.1
**Data:** 2025-12-06
**Testador:** _______________
**Ambiente:** Produção/Dev

---

## IMPORTANTE - Filosofia de Teste

> **Este documento é um GUIA, não um script rígido.**
>
> - O agente pode fazer perguntas de confirmação - **responda naturalmente**
> - Continue a conversa até sentir que o teste foi **completamente explorado**
> - **Vá além** do que está escrito - tente quebrar, confundir, testar limites
> - Se o agente perguntar "está correto?", responda "sim" ou "não" conforme o contexto
> - **Explore caminhos alternativos** - o objetivo é encontrar bugs, não apenas seguir passos
> - Anote **TUDO** que parecer estranho, lento, ou incorreto

---

## Acesso à Aplicação

### URL de Acesso
```
http://5.161.64.137:3000/
```

### Passo a Passo para Iniciar

1. **Acessar a URL** no navegador
2. **Clicar em "Start Chatting →"** (botão azul na tela inicial)
3. **Clicar em "+ New Chat"** no painel esquerdo
4. **Clicar em "Quick Settings"** no painel esquerdo (canto superior)
5. **Selecionar o assistente "Health Plan v2"** no dropdown
6. **Iniciar o teste** digitando a mensagem indicada

### Como Criar Novo Chat Entre Testes
Quando um teste exigir "novo chat":
1. Clicar em "+ New Chat" no painel esquerdo
2. Aguardar o chat ser criado
3. Verificar que "Health Plan v2" ainda está selecionado em Quick Settings
4. Prosseguir com o próximo teste

---

## Dados do Ambiente de Teste

| Item | Valor |
|------|-------|
| **Assistente** | Health Plan v2 |
| **Collection disponível** | health_plan (102 chunks) |
| **Operadora nos dados** | Einstein |
| **Chunks com tabela de preço** | 6 |
| **rag_model** | gpt-5-mini |

---

## Instruções para o Testador

### O que FAZER:
- ✅ Registre TODAS as interações na seção "Registro de Execução"
- ✅ Copie a resposta COMPLETA do agente para cada interação
- ✅ Continue conversando até o agente dar uma resposta final ou travar
- ✅ Responda às perguntas do agente naturalmente (confirme dados, corrija, etc.)
- ✅ Tente confundir o agente com informações contraditórias
- ✅ Teste o que acontece se você mudar de ideia no meio da conversa
- ✅ Anote tempo de resposta, erros, comportamentos estranhos
- ✅ Tire screenshots de bugs e salve em `.taskmaster/docs/screenshots/`

### O que NÃO fazer:
- ❌ Não pare no meio se o agente fizer uma pergunta
- ❌ Não siga o script cegamente - explore!
- ❌ Não ignore comportamentos estranhos - anote tudo
- ❌ Não marque como "passou" se algo parecer errado

---

# TASK 31 - Fase 6A: Fundação de Dados

## Teste 31.1 - Verificar plan_metadata via SQL

**Objetivo:** Confirmar que todos os chunks estão classificados

**Tipo:** SQL (Supabase)

**Ação:**
1. Acessar o SQL Editor do Supabase
2. Executar:
```sql
SELECT
  plan_metadata->>'documentType' as tipo,
  COUNT(*) as total
FROM file_items
WHERE plan_metadata IS NOT NULL
GROUP BY 1;
```

**Esperado:**
| tipo | total |
|------|-------|
| product | 100 |
| faq | 1 |
| general | 1 |

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Output do SQL:**
```
[Colar resultado aqui]
```

**Observações:**
```
[Anotar se há chunks faltando, tipos inesperados, etc.]
```

---

## Teste 31.2 - Verificar Índices GIN

**Objetivo:** Confirmar que índices existem

**Tipo:** SQL (Supabase)

**Ação:**
```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'file_items'
  AND (indexname LIKE '%plan_metadata%'
   OR indexname LIKE '%doc_type%'
   OR indexname LIKE '%operator%'
   OR indexname LIKE '%tags%');
```

**Esperado:** 4 índices:
- idx_file_items_doc_type
- idx_file_items_operator
- idx_file_items_tags
- idx_file_items_plan_metadata

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Output:**
```
[Colar resultado aqui]
```

---

## Teste 31.3 - Verificar rag_model em Collections

**Objetivo:** Confirmar campo e constraint

**Tipo:** SQL (Supabase)

**Ação 1 - Verificar valores:**
```sql
SELECT id, name, rag_model FROM collections;
```

**Ação 2 - Testar constraint (deve FALHAR):**
```sql
UPDATE collections SET rag_model = 'modelo-invalido' WHERE name = 'health_plan';
```

**Esperado:**
- Ação 1: Todas collections com `rag_model = 'gpt-5-mini'`
- Ação 2: `ERROR: violates check constraint`

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Output:**
```
[Colar resultado aqui]
```

---

## Teste 31.4 - Frontend: Conversa com Dados Completos

**Objetivo:** Verificar que o agente processa dados e busca planos

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** Novo chat com "Health Plan v2" selecionado

**Mensagem inicial sugerida:**
```
Tenho 45 anos, moro em São Paulo, tenho esposa de 42 e filho de 12, orçamento R$1000
```

**O que observar:**
- O agente confirma os dados? Se sim, confirme.
- O agente pede mais informações? Forneça.
- O agente busca planos? Quantos encontrou?
- Quanto tempo demorou cada resposta?

**Continue a conversa até:**
- O agente mostrar planos encontrados, OU
- O agente travar/dar erro, OU
- Você sentir que não há mais progresso

**Explore também:**
- Pergunte "quais operadoras você tem?"
- Pergunte "qual o plano mais barato?"
- Tente mudar o orçamento: "na verdade, meu orçamento é R$500"
- Veja como ele reage

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Número de interações até resultado:** ___

**Tempo total da conversa:** ___ segundos

**O agente encontrou planos?** ⬜ Sim (___ planos) | ⬜ Não

**Registro completo:** (use a seção de Registro de Execução abaixo)

---

## Teste 31.5 - Frontend: Testar Dados Incompletos

**Objetivo:** Verificar comportamento com dados parciais

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** CRIAR NOVO CHAT

**Mensagem inicial:**
```
Preciso de um plano de saúde
```

**O que observar:**
- O agente pergunta idade? Cidade? Dependentes? Orçamento?
- Em que ordem ele pergunta?
- O que acontece se você responder só uma coisa por vez?
- Quando ele decide ter dados suficientes para buscar?

**Explore:**
- Responda só a idade primeiro
- Depois só a cidade
- Veja quantas perguntas ele faz
- Tente pular o orçamento - ele busca mesmo assim?

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Perguntas que o agente fez:**
1. _______________
2. _______________
3. _______________
4. _______________

**Observações:**
```
[O agente foi insistente demais? Esqueceu de perguntar algo importante?]
```

---

# TASK 32 - Fase 6B: Grading & Rewriting

## Teste 32.1 - Frontend: Perfil Difícil (Idoso com Condição)

**Objetivo:** Verificar grading e possível rewriting

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** CRIAR NOVO CHAT

**Mensagem inicial sugerida:**
```
Meu pai tem 70 anos, é diabético, mora em São Paulo, orçamento de R$600
```

**O que observar:**
- O agente entende que é para outra pessoa (pai)?
- Ele menciona a condição pré-existente (diabetes)?
- Encontrou planos compatíveis?
- Se não encontrou, como ele comunicou isso?

**Continue até:**
- Ver planos recomendados, OU
- Agente informar limitações, OU
- Conversa travar

**Explore:**
- Pergunte "algum plano cobre tratamento de diabetes?"
- Pergunte "e se eu aumentar o orçamento para R$1000?"
- Veja se os resultados mudam

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**O agente mencionou a condição pré-existente?** ⬜ Sim | ⬜ Não

**Encontrou planos?** ⬜ Sim (___ planos) | ⬜ Não

**Observações:**
```
[Como o agente lidou com o perfil complexo?]
```

---

## Teste 32.2 - Frontend: Busca Impossível

**Objetivo:** Forçar cenário onde não há resultados

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** CRIAR NOVO CHAT

**Mensagem inicial sugerida:**
```
Quero um plano que cubra tratamento experimental de câncer, com rede em Manaus, orçamento máximo R$150
```

**O que observar:**
- O agente tenta buscar mesmo assim?
- Como ele comunica que não há opções?
- Ele sugere alternativas? (aumentar orçamento, mudar critérios)
- Ele trava ou dá erro?

**Explore:**
- Se ele disser que não encontrou, pergunte "e se eu for para São Paulo?"
- Pergunte "qual o plano mais barato que você tem?"
- Tente: "ok, esquece o tratamento experimental, só quero algo básico"

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**O agente lidou bem com a busca impossível?** ⬜ Sim | ⬜ Não

**Sugeriu alternativas?** ⬜ Sim | ⬜ Não

**Observações:**
```
[O agente ficou confuso? Travou? Deu erro?]
```

---

## Teste 32.3 - Verificar Build sem Erros

**Objetivo:** Confirmar que código compila

**Tipo:** Terminal/SSH

**Ação:**
```bash
cd /root/chatbot-ui/chatbot-ui
npm run build 2>&1 | tail -30
```

**Esperado:**
- ✅ Build completa sem erros TypeScript
- ✅ Mensagem de sucesso no final

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Output (últimas linhas):**
```
[Colar output aqui]
```

---

## Teste 32.4 - Testes Unitários

**Objetivo:** Confirmar que testes passam

**Tipo:** Terminal/SSH

**Ação:**
```bash
cd /root/chatbot-ui/chatbot-ui
npx vitest run lib/agents/health-plan-v2/nodes/rag/__tests__/ 2>&1 | tail -50
```

**Esperado:**
- ✅ Todos os testes passando (verde)
- ✅ Nenhum teste falhando (vermelho)

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Quantos testes passaram?** ___

**Quantos testes falharam?** ___

**Output:**
```
[Colar output aqui]
```

---

# TASK 33 - Fase 6C: Hierarquia & Grafo

## Teste 33.1 - Frontend: Perfil Simples (Jovem Solteiro)

**Objetivo:** Verificar busca básica funciona

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** CRIAR NOVO CHAT

**Mensagem inicial sugerida:**
```
Tenho 28 anos, solteiro, sem dependentes, moro em SP, orçamento R$400
```

**O que observar:**
- O agente confirma os dados?
- Ele busca planos rapidamente?
- Quantos planos encontrou?
- Os planos são da Einstein (única operadora nos dados)?

**Explore:**
- Pergunte "qual desses é o melhor para mim?"
- Pergunte "algum tem cobertura odontológica?"
- Tente "e se eu quisesse incluir academia?"

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Tempo até ver planos:** ___ segundos

**Número de planos encontrados:** ___

**Operadora mencionada:** _______________

**Observações:**
```
[Os planos pareciam relevantes para o perfil?]
```

---

## Teste 33.2 - Frontend: Filtro de Orçamento (Idoso)

**Objetivo:** Verificar filterByBudget para faixa 60+

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** CRIAR NOVO CHAT

**Mensagem inicial sugerida:**
```
Tenho 68 anos, aposentado, moro em São Paulo, posso pagar até R$800 por mês
```

**O que observar:**
- O agente entende que é faixa etária mais cara?
- Os planos mostrados estão dentro do orçamento?
- Ele menciona que opções podem ser limitadas?

**Explore:**
- Pergunte "por que os planos são mais caros para minha idade?"
- Tente "e se eu tivesse 40 anos, seria mais barato?"
- Pergunte "qual o plano mais completo que cabe no meu orçamento?"

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Os planos respeitaram o orçamento?** ⬜ Sim | ⬜ Não

**O agente mencionou faixa etária?** ⬜ Sim | ⬜ Não

**Observações:**
```
[O filtro de orçamento funcionou corretamente?]
```

---

## Teste 33.3 - Frontend: Família Grande

**Objetivo:** Verificar busca para múltiplos dependentes

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** CRIAR NOVO CHAT

**Mensagem inicial sugerida:**
```
Somos uma família de 5 pessoas: eu (42 anos), minha esposa (40), e 3 filhos de 15, 12 e 8 anos. Moramos em SP e temos orçamento de R$2000 para todos.
```

**O que observar:**
- O agente entendeu todas as 5 pessoas?
- Ele calcula por pessoa ou total?
- Os planos familiares são adequados?

**Explore:**
- Pergunte "quanto fica por pessoa?"
- Tente remover alguém: "na verdade, o filho mais velho não precisa, ele tem plano do trabalho"
- Veja se ele recalcula

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**O agente entendeu todos os dependentes?** ⬜ Sim | ⬜ Não

**Quantos dependentes ele identificou?** ___

**Observações:**
```
[Ele confundiu alguma informação? Esqueceu alguém?]
```

---

## Teste 33.4 - Frontend: Mudar de Ideia

**Objetivo:** Verificar invalidação de cache quando dados mudam

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** Usar o MESMO chat do Teste 33.3

**Continuação da conversa:**
1. Após ver os planos, diga:
```
Pensando melhor, vai ser só eu e minha esposa. As crianças vão ficar no plano da escola.
```

**O que observar:**
- O agente entendeu a mudança?
- Ele fez nova busca?
- Os resultados são diferentes?
- O preço mudou?

**Explore mais:**
- Mude o orçamento: "agora podemos gastar R$1500 só para nós dois"
- Mude a cidade: "aliás, estamos nos mudando para o Rio"
- Veja como ele reage a cada mudança

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**O agente atualizou os dados?** ⬜ Sim | ⬜ Não

**Fez nova busca?** ⬜ Sim | ⬜ Não

**Observações:**
```
[Ele manteve informações antigas? Ficou confuso?]
```

---

## Teste 33.5 - Frontend: Informações Contraditórias

**Objetivo:** Testar como o agente lida com contradições

**Tipo:** Frontend - EXPLORATÓRIO

**Pré-requisito:** CRIAR NOVO CHAT

**Estratégia:** Dar informações que não fazem sentido

**Mensagem 1:**
```
Tenho 35 anos, moro em SP
```

**Mensagem 2 (após resposta):**
```
Na verdade tenho 55 anos
```

**Mensagem 3 (após resposta):**
```
Desculpa, me confundi. Tenho 35 mesmo, mas moro no Rio, não em SP
```

**O que observar:**
- O agente fica confuso?
- Ele pede confirmação?
- Ele usa qual informação no final?
- Os planos refletem os dados corretos?

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**O agente lidou bem com as contradições?** ⬜ Sim | ⬜ Não

**Observações:**
```
[Descreva como o agente reagiu às mudanças]
```

---

## Teste 33.6 - Testes de Integração (Terminal)

**Objetivo:** Verificar testes automatizados

**Tipo:** Terminal/SSH

**Ação:**
```bash
cd /root/chatbot-ui/chatbot-ui
npx vitest run lib/agents/health-plan-v2/nodes/rag/__tests__/filter-by-budget.test.ts 2>&1
```

**Esperado:**
- ✅ Testes passando

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Output:**
```
[Colar output aqui]
```

---

# TASK 34 - Fase 6D: Evaluation & Polish

## Teste 34.1 - Verificar Arquivos de Evaluation

**Objetivo:** Confirmar que arquivos existem

**Tipo:** Terminal/SSH

**Ação 1 - rag-evaluation.ts:**
```bash
ls -la /root/chatbot-ui/chatbot-ui/lib/agents/health-plan-v2/monitoring/
```

**Ação 2 - Conteúdo:**
```bash
head -50 /root/chatbot-ui/chatbot-ui/lib/agents/health-plan-v2/monitoring/rag-evaluation.ts
```

**Esperado:**
- ✅ Arquivo rag-evaluation.ts existe
- ✅ Contém funções de avaliação

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Output:**
```
[Colar output aqui]
```

---

## Teste 34.2 - Verificar Dataset de Testes

**Objetivo:** Confirmar dataset existe

**Tipo:** Terminal/SSH

**Ação:**
```bash
find /root/chatbot-ui/chatbot-ui/lib/agents/health-plan-v2 -name "*.json" -type f 2>/dev/null
cat /root/chatbot-ui/chatbot-ui/lib/agents/health-plan-v2/nodes/rag/__tests__/fixtures/*.json 2>/dev/null | head -100
```

**Esperado:**
- ✅ Arquivos JSON de fixtures existem
- ✅ Contém casos de teste

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Output:**
```
[Colar output aqui]
```

---

## Teste 34.3 - Verificar Relatório Baseline

**Objetivo:** Confirmar que evaluation foi executada

**Tipo:** Terminal/SSH

**Ação:**
```bash
cat /root/chatbot-ui/chatbot-ui/.taskmaster/reports/rag-baseline-evaluation.md 2>/dev/null || echo "Arquivo não encontrado"
```

**Esperado:**
- ✅ Arquivo existe
- ✅ Contém métricas

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**O arquivo existe?** ⬜ Sim | ⬜ Não

**Output:**
```
[Colar output aqui]
```

---

## Teste 34.4 - Verificar README

**Objetivo:** Confirmar documentação atualizada

**Tipo:** Terminal/SSH

**Ação:**
```bash
head -150 /root/chatbot-ui/chatbot-ui/lib/agents/health-plan-v2/README.md
```

**Verificar se contém:**
- ⬜ Diagrama de fluxo do pipeline
- ⬜ Menção a filterByBudget
- ⬜ Configuração rag_model
- ⬜ Seção de troubleshooting

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Output:**
```
[Colar output aqui]
```

---

## Teste 34.5 - Frontend: Jornada Completa do Usuário

**Objetivo:** Testar fluxo real de um usuário

**Tipo:** Frontend - EXPLORATÓRIO COMPLETO

**Pré-requisito:** CRIAR NOVO CHAT

**Cenário:** Você é um usuário REAL que não sabe nada sobre o sistema. Apenas quer encontrar um plano de saúde.

**Comece com:**
```
Oi, preciso de ajuda para escolher um plano de saúde
```

**Instruções:**
1. Responda às perguntas do agente naturalmente
2. Não dê todas as informações de uma vez
3. Faça perguntas como um usuário real faria
4. Continue até receber uma recomendação final
5. Tente pedir para comparar opções
6. Pergunte sobre próximos passos

**Dados para usar (quando perguntado):**
- Idade: 38 anos
- Cidade: São Paulo
- Dependentes: esposa (36 anos)
- Orçamento: R$900 para o casal
- Preferências: hospital bom, sem coparticipação

**Explore:**
- "O que é coparticipação?"
- "Qual a diferença entre esses planos?"
- "Posso visitar o Hospital Einstein com esse plano?"
- "E se eu precisar de emergência?"
- "Como faço para contratar?"

**Continue até:**
- Receber recomendação clara, OU
- Sentir que o agente não tem mais o que oferecer, OU
- Encontrar um bug/problema

**Resultado:** ⬜ PASSOU | ⬜ FALHOU

**Número total de interações:** ___

**Tempo total da jornada:** ___ minutos

**O agente conseguiu ajudar?** ⬜ Sim | ⬜ Parcialmente | ⬜ Não

**Pontos positivos:**
```
[O que funcionou bem?]
```

**Pontos negativos:**
```
[O que precisa melhorar?]
```

**Bugs encontrados:**
```
[Descreva qualquer problema]
```

---

# TESTES EXTRAS - QUEBRANDO O SISTEMA

## Teste Extra 1 - Mensagens Muito Curtas

**Pré-requisito:** CRIAR NOVO CHAT

**Tente enviar:**
- "oi"
- "plano"
- "?"
- "35"
- "sp"

**O que acontece?** O agente entende? Pede mais informações?

**Observações:**
```
[Anotar comportamento]
```

---

## Teste Extra 2 - Mensagens Muito Longas

**Pré-requisito:** CRIAR NOVO CHAT

**Tente enviar um texto enorme com muitas informações de uma vez.**

**O agente consegue processar tudo?** ⬜ Sim | ⬜ Não

**Observações:**
```
[Anotar comportamento]
```

---

## Teste Extra 3 - Idioma Diferente

**Pré-requisito:** CRIAR NOVO CHAT

**Tente em inglês:**
```
I need a health insurance plan. I'm 40 years old, living in São Paulo.
```

**O agente responde em português ou inglês?**

**Observações:**
```
[Anotar comportamento]
```

---

## Teste Extra 4 - Perguntas Fora do Escopo

**Pré-requisito:** CRIAR NOVO CHAT

**Tente:**
- "Qual a previsão do tempo?"
- "Me conta uma piada"
- "Quem é o presidente do Brasil?"
- "Qual seu nome?"

**O agente mantém o foco em planos de saúde?** ⬜ Sim | ⬜ Não

**Observações:**
```
[Anotar comportamento]
```

---

## Teste Extra 5 - Refresh no Meio da Conversa

**Pré-requisito:** Chat com algumas mensagens já enviadas

**Ação:**
1. Envie 3-4 mensagens
2. Dê F5 (refresh) na página
3. Volte ao mesmo chat
4. Continue a conversa

**O histórico foi mantido?** ⬜ Sim | ⬜ Não

**O agente lembra do contexto?** ⬜ Sim | ⬜ Não

**Observações:**
```
[Anotar comportamento]
```

---

# RESUMO DOS RESULTADOS

## Task 31 - Fase 6A: Fundação de Dados

| Teste | Descrição | Resultado | Observação |
|-------|-----------|-----------|------------|
| 31.1 | plan_metadata via SQL | ⬜ | |
| 31.2 | Índices GIN | ⬜ | |
| 31.3 | rag_model em collections | ⬜ | |
| 31.4 | Conversa com dados completos | ⬜ | |
| 31.5 | Dados incompletos | ⬜ | |

**Status Task 31:** ⬜ APROVADA | ⬜ REPROVADA | ⬜ COM RESSALVAS

**Comentários:**
```

```

---

## Task 32 - Fase 6B: Grading & Rewriting

| Teste | Descrição | Resultado | Observação |
|-------|-----------|-----------|------------|
| 32.1 | Perfil difícil (idoso) | ⬜ | |
| 32.2 | Busca impossível | ⬜ | |
| 32.3 | Build sem erros | ⬜ | |
| 32.4 | Testes unitários | ⬜ | |

**Status Task 32:** ⬜ APROVADA | ⬜ REPROVADA | ⬜ COM RESSALVAS

**Comentários:**
```

```

---

## Task 33 - Fase 6C: Hierarquia & Grafo

| Teste | Descrição | Resultado | Observação |
|-------|-----------|-----------|------------|
| 33.1 | Perfil simples (jovem) | ⬜ | |
| 33.2 | Filtro orçamento (idoso) | ⬜ | |
| 33.3 | Família grande | ⬜ | |
| 33.4 | Mudar de ideia | ⬜ | |
| 33.5 | Informações contraditórias | ⬜ | |
| 33.6 | Testes de integração | ⬜ | |

**Status Task 33:** ⬜ APROVADA | ⬜ REPROVADA | ⬜ COM RESSALVAS

**Comentários:**
```

```

---

## Task 34 - Fase 6D: Evaluation & Polish

| Teste | Descrição | Resultado | Observação |
|-------|-----------|-----------|------------|
| 34.1 | Arquivos de evaluation | ⬜ | |
| 34.2 | Dataset de testes | ⬜ | |
| 34.3 | Relatório baseline | ⬜ | |
| 34.4 | README atualizado | ⬜ | |
| 34.5 | Jornada completa | ⬜ | |

**Status Task 34:** ⬜ APROVADA | ⬜ REPROVADA | ⬜ COM RESSALVAS

**Comentários:**
```

```

---

## Testes Extras

| Teste | Descrição | Funcionou? |
|-------|-----------|------------|
| Extra 1 | Mensagens curtas | ⬜ |
| Extra 2 | Mensagens longas | ⬜ |
| Extra 3 | Idioma diferente | ⬜ |
| Extra 4 | Fora do escopo | ⬜ |
| Extra 5 | Refresh | ⬜ |

---

# REGISTRO DE EXECUÇÃO DOS TESTES

## Informações da Sessão

| Campo | Valor |
|-------|-------|
| **Data/Hora Início** | |
| **Data/Hora Fim** | |
| **Testador** | |
| **Browser** | |
| **Versão** | |

---

## Sessão 1 - Teste: _______________

**Chat criado em:** _______________

### Interação 1
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 2
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 3
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 4
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 5
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 6
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

**Resultado da Sessão 1:** ⬜ OK | ⬜ Problemas encontrados

**Observações da Sessão 1:**
```

```

---

## Sessão 2 - Teste: _______________

**Chat criado em:** _______________

### Interação 1
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 2
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 3
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 4
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 5
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 6
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

**Resultado da Sessão 2:** ⬜ OK | ⬜ Problemas encontrados

**Observações da Sessão 2:**
```

```

---

## Sessão 3 - Teste: _______________

**Chat criado em:** _______________

### Interação 1
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 2
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 3
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 4
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 5
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 6
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

**Resultado da Sessão 3:** ⬜ OK | ⬜ Problemas encontrados

**Observações da Sessão 3:**
```

```

---

## Sessão 4 - Teste: _______________

**Chat criado em:** _______________

### Interação 1
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 2
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 3
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 4
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 5
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 6
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

**Resultado da Sessão 4:** ⬜ OK | ⬜ Problemas encontrados

**Observações da Sessão 4:**
```

```

---

## Sessão 5 - Teste: _______________

**Chat criado em:** _______________

### Interação 1
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 2
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 3
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 4
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 5
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

### Interação 6
**Você enviou:**
```

```

**Agente respondeu:**
```

```

**Tempo:** ___ segundos | **OK?** ⬜ Sim ⬜ Não

---

**Resultado da Sessão 5:** ⬜ OK | ⬜ Problemas encontrados

**Observações da Sessão 5:**
```

```

---

## Sessões Adicionais

(Copie e cole o template de sessão acima quantas vezes precisar)

---

# BUGS ENCONTRADOS

| # | Teste | Descrição do Bug | Severidade | Reproduzível? |
|---|-------|------------------|------------|---------------|
| 1 | | | ⬜ Crítico ⬜ Alto ⬜ Médio ⬜ Baixo | ⬜ Sempre ⬜ Às vezes ⬜ Raro |
| 2 | | | ⬜ Crítico ⬜ Alto ⬜ Médio ⬜ Baixo | ⬜ Sempre ⬜ Às vezes ⬜ Raro |
| 3 | | | ⬜ Crítico ⬜ Alto ⬜ Médio ⬜ Baixo | ⬜ Sempre ⬜ Às vezes ⬜ Raro |
| 4 | | | ⬜ Crítico ⬜ Alto ⬜ Médio ⬜ Baixo | ⬜ Sempre ⬜ Às vezes ⬜ Raro |
| 5 | | | ⬜ Crítico ⬜ Alto ⬜ Médio ⬜ Baixo | ⬜ Sempre ⬜ Às vezes ⬜ Raro |
| 6 | | | ⬜ Crítico ⬜ Alto ⬜ Médio ⬜ Baixo | ⬜ Sempre ⬜ Às vezes ⬜ Raro |
| 7 | | | ⬜ Crítico ⬜ Alto ⬜ Médio ⬜ Baixo | ⬜ Sempre ⬜ Às vezes ⬜ Raro |
| 8 | | | ⬜ Crítico ⬜ Alto ⬜ Médio ⬜ Baixo | ⬜ Sempre ⬜ Às vezes ⬜ Raro |

### Detalhes dos Bugs

**Bug #1:**
```
Passos para reproduzir:
1.
2.
3.

O que aconteceu:

O que deveria acontecer:

Screenshot: [link ou nome do arquivo]
```

**Bug #2:**
```
Passos para reproduzir:
1.
2.
3.

O que aconteceu:

O que deveria acontecer:

Screenshot: [link ou nome do arquivo]
```

**Bug #3:**
```
Passos para reproduzir:
1.
2.
3.

O que aconteceu:

O que deveria acontecer:

Screenshot: [link ou nome do arquivo]
```

---

# SUGESTÕES DE MELHORIA

(Coisas que não são bugs, mas poderiam ser melhores)

| # | Descrição | Prioridade |
|---|-----------|------------|
| 1 | | ⬜ Alta ⬜ Média ⬜ Baixa |
| 2 | | ⬜ Alta ⬜ Média ⬜ Baixa |
| 3 | | ⬜ Alta ⬜ Média ⬜ Baixa |
| 4 | | ⬜ Alta ⬜ Média ⬜ Baixa |
| 5 | | ⬜ Alta ⬜ Média ⬜ Baixa |

---

# OBSERVAÇÕES GERAIS

```
[Espaço livre para anotações gerais sobre a sessão de testes]










```

---

# CONCLUSÃO

## Resumo Executivo

**Total de testes executados:** ___

**Testes que passaram:** ___

**Testes que falharam:** ___

**Bugs encontrados:** ___

**Tempo total de teste:** ___

## Recomendação Final

⬜ **APROVAR** - Todas as tasks podem ser marcadas como DONE

⬜ **APROVAR COM RESSALVAS** - Aprovar, mas com os seguintes pontos de atenção:
```

```

⬜ **REPROVAR** - Não aprovar pelas seguintes razões:
```

```

---

## Assinaturas

**Testador:**
- Nome: _______________
- Data: _______________
- Assinatura: _______________

**Revisor:**
- Nome: _______________
- Data: _______________
- Assinatura: _______________

**Aprovador Final:**
- Nome: _______________
- Data: _______________
- Assinatura: _______________
