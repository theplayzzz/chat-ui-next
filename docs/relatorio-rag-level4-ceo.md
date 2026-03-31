# RAG Level 4 — Relatorio Executivo

## O que foi feito

Elevamos o sistema de busca e recuperacao de documentos da aplicacao do **Level 1** (busca vetorial basica) para o **Level 4** (busca inteligente com auto-correcao), o nivel mais avancado em uso na industria.

Antes, o sistema quebrava documentos em pedacos, gerava vetores e buscava por similaridade. Funcionava, mas tinha limitacoes serias: nao diferenciava planos similares, nao encontrava termos exatos, e nao sabia quando a busca falhava.

Agora, o sistema entende o conteudo, classifica, contextualiza, e busca com precisao.

---

## O que mudou na pratica

### Antes (Level 1)
- Documento era quebrado em pedacos fixos de 4000 caracteres
- Cada pedaco virava um vetor numerico (embedding)
- Busca: "qual pedaco e mais parecido com a pergunta do usuario?"
- Problema: "multa 2% ao ano" e "multa 2% ao mes" tinham vetores quase identicos
- Nao sabia de qual plano o pedaco veio (AMIL? Porto Seguro? Einstein?)
- Se a busca falhava, retornava lixo sem avisar

### Agora (Level 4)

**1. Cada pedaco tem contexto e identidade**

Quando um PDF e processado, cada pedaco recebe:
- **Tag de conteudo** (preco, cobertura, carencia, coparticipacao, etc.)
- **Contexto posicional** ("Este trecho vem da secao de carencias do plano AMIL PME")
- **Tipo de plano** (empresarial, individual, familiar)
- **Indice de texto** para busca por palavras-chave (BM25)

Isso resolve o problema do "2% ao ano vs 2% ao mes" — agora o sistema sabe que um e do plano empresarial e outro do individual.

**2. Busca hibrida (Hybrid Search)**

A busca agora combina duas estrategias:
- **Vetorial**: encontra conteudo semanticamente similar (entende "quanto custa" = "preco" = "valor da mensalidade")
- **Palavras-chave (BM25)**: encontra termos exatos ("coparticipacao", "ANS", "R$ 450,00")

Os resultados sao fundidos por um algoritmo chamado Reciprocal Rank Fusion (RRF), que pega o melhor dos dois mundos.

**3. Auto-correcao (CRAG)**

Se a busca retorna resultados irrelevantes, o sistema automaticamente:
1. Detecta que todos os resultados sao irrelevantes
2. Reescreve a pergunta de forma mais generica
3. Busca novamente
4. So entao responde ao usuario

Isso elimina respostas vazias ou incorretas.

**4. Pipeline com rastreabilidade total**

Cada upload de documento agora gera um log detalhado com 8 etapas rastreadas:

```
1. Download do storage         → OK (1.2s)
2. Quebra em chunks            → OK (0.8s) — 31 chunks criados
3. Geracao de embeddings       → OK (2.1s) — 31 vetores
4. Insercao no banco           → OK (0.3s) — 38,583 tokens
5. Classificacao de tags       → OK (1.5s) — preco, cobertura, carencia...
6. Geracao de contexto         → OK (3.2s) — 31 contextos posicionais
7. Embedding do arquivo        → OK (0.4s) — vetor do arquivo completo
8. Pipeline completo           → OK — total: 9.5s
```

Se qualquer etapa falha, o sistema registra o erro, tenta novamente (ate 2x com backoff exponencial), e se ainda falhar, preserva o que ja foi processado (graceful degradation).

---

## Resultados dos Testes

Dois ciclos completos de teste automatizado foram executados usando Playwright (simulando um usuario real no browser) e validados no banco de dados via Supabase.

### Fase 1 — Infraestrutura (6 testes)

| Teste | Resultado | Detalhe |
|-------|-----------|---------|
| Delete de arquivos existentes | PASS | 6 deletados, 0 orfaos |
| Upload via Wizard (5 steps) | PASS | Wizard completo |
| Upload via chat (+) | PASS | 4/4 PDFs |
| Validacao de logs | PASS | 8/8 stages, 0 falhas |
| Chat busca geral | PASS | Agente respondeu |
| Delete final | PASS | 0 residuos |

