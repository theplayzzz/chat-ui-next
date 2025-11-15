# PRD: Agente de Recomendação de Planos de Saúde

## 1. VISÃO GERAL

### 1.1 Objetivo
Desenvolver um assistente especializado (agente) integrado à aplicação Chatbot UI existente que recomenda planos de saúde de forma personalizada e inteligente, utilizando RAG (Retrieval-Augmented Generation) e GPT-4o, disponibilizado apenas para workspaces/contas autorizadas.

### 1.2 Problema
Clientes precisam de orientação especializada para escolher planos de saúde adequados ao seu perfil, considerando:
- Idade, dependentes e condições pré-existentes
- Regras complexas de elegibilidade e cobertura
- Comparação entre múltiplos planos
- Preços atualizados do ERP
- Recomendações justificadas e transparentes

### 1.3 Solução
Um agente conversacional que:
1. Coleta informações do cliente de forma empática e estruturada
2. Consulta base de conhecimento (RAG) com documentos de planos
3. Analisa compatibilidade usando IA (GPT-4o)
4. Consulta preços em tempo real via API do ERP
5. Apresenta recomendação personalizada com justificativa detalhada

### 1.4 Escopo
**Dentro do escopo:**
- Assistente personalizado integrado ao sistema existente
- Sistema RAG para documentos de planos de saúde
- 5 ferramentas (tools) especializadas
- Orquestrador multi-step (5 passos)
- Controle de acesso por workspace
- Interface especializada de chat
- Integração com API ERP (preços)


---

## 2. REQUISITOS FUNCIONAIS

### RF-001: Sistema de Assistente Personalizado
**Descrição:** Criar assistente especializado em planos de saúde que funciona independentemente dos outros assistentes da aplicação, integrando-se ao sistema de chat existente com histórico completo de conversações.

**Critérios de Aceitação:**
- [ ] Assistente aparece na lista de assistentes apenas para workspaces autorizados
- [ ] Usuário consegue selecionar o assistente no chat como qualquer outro assistente
- [ ] Histórico de conversações salvo normalmente na tabela `messages` (tabela existente)
- [ ] Conversas funcionam exatamente como outros assistentes (sem diferenças de UX)
- [ ] Possui configuração específica (prompt, modelo GPT-4o, temperatura)
- [ ] Está associado a Collections RAG de planos de saúde via `assistant_collections`
- [ ] Não interfere com outros assistentes da aplicação
- [ ] Pode ser ativado/desativado por workspace via admin

**Prioridade:** Alta

---

### RF-002: Coleta Estruturada de Informações do Cliente
**Descrição:** Implementar ferramenta que extrai informações do cliente de forma conversacional e estruturada.

**Informações a coletar:**
- Idade do titular
- Dependentes (relação, idade de cada um)
- Condições pré-existentes
- Medicamentos de uso contínuo
- Cidade/região
- Orçamento mensal disponível
- Preferências (rede credenciada, coparticipação, etc.)

**Critérios de Aceitação:**
- [ ] Conversa natural e empática (não formulário)
- [ ] Validação de campos obrigatórios
- [ ] Extração estruturada via GPT-4o (JSON schema)
- [ ] Identificação automática de campos faltantes
- [ ] Salva informações no estado da sessão
- [ ] Permite edição posterior das informações

**Prioridade:** Alta

---

### RF-003: Sistema RAG para Documentos de Planos
**Descrição:** Utilizar infraestrutura de RAG existente (file_items + pgvector + Collections) para armazenar e buscar documentos de planos de saúde organizados em grupos.

**Estrutura de Collections (grupos de documentos):**
- **Collection por Plano**: Um documento para cada plano de saúde específico
- **Collection Geral**: Documentos gerais sobre todos os planos e coberturas
- **Associação**: Assistente vinculado a múltiplas collections via `assistant_collections`

**Documentos suportados:**
- Regulamentos de planos (PDF)
- Tabelas de cobertura
- Regras de elegibilidade
- Exclusões e carências
- Rede credenciada

**Critérios de Aceitação:**
- [ ] Upload de documentos via interface admin existente de Collections
- [ ] Processamento automático com configuração de chunking e overlap:
  - [ ] Tamanho de chunk configurável (padrão: 4000 tokens, ajustável para 500-1000)
  - [ ] Overlap configurável (padrão: 200 tokens, ajustável conforme necessidade)
  - [ ] Interface para ajustar parâmetros de chunking por collection
- [ ] Geração de embeddings OpenAI (1536 dims)
- [ ] Indexação no pgvector (já implementado)
- [ ] Organização em Collections (sistema já existente):
  - [ ] Criar collection para cada plano de saúde
  - [ ] Collection geral com documentos comparativos
  - [ ] Tags/metadata para identificar tipo de collection
