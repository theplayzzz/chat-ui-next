# Planejamento de Execução - Tarefa 2
## Estender Schema do Banco para Sistema de Recomendações Multi-Nicho

---

## 📋 Visão Geral

**Objetivo:** Criar infraestrutura de banco de dados para suportar sistema genérico de recomendações que comece com agente de planos de saúde mas permita expansão para outros nichos.

**Prioridade:** Alta
**Status:** Pendente
**Dependências:** Tarefa 1 (Configurar ambiente básico do agente)

---

## 🎯 Subtarefas e Sequência de Execução

### **Subtarefa 2.1: Analisar Schema Atual e Planejar Mudanças**
**Ordem:** 1ª
**Dependências:** Nenhuma
**Estimativa:** 30-45 minutos

**Ações:**
- Mapear estrutura atual das tabelas: `collections`, `file_items`, `assistant_collections`, `assistant_workspaces`
- Identificar todas as foreign keys e constraints existentes
- Documentar relacionamentos e dependências
- Definir ordem segura de execução das migrations
- Validar compatibilidade com sistema atual

**Entregáveis:**
- Diagrama ERD do schema atual
- Documento com sequência de migrations
- Lista de riscos identificados

**Validação:**
```sql
-- Queries para mapear schema atual
SELECT * FROM information_schema.tables WHERE table_schema = 'public';
SELECT * FROM information_schema.columns WHERE table_name IN ('collections', 'file_items');
SELECT * FROM information_schema.table_constraints;
```

---

### **Subtarefa 2.2: Estender Tabela Collections**
**Ordem:** 2ª
**Dependências:** Subtarefa 2.1
**Estimativa:** 20-30 minutos

**Ações:**
- Criar migration para adicionar 3 novas colunas em `collections`
- Implementar constraints de validação
- Definir valores padrão apropriados
- Criar índice para `collection_type`

**SQL a Executar:**
```sql
ALTER TABLE collections
  ADD COLUMN chunk_size INT DEFAULT 4000 CHECK (chunk_size > 0),
  ADD COLUMN chunk_overlap INT DEFAULT 200 CHECK (chunk_overlap >= 0 AND chunk_overlap < chunk_size),
  ADD COLUMN collection_type TEXT CHECK (collection_type IN ('health_plan', 'insurance', 'financial', 'general'));

CREATE INDEX idx_collections_type ON collections(collection_type);
```

**Validação:**
- Verificar colunas criadas com valores padrão
- Testar constraints com valores válidos e inválidos
- Confirmar índice criado com `EXPLAIN ANALYZE`

---

### **Subtarefa 2.3: Estender Tabela File Items**
**Ordem:** 3ª (pode ser executada em paralelo com 2.2)
**Dependências:** Subtarefa 2.1
**Estimativa:** 15-20 minutos

**Ações:**
- Adicionar coluna JSONB `plan_metadata` em `file_items`
- Criar constraint de validação para JSON válido
- Implementar índice GIN para performance de queries JSONB

**SQL a Executar:**
```sql
ALTER TABLE file_items
  ADD COLUMN plan_metadata JSONB,
  ADD CONSTRAINT valid_plan_metadata
    CHECK (jsonb_typeof(plan_metadata) = 'object' OR plan_metadata IS NULL);

CREATE INDEX idx_file_items_plan_metadata ON file_items USING gin(plan_metadata);
```

**Validação:**
- Testar inserção de JSON válido
- Testar rejeição de JSON inválido via constraint
- Verificar performance do índice GIN com queries

---

### **Subtarefa 2.4: Criar Tabelas do Sistema de Recomendações**
**Ordem:** 4ª (pode ser executada em paralelo com 2.2 e 2.3)
**Dependências:** Subtarefa 2.1
**Estimativa:** 30-40 minutos

**Ações:**
- Criar tabela `recommendation_systems`
- Criar tabela `client_recommendations`
- Implementar todas as foreign keys
- Adicionar constraints de validação

