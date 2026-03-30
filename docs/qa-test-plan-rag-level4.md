# QA Test Plan — RAG Level 4 Upgrade

## Objetivo
Validar pelo frontend todas as mudancas do upgrade RAG Level 4: upload wizard, processamento de arquivos, e qualidade das respostas do agente.

---

## Pre-requisitos
- Acesso ao frontend da aplicacao (login valido)
- Workspace com assistente de plano de saude configurado
- Arquivos PDF de planos de saude para upload (minimo 2 arquivos de operadoras/tipos diferentes)
  - Ex: "Bradesco Saude Empresarial.pdf" e "Bradesco Saude Individual.pdf"
- Navegador com DevTools aberto (aba Network) para acompanhar chamadas API

---

## Teste 1: Upload Wizard — Fluxo Completo

**O que testar:** O novo wizard multi-step de upload substituiu o formulario antigo.

**Passos:**
1. Na sidebar, clique em "Files" e depois no botao de criar arquivo (+)
2. O wizard deve abrir como um dialog/modal com o Step 1 (selecao de arquivo)
3. Selecione um arquivo PDF de plano de saude
4. O wizard deve avancar para o Step 2 (analise) ou Step 3 (confirmacao)
5. Na tela de confirmacao, verifique:
   - Nome sugerido (editavel)
   - Descricao sugerida (editavel)
   - Operadora detectada
   - Tipo de plano detectado
   - Secoes detectadas (badges)
   - Tags sugeridas (botoes toggleaveis)
   - Chunk Size e Chunk Overlap recomendados (editaveis)
   - Justificativa do chunking
6. Clique em "Confirmar e Processar"
7. O wizard deve mostrar o Step 4 (processamento) com progresso por etapa:
   - Quebrando documento em chunks
   - Gerando embeddings
   - Classificando tags dos chunks
   - Gerando contexto posicional
   - Embedding do arquivo
8. Apos concluir, o Step 5 (resumo) deve mostrar uma tabela com:
   - Nome do arquivo, tipo, tamanho
   - Quantidade de chunks criados
   - Chunk size e overlap usados
   - Tags, tipo de plano
   - Tempo de processamento

**Resultado esperado:** Todos os 5 steps completam sem erro. A tabela resumo mostra dados coerentes.

**Output para reportar:**
```
Arquivo: [nome do arquivo]
Steps completados: [1/2/3/4/5 de 5]
Chunks criados: [numero]
Tags detectadas: [lista]
Tipo de plano: [empresarial/individual/familiar/outro]
Tempo de processamento: [Xs]
Erros: [nenhum / descricao do erro]
Screenshot: [anexar]
```

---

## Teste 2: Upload de Arquivo Grande (150+ paginas)

**O que testar:** O sistema processa arquivos grandes sem travar ou dar timeout.

**Passos:**
1. Repita o Teste 1 com o maior PDF disponivel (150+ paginas se possivel)
2. Observe o tempo de processamento no Step 4
3. Verifique se o progresso atualiza em tempo real (nao fica travado)
4. Confirme que o resumo final mostra um numero alto de chunks

**Resultado esperado:** Upload completa sem timeout. Progresso atualiza durante o processamento.

**Output para reportar:**
```
Arquivo: [nome]
Paginas (estimativa): [numero]
Tamanho: [X MB]
Chunks criados: [numero]
Tempo total: [Xs]
Progresso atualizou em tempo real: [Sim/Nao]
Erros: [nenhum / descricao]
```

---

## Teste 3: Upload de Multiplos Arquivos do Mesmo Tipo

**O que testar:** Subir 2+ arquivos da mesma operadora mas tipos diferentes (ex: empresarial e individual).

**Passos:**
1. Faca upload do arquivo "Plano Empresarial" (Teste 1 acima)
2. Faca upload do arquivo "Plano Individual" (repita o wizard)
3. Verifique na sidebar que ambos os arquivos aparecem listados
4. Para cada arquivo, clique nele e verifique se mostra:
   - Nome e descricao corretos
   - Chunk size e overlap
   - Tipo do arquivo

**Resultado esperado:** Ambos os arquivos sao criados com sucesso e aparecem na lista.

**Output para reportar:**
```
Arquivo 1: [nome] — Chunks: [X], Tipo plano: [empresarial]
Arquivo 2: [nome] — Chunks: [X], Tipo plano: [individual]
Ambos aparecem na sidebar: [Sim/Nao]
Erros: [nenhum / descricao]
```

---

## Teste 4: Consulta ao Agente — Busca Geral

**O que testar:** O agente usa os arquivos uploadados para responder perguntas.

**Pre-requisito:** Testes 1-3 completos (arquivos ja uploadados).

**Passos:**
1. Abra um novo chat com o assistente de plano de saude
2. Envie: "Quais planos voces tem disponiveis?"
3. Aguarde a resposta do agente
4. Verifique se a resposta menciona os planos dos arquivos que voce subiu

**Resultado esperado:** O agente lista/menciona planos baseados nos documentos uploadados.

**Output para reportar:**
```
Pergunta: "Quais planos voces tem disponiveis?"
Resposta menciona arquivos uploadados: [Sim/Nao]
Planos mencionados: [lista]
Tempo de resposta: [Xs]
Erros: [nenhum / descricao]
```

---

## Teste 5: Consulta ao Agente — Busca Especifica por Tipo de Plano (Scoped Retrieval)

**O que testar:** Quando o usuario menciona um tipo de plano, o agente busca SOMENTE naquele escopo.

**Pre-requisito:** Ter uploadado pelo menos 2 arquivos de tipos diferentes (empresarial + individual).