- [ ] Busca por similaridade funcional em múltiplas collections
- [ ] Metadata estruturada (plano, operadora, seção, página, collection_id)
- [ ] Re-ranking opcional de resultados

**Prioridade:** Alta

---

### RF-004: Ferramenta de Busca Inteligente (RAG Search em Collections)
**Descrição:** Ferramenta que busca documentos relevantes em múltiplas Collections delegadas ao assistente, permitindo comparação entre diferentes planos.

**Funcionalidades:**
- Construção de query otimizada a partir do perfil do cliente
- **Busca em múltiplas Collections**: Query executada em cada collection separadamente
- **Collections delegadas**: Apenas collections associadas ao assistente via `assistant_collections`
- Busca por similaridade semântica com filtros por metadata
- Top-K configurável por collection (padrão: 10-20 documentos)
- Agregação de resultados de todas as collections
- Re-ranking por relevância global

**Fluxo de Busca:**
```
1. Obter collections do assistente via assistant_collections
2. Para cada collection:
   - Executar busca vetorial com query do perfil
   - Aplicar filtros de metadata (região, operadora, etc.)
   - Retornar top-K resultados
3. Agregar resultados de todas collections
4. Re-ranking global por relevância
5. Retornar resultados consolidados com identificação de collection
```

**Critérios de Aceitação:**
- [ ] Busca apenas em collections delegadas ao assistente
- [ ] Executa query em cada collection separadamente
- [ ] Retorna documentos mais relevantes de cada plano/collection
- [ ] Tempo de busca < 3 segundos para até 10 collections
- [ ] Score de similaridade incluído com identificação de collection de origem
- [ ] Metadata completa incluindo collection_id
- [ ] Integração com função existente `match_file_items_openai` estendida para collections
- [ ] Identificação clara de qual plano/collection cada resultado pertence

**Prioridade:** Alta

---

### RF-005: Ferramenta de Análise e Compatibilidade
**Descrição:** Ferramenta que analisa a compatibilidade entre perfil do cliente e planos disponíveis usando GPT-4o.

**Análises realizadas:**
- Elegibilidade (idade, região, condições)
- Coberturas relevantes ao perfil
- Identificação de exclusões importantes
- Análise de carências
- Score de compatibilidade (0-100)
- Prós e contras de cada plano

**Critérios de Aceitação:**
- [ ] Analisa até 10 planos simultaneamente
- [ ] Retorna ranking por score de compatibilidade
- [ ] Justificativa detalhada para cada score
- [ ] Identifica alertas críticos (exclusões, carências)
- [ ] Análise de cobertura específica para condições declaradas
- [ ] Formato de saída estruturado (JSON)

**Prioridade:** Alta

---

### RF-006: Integração com API ERP (Preços)
**Descrição:** Ferramenta que consulta preços atualizados de planos na API do ERP do cliente.

**Funcionalidades:**
- Consulta preços por IDs de planos
- Cálculo para família (titular + dependentes)
- Inclusão de descontos aplicáveis
- Cache de preços (15 minutos)
- Fallback para preços em cache se API falhar

**Critérios de Aceitação:**
- [ ] Consulta múltiplos planos em uma chamada
- [ ] Timeout de 10 segundos
- [ ] Retry em caso de falha (2 tentativas)
- [ ] Graceful degradation (usa cache se API indisponível)
- [ ] Log de erros de integração
- [ ] Suporte a headers customizados por cliente
- [ ] Preços retornados em formato estruturado

**Prioridade:** Alta

---

### RF-007: Ferramenta de Geração de Recomendação
**Descrição:** Ferramenta que gera a recomendação final em formato humanizado e estruturado.

**Conteúdo da recomendação:**
1. **Recomendação Principal**
   - Melhor plano e justificativa
   - Benefícios específicos para o cliente

2. **Alternativas**
   - Opção econômica
   - Opção premium
   - Justificativas

3. **Comparativo**
   - Tabela comparativa (top 3 planos)
   - Cobertura, preço, diferenciais

4. **Alertas Importantes**
   - Carências
   - Exclusões relevantes
   - Condições especiais

5. **Próximos Passos**
   - Como contratar
   - Documentos necessários
   - Timeline

**Critérios de Aceitação:**
- [ ] Linguagem empática e clara
- [ ] Termos técnicos explicados
- [ ] Formatação em Markdown
- [ ] Tabela comparativa legível
- [ ] Destacamento de informações críticas
- [ ] Tom profissional mas acessível

**Prioridade:** Alta

---

### RF-008: Orquestrador Multi-Step
**Descrição:** Rota API que orquestra os 5 passos do processo de recomendação de forma sequencial e controlada.

**Fluxo de execução:**
```
Step 1: Coleta de Informações
   ↓ (completo quando todos campos obrigatórios preenchidos)
Step 2: Busca RAG
   ↓ (retorna top 10-20 documentos relevantes)
Step 3: Análise de Compatibilidade
   ↓ (retorna top 3 planos ranqueados)
Step 4: Consulta de Preços
   ↓ (busca preços atualizados no ERP)
Step 5: Geração de Recomendação
   ↓ (apresenta recomendação final)
```