**SQL a Executar:**
```sql
-- Tabela de Sistemas de Recomendação
CREATE TABLE recommendation_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  config_schema JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Tabela de Recomendações para Clientes
CREATE TABLE client_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_system_id UUID NOT NULL REFERENCES recommendation_systems(id),
  client_info JSONB NOT NULL,
  analyzed_data JSONB,
  recommended_item JSONB,
  reasoning TEXT NOT NULL,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  langsmith_run_id TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

**Validação:**
- Confirmar tabelas criadas
- Testar foreign keys com dados de workspaces e users existentes
- Validar constraints de `confidence_score` (0-1)
- Validar constraint de `status` (active/archived/superseded)

---

### **Subtarefa 2.5: Criar Índices Otimizados**
**Ordem:** 5ª
**Dependências:** Subtarefas 2.2, 2.3, 2.4
**Estimativa:** 15-20 minutos

**Ações:**
- Criar todos os índices necessários para otimizar queries frequentes
- Focar em colunas usadas em filtros e ordenação
- Implementar índices compostos onde apropriado

**SQL a Executar:**
```sql
-- Índices para client_recommendations
CREATE INDEX idx_client_recommendations_workspace ON client_recommendations(workspace_id);
CREATE INDEX idx_client_recommendations_user ON client_recommendations(user_id);
CREATE INDEX idx_client_recommendations_system ON client_recommendations(recommendation_system_id);
CREATE INDEX idx_client_recommendations_status ON client_recommendations(status);
CREATE INDEX idx_client_recommendations_confidence ON client_recommendations(confidence_score DESC);
```

**Validação:**
```sql
-- Testar performance com EXPLAIN ANALYZE
EXPLAIN ANALYZE SELECT * FROM client_recommendations
WHERE workspace_id = 'some-uuid' AND status = 'active'
ORDER BY confidence_score DESC LIMIT 10;
```

---

### **Subtarefa 2.6: Inserir Dados Iniciais e Validar Sistema**
**Ordem:** 6ª (final)
**Dependências:** Subtarefas 2.4, 2.5
**Estimativa:** 30-45 minutos

**Ações:**
- Inserir registro inicial do sistema `health_plan_agent`
- Criar triggers para `updated_at`
- Executar bateria completa de testes
- Validar performance e integridade

**SQL a Executar:**
```sql
-- Inserir sistema inicial
INSERT INTO recommendation_systems (system_name, description, config_schema)
VALUES (
  'health_plan_agent',
  'Sistema de recomendação de planos de saúde',
  '{"required_fields": ["age", "location", "coverage_type"], "optional_fields": ["income", "family_size", "medical_history"]}'::jsonb
);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_recommendation_systems_updated_at
  BEFORE UPDATE ON recommendation_systems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_recommendations_updated_at
  BEFORE UPDATE ON client_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Testes de Validação:**
1. Inserir dados de exemplo em `client_recommendations`
2. Testar constraints com dados inválidos
3. Verificar triggers de `updated_at` funcionando
4. Executar testes de performance com queries complexas
5. Validar suporte para múltiplos nichos simultaneamente
6. Testar cenários de edge case

---

## 🔄 Estratégia de Execução

### **Abordagem Recomendada:**
1. **Fase de Preparação** (Subtarefa 2.1)
   - Análise completa do schema atual
   - Planejamento detalhado das migrations

2. **Fase de Extensão de Tabelas** (Subtarefas 2.2, 2.3, 2.4)
   - Executar migrations em paralelo quando possível
   - Validar cada migration individualmente

3. **Fase de Otimização** (Subtarefa 2.5)
   - Criar índices após dados estarem inseridos
   - Medir impacto de performance

4. **Fase de Validação** (Subtarefa 2.6)
   - Testes completos de integração
   - Validação de performance

### **Pontos de Atenção:**
⚠️ **Backup obrigatório** antes de executar migrations
⚠️ **Testar em ambiente local** antes de staging/produção
⚠️ **Validar foreign keys** com dados existentes
⚠️ **Monitorar performance** após criação de índices
⚠️ **Preparar rollback** para cada migration

---

## 📊 Métricas de Sucesso

### **Critérios de Aceite:**
- ✅ Todas as migrations executadas sem erros
- ✅ Todos os índices criados e performando adequadamente
- ✅ Constraints funcionando corretamente (testados com dados válidos/inválidos)
- ✅ Foreign keys mantendo integridade referencial
- ✅ Triggers de `updated_at` funcionando
- ✅ Sistema suportando múltiplos nichos
- ✅ Performance de queries < 100ms para consultas típicas
- ✅ Dados de exemplo inseridos com sucesso
- ✅ Documentação de schema atualizada

### **Testes de Performance Esperados:**
```sql
-- Query típica deve executar em < 100ms
SELECT cr.*, rs.system_name
FROM client_recommendations cr
JOIN recommendation_systems rs ON cr.recommendation_system_id = rs.id
WHERE cr.workspace_id = 'uuid'
  AND cr.status = 'active'
ORDER BY cr.confidence_score DESC
LIMIT 20;
```

---

## 🛠️ Ferramentas e Recursos

### **Ferramentas Necessárias:**
- Supabase CLI
- PostgreSQL client
- Migration tool (Supabase migrations)

### **Comandos Úteis:**
```bash
# Criar nova migration
npx supabase migration new extend_schema_recommendations

# Executar migrations localmente
npx supabase db reset

# Verificar status
npx supabase db diff

# Gerar tipos TypeScript atualizados
npx supabase gen types typescript --local > supabase/types.ts
```

### **Arquivos Afetados:**
- `supabase/migrations/YYYYMMDDHHMMSS_extend_schema_recommendations.sql`
- `supabase/types.ts` (gerar novamente após migrations)

---

## 🚀 Próximos Passos Após Conclusão

Após finalizar a Tarefa 2, o projeto estará pronto para:
- **Tarefa 3:** Criar assistente especializado em planos de saúde
- **Tarefa 4:** Implementar sistema RAG configurável
- **Tarefa 5:** Desenvolver ferramenta extractClientInfo

---

## 📝 Notas Adicionais

**Complexidade:** 6/10
**Tempo Estimado Total:** 2-3 horas
**Risco:** Médio (envolve mudanças em schema de produção)

**Observações:**
- Extensão preparada para suportar múltiplos nichos além de planos de saúde
- Design flexível com JSONB permite adicionar novos campos sem migrations
- Índices otimizados para queries frequentes de recomendações
- Sistema de auditoria embutido com timestamps