**Passos:**
1. No mesmo chat ou novo chat, envie: "Quero informacoes sobre o plano empresarial"
2. Verifique se a resposta fala SOMENTE do plano empresarial
3. Envie: "E sobre o plano individual, o que voces oferecem?"
4. Verifique se a resposta fala SOMENTE do plano individual
5. Envie: "Qual a diferenca entre o plano empresarial e o individual?"
6. Verifique se a resposta compara os dois corretamente

**Resultado esperado:** Respostas filtradas por tipo de plano. Na comparacao, ambos sao mencionados com informacoes corretas de cada um.

**Output para reportar:**
```
Pergunta 1: "informacoes sobre plano empresarial"
  Resposta fala so do empresarial: [Sim/Nao]
  Menciona plano individual indevidamente: [Sim/Nao]

Pergunta 2: "plano individual"
  Resposta fala so do individual: [Sim/Nao]
  Menciona plano empresarial indevidamente: [Sim/Nao]

Pergunta 3: "diferenca entre empresarial e individual"
  Compara ambos corretamente: [Sim/Nao]
  Informacoes parecem corretas: [Sim/Nao]

Erros: [nenhum / descricao]
```

---

## Teste 6: Consulta ao Agente — Termos Exatos (Hybrid Search)

**O que testar:** O sistema encontra informacoes por termos exatos (nao apenas por semantica).

**Passos:**
1. Identifique nos PDFs um termo especifico que aparece no documento (ex: um numero de registro ANS, um nome de procedimento, um valor exato como "R$ 450,00")
2. Pergunte ao agente sobre esse termo especifico. Exemplos:
   - "Qual o valor da mensalidade para a faixa de 30-39 anos?"
   - "O plano cobre [procedimento especifico que voce viu no PDF]?"
   - "Qual o periodo de carencia para parto?"
3. Verifique se a resposta traz a informacao exata do documento

**Resultado esperado:** O agente encontra e retorna informacoes com termos exatos que estavam no PDF.

**Output para reportar:**
```
Termo buscado: [termo exato do PDF]
Pergunta feita: [pergunta]
Agente encontrou a informacao: [Sim/Nao/Parcial]
Informacao retornada esta correta: [Sim/Nao]
Erros: [nenhum / descricao]
```

---

## Teste 7: Consulta ao Agente — Informacao Diferenciada Entre Planos Similares

**O que testar:** O cenario critico — quando dois planos tem textos quase identicos mas com valores diferentes.

**Pre-requisito:** Ter 2 arquivos com informacoes similares mas diferentes (ex: multa empresarial vs individual, ou precos diferentes por faixa etaria).

**Passos:**
1. Identifique uma informacao que DIFERE entre os dois planos (ex: preco, multa, carencia)
2. Pergunte especificamente sobre essa informacao para UM dos planos:
   - "Qual a multa por cancelamento do plano empresarial?"
   - "Qual o valor para faixa 30-39 anos no plano individual?"
3. Verifique se a resposta traz o valor CORRETO do plano especificado
4. Faca a mesma pergunta para o OUTRO plano
5. Verifique se os valores sao DIFERENTES (como esperado)

**Resultado esperado:** O agente retorna valores diferentes e corretos para cada plano. Nao mistura informacoes entre eles.

**Output para reportar:**
```
Informacao testada: [ex: multa por cancelamento]

Plano 1 ([tipo]):
  Pergunta: [pergunta]
  Valor esperado (do PDF): [valor]
  Valor retornado pelo agente: [valor]
  Correto: [Sim/Nao]

Plano 2 ([tipo]):
  Pergunta: [pergunta]
  Valor esperado (do PDF): [valor]
  Valor retornado pelo agente: [valor]
  Correto: [Sim/Nao]

Valores sao diferentes entre os planos: [Sim/Nao]
Agente misturou informacoes: [Sim/Nao]
```

---

## Teste 8: Tratamento de Erro — Upload de Arquivo Invalido

**O que testar:** O sistema trata erros de forma elegante.

**Passos:**
1. Tente fazer upload de um arquivo nao suportado (ex: .exe, .zip, .mp3)
   - Resultado esperado: O file picker nao permite selecionar, ou mostra erro
2. Tente fazer upload de um PDF corrompido ou vazio (se tiver um disponivel)
   - Resultado esperado: Erro amigavel, nao trava o wizard

**Output para reportar:**
```
Arquivo invalido: [nome.extensao]
Comportamento: [nao permitiu selecionar / mostrou erro / travou]
Mensagem de erro: [texto da mensagem, se houver]
```

---

## Template de Relatorio Final

Apos executar todos os testes, preencha:

```
=== RELATORIO QA — RAG Level 4 ===
Data: [DD/MM/YYYY]
Testador: [nome]
Ambiente: [URL do frontend]
Navegador: [Chrome/Firefox/Safari + versao]

TESTE 1 — Upload Wizard: [PASSOU / FALHOU / PARCIAL]
TESTE 2 — Arquivo Grande: [PASSOU / FALHOU / PARCIAL / NAO TESTADO]
TESTE 3 — Multiplos Arquivos: [PASSOU / FALHOU / PARCIAL]
TESTE 4 — Busca Geral: [PASSOU / FALHOU / PARCIAL]
TESTE 5 — Scoped Retrieval: [PASSOU / FALHOU / PARCIAL]
TESTE 6 — Hybrid Search: [PASSOU / FALHOU / PARCIAL]
TESTE 7 — Diferenciacao de Planos: [PASSOU / FALHOU / PARCIAL]
TESTE 8 — Tratamento de Erro: [PASSOU / FALHOU / PARCIAL]

BUGS ENCONTRADOS:
1. [descricao + steps para reproduzir]
2. ...

OBSERVACOES GERAIS:
[comentarios livres sobre a experiencia]
```