**Critérios de Aceitação:**
- [ ] Execução sequencial garantida
- [ ] Estado da sessão persistido entre steps
- [ ] Progresso visível para o usuário
- [ ] Possibilidade de retornar a steps anteriores
- [ ] Timeout total < 60 segundos (Node.js runtime)
- [ ] Streaming de respostas
- [ ] Tratamento de erros em cada step
- [ ] Logs detalhados para debugging

**Prioridade:** Alta

---

### RF-009: Controle de Acesso por Workspace
**Descrição:** Sistema de permissões que libera o assistente apenas para workspaces/contas autorizados.

**Funcionalidades:**
- Lista de workspaces autorizados (configurável)
- Associação assistente ↔ workspace via `assistant_workspaces`
- Verificação automática no frontend
- Interface admin para gerenciar acessos

**Critérios de Aceitação:**
- [ ] Assistente visível apenas em workspaces autorizados
- [ ] Tentativa de acesso não autorizado retorna 403
- [ ] RLS do Supabase garante segurança
- [ ] Admin pode adicionar/remover workspaces autorizados
- [ ] Auditoria de quem tem acesso
- [ ] Sem impacto em outros assistentes

**Prioridade:** Alta

---

### RF-010: Interface Especializada de Chat
**Descrição:** Componente React que melhora a UX durante a interação com o agente de planos de saúde.

**Componentes:**
1. **Progress Bar**: Mostra em qual dos 5 steps o usuário está
2. **Client Info Card**: Resume informações coletadas
3. **Plan Comparison Card**: Tabela comparativa visual
4. **Recommendation Panel**: Apresentação da recomendação final
5. **Edit Button**: Permite editar informações coletadas

**Critérios de Aceitação:**
- [ ] Progress bar atualiza em tempo real
- [ ] Card de info do cliente sempre visível após coleta
- [ ] Tabela comparativa responsiva
- [ ] Botão para editar informações
- [ ] Loading states apropriados
- [ ] Mensagens de erro claras
- [ ] Compatível com design system existente

**Prioridade:** Média

---

### RF-011: Gerenciamento de Collections e Documentos (Admin)
**Descrição:** Estender interface existente de Collections para gerenciar conjuntos de documentos de planos de saúde com controle granular de chunking e gerenciamento completo via frontend.

**BACKEND (✅ IMPLEMENTADO):**
- [x] Extensão da tabela `collections` com campos: `chunk_size`, `chunk_overlap`, `collection_type`
- [x] Sistema de chunking configurável usando LangChain RecursiveCharacterTextSplitter
- [x] Todos os processadores de arquivos (PDF, TXT, MD, DOCX, CSV, JSON) aceitam ChunkConfig
- [x] Endpoint `/api/retrieval/reprocess` para reprocessar arquivos quando configuração muda
- [x] Funções helper em `db/collections.ts`: `createHealthPlanCollection`, `getCollectionsByType`, `updateCollectionChunkConfig`
- [x] Validação de chunk_size e chunk_overlap
- [x] Sistema de Collections existente funcionando

**FRONTEND (⚠️ PENDENTE):**

**1. Interface de Criação de Collections:**
- [ ] Formulário de criação com campos adicionais:
  - [ ] Campo `chunk_size` (número, padrão: 4000, min: 500, max: 8000)
  - [ ] Campo `chunk_overlap` (número, padrão: 200, validação: 0 ≤ overlap < chunk_size)
  - [ ] Dropdown `collection_type`: health_plan, insurance, financial, general
  - [ ] Helper text explicando impacto de cada configuração
- [ ] Preview estimado de quantos chunks serão gerados baseado nos valores
- [ ] Validação em tempo real dos campos

**2. Interface de Edição de Collections:**
- [ ] Modal de edição que permite alterar:
  - [ ] Nome e descrição (já existe)
  - [ ] chunk_size e chunk_overlap (NOVO)
  - [ ] collection_type (NOVO)
- [ ] Botão "Reprocessar Arquivos" que:
  - [ ] Chama `/api/retrieval/reprocess` com collection_id
  - [ ] Mostra progress bar durante reprocessamento
  - [ ] Exibe confirmação: "X arquivos serão reprocessados"
  - [ ] Reprocessa cada arquivo chamando `/api/retrieval/process` para cada file_id
- [ ] Warning ao mudar chunk config: "Arquivos precisarão ser reprocessados"

**3. Visualização de Collections:**
- [ ] Card de collection mostrando:
  - [ ] Nome, descrição, tipo
  - [ ] Chunk config: "Chunks: 2000 tokens (overlap: 300)"
  - [ ] Estatísticas: total de arquivos, total de chunks/embeddings
  - [ ] Status de processamento