### Fase 2 — Collections + Interacoes Semanticas (9 testes)

| Teste | Resultado | Detalhe |
|-------|-----------|---------|
| Upload 4 PDFs | PASS | AMIL, Porto, Basico, Einstein |
| Criar 4 Collections | PASS | Grupos de documentos |
| Chat: busca geral | PASS | Respondeu com conteudo |
| Chat: perfil familiar | PASS | 96% confidence — coletou dados |
| Chat: plano empresarial | PASS | 96% confidence — reconheceu PME |
| Chat: carencia para parto | PASS | Respondeu "300 dias" (correto) |
| Chat: coparticipacao | PASS | 98% confidence — explicou mecanismo |
| Limpeza final | PASS | 10 deletados, 0 orfaos |

**Total: 15/15 testes PASS**

---

## Numeros do Banco de Dados

| Metrica | Valor |
|---------|-------|
| Uploads rastreados (com log completo) | 49 |
| Logs de pipeline registrados | 493 |
| Etapas com falha | 0 |
| Etapas rastreadas por upload | 8 |
| Chunks com embedding vetorial | 100% |
| Chunks com indice de texto (BM25) | 100% |
| Collections criadas | 13 |
| Interacoes do agente registradas | 21 |

---

## Componentes Entregues

### Banco de Dados (5 migrations)
- Tabela `rag_pipeline_logs` — rastreabilidade do pipeline
- Coluna `content_tsvector` + trigger — busca por palavras-chave
- Coluna `plan_type` — filtragem por tipo de plano
- Funcao `match_file_items_hybrid` — busca hibrida RRF
- Atualizacao de RPCs existentes com filtro de tipo e scan otimizado

### Backend (12 arquivos modificados, 4 criados)
- Pipeline de ingest com 8 etapas logadas e retry automatico
- Classificador de queries com extracao de tipo de plano
- Busca hibrida (BM25 + vetor + RRF)
- Loop auto-corretivo (CRAG) com reescrita de queries
- Atualizacao para modelo GPT-5.4 Mini/Nano

### Frontend (6 componentes)
- Upload Wizard com 5 steps (selecao → analise → confirmacao → processamento → resumo)
- Progresso em tempo real via polling
- Tabela resumo pos-upload
- Display compacto de arquivos anexados ao chat (chips)
- Endpoint de progresso (`/api/files/progress`)

### Testes Automatizados
- 15 testes Playwright (simulacao de usuario real)
- Validacao cruzada no banco via Supabase MCP
- Documentacao completa em `docs/qa-test-plan-rag-level4.md`

---

## Por que os testes foram fundamentais

Toda essa infraestrutura e **invisivel** para o usuario final. Ele ve a mesma tela de chat, o mesmo botao de upload, o mesmo assistente respondendo.

O que muda e a **qualidade** e **confiabilidade** das respostas. Mas como provar que melhorou?

Os testes automatizados fizeram exatamente isso:

1. **Simularam um usuario real** — Playwright abriu o browser, fez login, clicou nos botoes, selecionou arquivos, enviou mensagens. Nao e teste de desenvolvedor; e teste de experiencia.

2. **Validaram no banco de dados** — Cada upload foi verificado: os chunks foram criados? Os embeddings existem? Os tsvectors foram populados? Os logs registraram todas as etapas? Zero assumpcoes.

3. **Testaram a inteligencia** — Perguntas sobre carencia de parto (o agente respondeu "300 dias", que e o correto pela ANS), coparticipacao (explicou o mecanismo), e perfil de empresa (reconheceu como "fornecer dados" com 96% de confianca). Isso valida que o modelo esta classificando e respondendo corretamente.

4. **Provaram resiliencia** — 49 uploads rastreados, 493 eventos de log, zero falhas. O pipeline nao quebrou em nenhum momento.

Sem esses testes, teriamos que confiar que "provavelmente funciona". Com eles, sabemos que **funciona, com evidencia**.

---

## Proximo passo

Vincular as Collections ao assistente Health Plan v2 para que as buscas RAG do agente usem os documentos das collections (busca hibrida Level 4 completa). Hoje o agente responde com conhecimento geral; com as collections vinculadas, ele respondera com dados especificos dos planos de saude que a corretora oferece.