- [ ] Lista de arquivos dentro da collection:
  - [ ] Nome do arquivo, tipo, tamanho
  - [ ] Status: "Processado", "Processando", "Erro"
  - [ ] Número de chunks gerados
  - [ ] Ações: Reprocessar, Remover

**4. Gerenciamento de Arquivos Vetorizados:**
- [ ] Interface para visualizar arquivos após vetorização:
  - [ ] Lista de file_items (chunks) por arquivo
  - [ ] Preview do conteúdo de cada chunk
  - [ ] Embedding ID e metadata
- [ ] Busca e filtros por:
  - [ ] Nome do arquivo
  - [ ] Collection
  - [ ] Status de processamento
- [ ] Ações disponíveis:
  - [ ] Remover arquivo da collection (mantém file, remove de collection_files)
  - [ ] Deletar arquivo completamente (deleta file + file_items)
  - [ ] Reprocessar arquivo individual

**5. Delegação de Collections a Assistentes:**
- [ ] Interface de associação Assistant ↔ Collections:
  - [ ] Componente em `create-assistant.tsx` já existe (AssistantRetrievalSelect)
  - [ ] ✅ JÁ FUNCIONA: Seleção de collections ao criar assistente
  - [ ] MELHORAR: Mostrar collection_type e chunk config na seleção
  - [ ] MELHORAR: Filtro por collection_type
  - [ ] ADICIONAR: Badge indicando número de arquivos em cada collection
- [ ] Visualização no perfil do assistente:
  - [ ] Lista de collections delegadas ao assistente
  - [ ] Estatísticas agregadas (total de documentos, chunks)
  - [ ] Botão para adicionar/remover collections

**6. Painel Administrativo de Collections:**
- [ ] Dashboard consolidado (`components/admin/collections-dashboard.tsx`):
  - [ ] Cards de resumo:
    - Total de collections por tipo
    - Total de arquivos processados
    - Total de embeddings/chunks
    - Custos estimados de storage
  - [ ] Gráficos:
    - Collections por tipo (pie chart)
    - Arquivos por collection (bar chart)
    - Timeline de uploads/processamentos
  - [ ] Filtros globais por:
    - collection_type
    - Status de processamento
    - Assistente associado

**Componentes a Criar/Modificar:**
```
components/
├── collections/
│   ├── collection-create-form.tsx          (NOVO - form com chunk config)
│   ├── collection-edit-modal.tsx           (NOVO - edição + reprocessing)
│   ├── collection-card.tsx                 (NOVO - exibe config e stats)
│   ├── collection-file-list.tsx            (NOVO - lista files com chunks)
│   ├── reprocess-button.tsx                (NOVO - botão reprocessar)
│   └── chunk-config-preview.tsx            (NOVO - preview de chunking)
├── sidebar/items/collections/
│   ├── create-collection.tsx               (MODIFICAR - adicionar campos)
│   └── update-collection.tsx               (MODIFICAR - chunk config)
├── sidebar/items/assistants/
│   ├── assistant-retrieval-select.tsx      (MODIFICAR - mostrar type/config)
│   └── create-assistant.tsx                (OK - já funciona)
└── admin/
    └── collections-dashboard.tsx           (NOVO - painel admin)
```

**Critérios de Aceitação:**
- [ ] Usuário consegue criar collection configurando chunk_size, chunk_overlap, collection_type
- [ ] Usuário consegue editar collection existente e seus parâmetros de chunk
- [ ] Ao mudar chunk config, sistema oferece botão de reprocessamento
- [ ] Reprocessamento mostra progress e status por arquivo
- [ ] Usuário visualiza lista de arquivos dentro de uma collection
- [ ] Usuário visualiza chunks/embeddings gerados de cada arquivo
- [ ] Usuário consegue adicionar/remover arquivos de collections
- [ ] AssistantRetrievalSelect mostra collection_type e configurações
- [ ] Dashboard admin mostra estatísticas agregadas de todas collections
- [ ] Interface responsiva e segue design system existente
- [ ] Loading states apropriados em todas operações assíncronas
- [ ] Mensagens de erro claras e acionáveis

**Prioridade:** Alta (backend completo, frontend necessário para usar funcionalidade)

---

### RF-012: Sistema de Auditoria
**Descrição:** Registro de todas as recomendações geradas para fins de compliance e análise.

**Informações registradas:**
- Timestamp da consulta
- Workspace/usuário
- Informações do cliente (anonimizadas se necessário)
- Planos analisados
- Plano recomendado
- Justificativa completa
- Preços consultados

**Critérios de Aceitação:**
- [ ] Registro automático de cada recomendação
- [ ] Dados criptografados em repouso
- [ ] Retenção configurável (default: 2 anos)
- [ ] Interface para consulta de histórico
- [ ] Exportação para análise
- [ ] Compliance com LGPD

**Prioridade:** Média

---

### RF-013: Monitoramento e Observabilidade com LangSmith
**Descrição:** Implementar monitoramento completo do agente usando LangSmith SDK para rastreamento, análise de performance e debugging.

**Funcionalidades:**
- Rastreamento de todas as chamadas LLM (GPT-4o)
- Tracking de cada step do orquestrador
- Monitoramento de latência por ferramenta
- Registro de prompts e respostas completas
- Análise de custos em tempo real
- Debugging de erros e exceções
- Dashboards de performance

**Métricas rastreadas:**
- Tempo de execução por step
- Tokens consumidos por operação
- Taxa de sucesso/erro
- Qualidade das recomendações (via feedback)
- Custos por consulta
- Collections mais consultadas

**Integração:**
```typescript
import { LangSmith } from "langsmith"

const client = new LangSmith({
  apiKey: process.env.LANGSMITH_API_KEY
})

// Rastrear cada step do orquestrador
await client.traceLangChain({
  name: "health-plan-recommendation",
  run_type: "chain",
  inputs: { clientInfo },
  outputs: { recommendation }
})
```

**Critérios de Aceitação:**
- [ ] SDK LangSmith configurado no projeto
- [ ] Rastreamento automático de todas operações LLM
- [ ] Tracking de cada step do orquestrador
- [ ] Logs estruturados com contexto completo
- [ ] Dashboard no LangSmith mostrando métricas
- [ ] Alertas configurados para erros e timeouts
- [ ] Análise de custos por workspace
- [ ] Integração com sistema de auditoria existente

**Prioridade:** Alta

---

## 3. REQUISITOS NÃO-FUNCIONAIS

### RNF-001: Performance
- Tempo total de execução < 60 segundos
- Step individual < 15 segundos
- Busca RAG < 3 segundos
- API ERP < 10 segundos
- Interface responsiva (< 100ms interações)

### RNF-002: Escalabilidade
- Suportar 100 consultas simultâneas
- 1000 documentos no banco vetorial
- 50+ planos de saúde
- Múltiplos workspaces autorizados

### RNF-003: Disponibilidade
- Uptime 99.5%
- Graceful degradation (cache se ERP falhar)
- Mensagens de erro claras
- Retry automático em falhas temporárias

### RNF-004: Segurança
- HTTPS obrigatório
- API keys por workspace
- RLS no Supabase
- Criptografia de dados sensíveis
- Compliance LGPD
- Logs de auditoria

### RNF-005: Custos
- Custo por consulta < $0.05 (GPT-4o)
- Cache de preços ERP (reduzir chamadas)
- Otimização de prompts (tokens)
- Monitoramento de custos

### RNF-006: Manutenibilidade
- Código TypeScript com types
- Testes unitários (> 70% coverage)
- Testes de integração
- Documentação de APIs
- Logs estruturados

---

## 4. ARQUITETURA TÉCNICA

### 4.1 Stack Tecnológica
- **Runtime**: Node.js (Vercel, maxDuration: 60s)
- **Framework**: Next.js 14 (App Router)
- **Linguagem**: TypeScript
- **LLM**: GPT-4o (OpenAI)
- **Vector DB**: Supabase pgvector
- **Embeddings**: OpenAI text-embedding-3-small (1536 dims)
- **Collections**: Sistema existente de Collections (agrupamento de documentos)
- **Chunking**: LangChain RecursiveCharacterTextSplitter (configurável)
- **Streaming**: Vercel AI SDK
- **Monitoramento**: LangSmith SDK
- **Hosting**: Vercel Pro

### 4.2 Novos Componentes

#### Backend
```
/app/api/chat/health-plan-agent/
  └─ route.ts (orquestrador)

/lib/tools/health-plan/
  ├─ extract-client-info.ts
  ├─ search-health-plans.ts
  ├─ analyze-compatibility.ts
  ├─ fetch-erp-prices.ts
  └─ generate-recommendation.ts

/lib/health-plan/
  ├─ orchestrator.ts
  ├─ session-manager.ts
  └─ types.ts
```

#### Frontend
```
/components/health-plan/
  ├─ health-plan-chat.tsx
  ├─ progress-indicator.tsx
  ├─ client-info-card.tsx
  ├─ plan-comparison.tsx
  └─ recommendation-panel.tsx

/components/admin/
  └─ health-plan-documents.tsx
```

#### Database
```sql
-- Nova tabela para auditoria
CREATE TABLE health_plan_recommendations (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  user_id UUID,
  client_info JSONB,
  analyzed_plans JSONB,
  recommended_plan JSONB,
  reasoning TEXT,
  langsmith_run_id TEXT, -- ID do trace no LangSmith
  created_at TIMESTAMP
);

-- Estender collections existentes para suportar configuração de chunking
ALTER TABLE collections ADD COLUMN chunk_size INT DEFAULT 4000;
ALTER TABLE collections ADD COLUMN chunk_overlap INT DEFAULT 200;
ALTER TABLE collections ADD COLUMN collection_type TEXT; -- 'health_plan', 'general', etc.

-- Índice para metadata de documentos de planos
ALTER TABLE file_items ADD COLUMN plan_metadata JSONB;
CREATE INDEX idx_file_items_plan_metadata ON file_items USING gin(plan_metadata);

-- Tabelas existentes que serão utilizadas:
-- - collections: Agrupamento de documentos
-- - collection_files: Relação collection ↔ files
-- - assistant_collections: Relação assistente ↔ collections
-- - file_items: Chunks vetorizados (já existe com embeddings)
```

### 4.3 Fluxo de Dados

```
User Input (Chat)
      ↓
Frontend (health-plan-chat.tsx)
      ↓
API Route (/api/chat/health-plan-agent)
      ↓
Orchestrator (5 steps)
      ↓
┌─────────────────────────┐
│ Step 1: extractClientInfo │ → GPT-4o
│ Step 2: searchHealthPlans │ → Supabase pgvector
│ Step 3: analyzePlans      │ → GPT-4o
│ Step 4: fetchERPPrices    │ → External API
│ Step 5: generateReport    │ → GPT-4o
└─────────────────────────┘
      ↓
Session State (Supabase)
      ↓
Audit Log (Supabase)
      ↓
Streaming Response
      ↓
Frontend (formatted display)
```

---

## 5. ESTIMATIVAS

### 5.1 Tempo de Desenvolvimento

| Fase | Duração | Complexidade |
|------|---------|--------------|
| **Fase 1: Setup & RAG** | 1 semana | Média |
| - Estrutura de tabelas | 1 dia | Baixa |
| - Upload e processamento de PDFs | 2 dias | Média |
| - Testes de busca vetorial | 2 dias | Média |
| | | |
| **Fase 2: Ferramentas (Tools)** | 1 semana | Média |
| - extractClientInfo | 1 dia | Baixa |
| - searchHealthPlans | 1 dia | Baixa |
| - analyzePlans | 2 dias | Média |
| - fetchERPPrices | 1 dia | Baixa |
| - generateRecommendation | 2 dias | Média |
| | | |
| **Fase 3: Orquestrador & API** | 1 semana | Alta |
| - Rota API principal | 2 dias | Média |
| - Orquestrador de steps | 2 dias | Alta |
| - Gerenciamento de sessão | 1 dia | Média |
| - Testes de integração | 2 dias | Média |
| | | |
| **Fase 4: Frontend & UX** | 1 semana | Média |
| - Componentes especializados | 3 dias | Média |
| - Interface admin | 2 dias | Baixa |
| - Testes e ajustes | 2 dias | Média |
| | | |
| **Fase 5: Controle de Acesso** | 3 dias | Baixa |
| - Implementação de permissões | 1 dia | Baixa |
| - Interface de gerenciamento | 1 dia | Baixa |
| - Testes de segurança | 1 dia | Média |
| | | |
| **Fase 6: Auditoria & Compliance** | 2 dias | Baixa |
| - Sistema de logs | 1 dia | Baixa |
| - Interface de consulta | 1 dia | Baixa |
| | | |
| **Fase 7: Testes & Deploy** | 3 dias | Média |
| - Testes end-to-end | 1 dia | Média |
| - Ajuste fino de prompts | 1 dia | Média |
| - Deploy e monitoramento | 1 dia | Baixa |

**Total: 24 dias úteis (≈ 5 semanas)**

### 5.2 Custos Estimados

#### Desenvolvimento
- Desenvolvimento: 24 dias × $500/dia = **$12,000**
- Design/UX: 3 dias × $400/dia = **$1,200**
- QA/Testes: 5 dias × $350/dia = **$1,750**
- **Total desenvolvimento: $14,950**

#### Operacional (mensal)
- Vercel Pro: $20/mês
- OpenAI API (100 consultas/dia × $0.04): $120/mês
- Supabase (plano atual): $0-25/mês
- LangSmith (plano Team): $39/mês (até 10M traces)
- **Total operacional: ~$179-184/mês**

#### Por Volume de Consultas
- 100 consultas/dia: $120/mês em API
- 500 consultas/dia: $600/mês em API
- 1000 consultas/dia: $1,200/mês em API

---

## 6. MÉTRICAS DE SUCESSO

### 6.1 Métricas de Produto
- **Adoção**: 50% dos workspaces autorizados usam o assistente em 30 dias
- **Engajamento**: 70% das sessões chegam até a recomendação final
- **Satisfação**: NPS > 8 de usuários que receberam recomendação
- **Precisão**: 85% dos usuários concordam que a recomendação faz sentido

### 6.2 Métricas Técnicas
- **Performance**: 95% das consultas completam em < 60s
- **Disponibilidade**: Uptime > 99.5%
- **Erro**: Taxa de erro < 2%
- **Custo**: Custo por consulta < $0.05

### 6.3 Métricas de Negócio
- **Conversão**: 30% dos usuários solicitam contato após recomendação
- **Tempo**: Redução de 70% no tempo de atendimento vs. manual
- **Qualidade**: 90% de precisão em recomendações (validado por especialista)

---

## 7. RISCOS E MITIGAÇÕES

### Risco 1: Timeout do Vercel (60s)
**Probabilidade:** Média
**Impacto:** Alto
**Mitigação:**
- Otimização de prompts (reduzir tokens)
- Cache agressivo de resultados
- Paralelização de chamadas quando possível
- Monitoramento de tempo por step
- Plano B: migrar para Vercel Enterprise (300s) se necessário

### Risco 2: Qualidade das Recomendações
**Probabilidade:** Média
**Impacto:** Alto
**Mitigação:**
- Validação com especialistas em planos de saúde
- A/B testing de prompts
- Feedback loop com usuários
- Ajuste fino contínuo
- Revisão humana em casos complexos

### Risco 3: API ERP Instável
**Probabilidade:** Média
**Impacto:** Médio
**Mitigação:**
- Cache de preços (15 min)
- Retry automático
- Graceful degradation
- Alertas de indisponibilidade
- Preços estimados como fallback

### Risco 4: Custos de API OpenAI
**Probabilidade:** Baixa
**Impacto:** Médio
**Mitigação:**
- Monitoramento em tempo real
- Limites por workspace
- Otimização de prompts
- Cache de análises similares
- Alertas de custo

### Risco 5: Compliance LGPD
**Probabilidade:** Baixa
**Impacto:** Alto
**Mitigação:**
- Consultoria jurídica
- Anonimização de dados sensíveis
- Consentimento explícito
- Auditoria completa
- Política de retenção

### Risco 6: Documentos Desatualizados
**Probabilidade:** Alta
**Impacto:** Alto
**Mitigação:**
- Processo de atualização mensal
- Versionamento de documentos
- Data de última atualização visível
- Alertas de desatualização
- Interface fácil de upload

---

## 8. FASES DE ROLLOUT

### Fase 1: Alpha (Semana 1-2)
- Deploy interno
- Testes com 1-2 planos
- Validação técnica
- Ajustes de arquitetura

### Fase 2: Beta (Semana 3-4)
- 2-3 workspaces piloto
- Todos os planos carregados
- Coleta de feedback
- Ajuste de prompts

### Fase 3: Produção Limitada (Semana 5-6)
- 10 workspaces autorizados
- Monitoramento intensivo
- Suporte dedicado
- Documentação completa

### Fase 4: Produção Geral (Semana 7+)
- Rollout para todos workspaces autorizados
- Monitoramento normal
- Otimização contínua
- Expansão de funcionalidades

---

## 9. DEPENDÊNCIAS

### Dependências Técnicas
- ✅ Infraestrutura Supabase existente
- ✅ Sistema de assistentes funcionando
- ✅ Sistema de Collections implementado
- ✅ Chunking configurável (LangChain + RecursiveCharacterTextSplitter)
- ✅ pgvector configurado
- ✅ OpenAI API key configurada
- ⚠️ LangSmith API key (criar conta)
- ⚠️ API ERP do cliente (documentação necessária)
- ⚠️ Upgrade Vercel para Pro (caso Free tier)

### Dependências de Negócio
- Documentos de planos de saúde (PDFs)
- Lista de workspaces autorizados
- Credenciais da API ERP
- Validação jurídica (LGPD)
- Aprovação de custos operacionais

### Dependências de Produto
- Especificação exata de campos do cliente
- Regras de negócio para recomendação
- Critérios de score de compatibilidade
- Definição de "melhor plano"
- Templates de recomendação

---

## 10. DOCUMENTAÇÃO NECESSÁRIA

### Documentação Técnica
- [ ] API Reference (endpoints, schemas)
- [ ] Guia de integração ERP
- [ ] Arquitetura de ferramentas
- [ ] Fluxo de dados detalhado
- [ ] Guia de deployment

### Documentação de Usuário
- [ ] Manual do administrador
- [ ] Guia de uso do assistente
- [ ] FAQ
- [ ] Vídeos tutoriais
- [ ] Troubleshooting

### Documentação de Compliance
- [ ] Política de privacidade
- [ ] Termos de uso
- [ ] Consentimento LGPD
- [ ] Auditoria de segurança
- [ ] Plano de retenção de dados

---

## 11. PRÓXIMOS PASSOS

### Aprovação Necessária
- [ ] Aprovação do PRD pelo time de produto
- [ ] Aprovação de orçamento
- [ ] Aprovação jurídica (LGPD)
- [ ] Definição de workspaces piloto

### Preparação Técnica
- [ ] Setup de ambiente de desenvolvimento
- [ ] Obtenção de documentos de planos (PDFs)
- [ ] Credenciais e documentação API ERP
- [ ] Upgrade Vercel para Pro (se necessário)

### Kick-off
- [ ] Reunião de alinhamento técnico
- [ ] Definição de sprint planning
- [ ] Setup de ferramentas de projeto
- [ ] Criação de tasks no Task Master

---

## 12. CONTATOS

**Product Owner:** [Nome]
**Tech Lead:** [Nome]
**Designer:** [Nome]
**QA Lead:** [Nome]
**Stakeholders:** [Nomes]

---

## 13. HISTÓRICO DE REVISÕES

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2025-11-10 | Claude Code | Versão inicial do PRD |
| 1.1 | 2025-11-10 | Claude Code | Atualização: Collections, chunking configurável, LangSmith, histórico de chat |
| 1.2 | 2025-11-14 | Claude Code | Expansão de RF-011: Detalhamento completo de requisitos frontend para gerenciamento de Collections (criação, edição, visualização, reprocessamento, delegação a assistentes, dashboard admin) |

---

## 14. APÊNDICES

### A. Exemplo de Interação

```
👤 Usuário: Olá, preciso de ajuda para escolher um plano de saúde

🤖 Assistente: Olá! Eu sou especialista em planos de saúde e vou te
ajudar a encontrar a melhor opção para você. Para começar, preciso
conhecer um pouco sobre você. Quantos anos você tem?

👤 Usuário: Tenho 35 anos

🤖 Assistente: Entendi. E você vai incluir dependentes no plano?

👤 Usuário: Sim, minha esposa de 32 anos e meu filho de 5 anos

🤖 Assistente: Perfeito! Algum de vocês tem alguma condição de saúde
pré-existente ou usa algum medicamento de forma contínua?

👤 Usuário: Minha esposa tem diabetes tipo 2

🤖 Assistente: Obrigado por compartilhar. Isso é importante para
encontrar um plano com a cobertura adequada. Vocês moram em qual cidade?

[... continua coletando informações ...]

🤖 Assistente: Ótimo! Agora vou analisar os planos disponíveis para
o seu perfil. Um momento...

[Progress: Analisando planos compatíveis... ⏳]

🤖 Assistente: Pronto! Encontrei 3 planos que se encaixam perfeitamente
no seu caso. O plano que mais recomendo para você é o **Plano Vida+ Família**.

Vou explicar o porquê...

[Apresenta recomendação completa]
```

### B. Schema de Dados

#### ClientInfo
```typescript
interface ClientInfo {
  age: number
  dependents: Array<{
    relationship: 'spouse' | 'child' | 'parent' | 'other'
    age: number
  }>
  preExistingConditions: string[]
  medications: string[]
  city: string
  state: string
  budget: number
  preferences: {
    networkType?: 'broad' | 'restricted'
    coParticipation?: boolean
    specificHospitals?: string[]
  }
}
```

#### PlanAnalysis
```typescript
interface PlanAnalysis {
  planId: string
  planName: string
  provider: string
  score: number // 0-100
  pros: string[]
  cons: string[]
  alerts: Array<{
    type: 'carencia' | 'exclusao' | 'limitacao'
    severity: 'high' | 'medium' | 'low'
    description: string
  }>
  coverageAnalysis: {
    general: string
    specificConditions: Record<string, string>
  }
  pricing?: {
    monthly: number
    setup?: number
    coParticipation?: string
  }
}
```

### C. Glossário

- **RAG (Retrieval-Augmented Generation):** Técnica que combina busca em base de conhecimento com geração de texto por IA
- **Embedding:** Representação vetorial de texto usada para busca semântica
- **pgvector:** Extensão PostgreSQL para armazenar e buscar vetores
- **Collection:** Agrupamento lógico de documentos relacionados (ex: todos documentos de um plano específico)
- **Chunking:** Processo de dividir documentos grandes em pedaços menores para processamento
- **Chunk Overlap:** Quantidade de sobreposição entre chunks consecutivos para manter contexto
- **Function Calling:** Capacidade de LLMs de invocar ferramentas externas
- **Orquestrador:** Componente que coordena a execução de múltiplos passos
- **Tool:** Ferramenta ou função que o LLM pode invocar
- **Workspace:** Espaço de trabalho isolado na aplicação (multi-tenant)
- **RLS (Row Level Security):** Segurança a nível de linha no banco de dados
- **Score de Compatibilidade:** Métrica 0-100 que indica quão bem um plano atende o perfil
- **LangSmith:** Plataforma de observabilidade para aplicações LLM (rastreamento, debugging, análise)

---

**Fim do PRD**
