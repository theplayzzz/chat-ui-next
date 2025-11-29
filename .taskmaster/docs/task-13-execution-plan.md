# Plano de Execução: Task 13 - Sistema de Auditoria e Compliance LGPD

## Contexto

Implementar sistema de auditoria para compliance LGPD conforme RF-012 do PRD principal (`health-plan-agent-prd.md`).

### Estado Atual
- **Tabela `client_recommendations`** já existe com campos básicos (workspace_id, user_id, client_info, analyzed_data, recommended_item, reasoning, confidence_score, langsmith_run_id)
- **Logger estruturado** com mascaramento de dados sensíveis implementado em `lib/tools/health-plan/logger.ts`
- **RLS** habilitado em todas as tabelas
- **LangSmith** integrado para rastreamento
- **Sessões** com TTL de 1 hora

### Gaps Identificados
- Campos LGPD não existem (retention, consent, anonymization level)
- Não há funções de anonimização de dados históricos
- Interface de consulta de histórico ausente
- Exportação CSV não implementada
- Job de cleanup automático inexistente

---

## Plano de Execução por Subtarefa

### Subtarefa 13.1: Estender tabela para compliance LGPD

**Arquivos a criar:**
- `supabase/migrations/[timestamp]_add_lgpd_compliance_fields.sql`

**Campos a adicionar em `client_recommendations`:**
```sql
retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 year'),  -- Configurável por workspace
anonymization_level TEXT DEFAULT 'none' CHECK (anonymization_level IN ('full', 'partial', 'none')),
consent_given BOOLEAN NOT NULL DEFAULT false,
consent_timestamp TIMESTAMPTZ,
data_subject_rights_metadata JSONB DEFAULT '{}'::JSONB
```

**Decisões de design confirmadas:**
- **Retenção padrão:** 1 ano (configurável por workspace)
- **Anonimização progressiva:** 90 dias (partial → full)
- **Deleção:** Soft delete como padrão

**Índices:**
- `idx_client_recommendations_retention` em `retention_until`
- `idx_client_recommendations_anonymization` em `anonymization_level`

**Atualização TaskMaster:** `task-master set-status --id=13.1 --status=done`

---

### Subtarefa 13.2: Funções de anonimização de dados sensíveis

**Arquivos a criar:**
- `lib/tools/health-plan/anonymization.ts`
- `lib/tools/health-plan/schemas/anonymization-schemas.ts`
- `lib/tools/health-plan/__tests__/anonymization.test.ts`
- `supabase/migrations/[timestamp]_add_anonymization_functions.sql`

**Funcionalidades TypeScript:**
```typescript
// Níveis de anonimização
type AnonymizationLevel = 'full' | 'partial' | 'none'

// Funções principais
function anonymizeClientInfo(clientInfo: ClientInfo, level: AnonymizationLevel): ClientInfo
function isPersonalData(fieldName: string): boolean
function hashSensitiveField(value: string): string  // SHA256
```

**Regras de anonimização:**
- **full**: Remove CPF, nome completo, endereço, telefone, email. Mantém apenas faixa etária e região (estado)
- **partial**: Hash CPF, mantém primeiro nome, cidade (não endereço completo)
- **none**: Dados originais preservados

**Função SQL:**
```sql
CREATE OR REPLACE FUNCTION anonymize_client_info(
  client_info JSONB,
  level TEXT DEFAULT 'partial'
) RETURNS JSONB
```

**Atualização TaskMaster:** `task-master set-status --id=13.2 --status=done`

---

### Subtarefa 13.3: Sistema automático de registro de recomendações

**Arquivos a criar:**
- `lib/tools/health-plan/audit-logger.ts`

**Arquivos a modificar:**
- `lib/tools/health-plan/orchestrator.ts` (integrar após Step 5)

**Função principal:**
```typescript
async function saveRecommendationAudit(params: {
  workspaceId: string
  userId: string
  clientInfo: ClientInfo
  analyzedPlans: PlanAnalysis[]
  recommendedPlan: PlanAnalysis
  reasoning: string
  langsmithRunId: string
  consentGiven: boolean
}): Promise<{ success: boolean; auditId?: string; error?: string }>
```

**Fluxo:**
1. Buscar configuração de anonimização do workspace (via `workspace_config` se existir, senão default 'partial')
2. Aplicar anonimização no `clientInfo`
3. Calcular `retention_until` = NOW() + retention_years (default 1 ano)
4. Inserir em `client_recommendations`
5. Try-catch para não bloquear resposta ao usuário

**Integração no Orchestrator:**
- Após `generateRecommendation` (Step 5) bem-sucedido
- Campo `audit_status: 'success' | 'failed'` na resposta

**Atualização TaskMaster:** `task-master set-status --id=13.3 --status=done`

---

### Subtarefa 13.4: Interface de consulta de histórico de auditoria

**Arquivos a criar:**
- `components/admin/audit-history.tsx`
- `app/api/admin/audit-history/route.ts`

**Funcionalidades do componente:**
- Filtros: período (date picker), workspace (select), status (select)
- Paginação server-side (limit/offset, 20 por página)
- Colunas: timestamp, workspace, user (anonimizado), planos analisados (count), plano recomendado, confidence_score, langsmith_run_id (link)
- Loading states e tratamento de erros

**API Route GET /api/admin/audit-history:**
```typescript
// Query params
interface AuditHistoryParams {
  workspaceId?: string
  startDate?: string
  endDate?: string
  status?: string
  page?: number
  limit?: number
}

// Validação: user é owner do workspace ou admin global
// RLS garante isolamento por workspace
```

**Padrão de UI:** Seguir `components/admin/workspace-permissions.tsx`

**Atualização TaskMaster:** `task-master set-status --id=13.4 --status=done`

---

### Subtarefa 13.5: Funcionalidade de exportação CSV

**Arquivos a criar:**
- `app/api/admin/audit-history/export/route.ts`

**Funcionalidades:**
- Mesmo filtros do histórico
- Rate limiting: 1 export/minuto/usuário (via header ou cache)
- Limite: 10.000 registros por export
- Campos exportados (anonimizados):
  - timestamp, workspace_name, user_email (parcial)
  - client_age_range, analyzed_plans_count
  - recommended_plan_name, confidence_score
  - reasoning (resumido, max 200 chars)
  - langsmith_run_id

**Biblioteca:** `papaparse` para geração CSV

**Headers de resposta:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename=audit-export-YYYY-MM-DD.csv
```

**Atualização TaskMaster:** `task-master set-status --id=13.5 --status=done`

---

### Subtarefa 13.6: Job de limpeza automática e configuração de retenção

**Arquivos a criar:**
- `supabase/functions/cleanup-audit-records/index.ts`
- `supabase/migrations/[timestamp]_create_workspace_audit_config.sql`
- `supabase/migrations/[timestamp]_create_audit_deletions_log.sql`
- `components/admin/audit-retention-config.tsx`
- `app/api/admin/audit-retention/route.ts`

**Tabela `workspace_audit_config`:**
```sql
CREATE TABLE workspace_audit_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
  retention_years INTEGER DEFAULT 1,           -- 1 ano padrão (conforme decisão)
  auto_anonymize_after_days INTEGER DEFAULT 90, -- 90 dias para upgrade partial→full
  hard_delete_enabled BOOLEAN DEFAULT false,   -- Soft delete como padrão
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Tabela `audit_deletions_log`:**
```sql
CREATE TABLE audit_deletions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  deletion_type TEXT NOT NULL, -- 'soft', 'hard', 'anonymization_upgrade'
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by TEXT DEFAULT 'system_cleanup'
);
```

**Edge Function (Supabase Cron - diário às 3AM):**
```typescript
// 1. Deletar registros expirados
DELETE FROM client_recommendations
WHERE retention_until < NOW()
  AND status != 'archived'
  AND workspace_id IN (SELECT workspace_id FROM workspace_audit_config WHERE hard_delete_enabled = true)

// 2. Soft delete para workspaces sem hard_delete
UPDATE client_recommendations SET status = 'deleted' WHERE ...

// 3. Anonimização progressiva (após 90 dias)
UPDATE client_recommendations
SET client_info = anonymize_client_info(client_info, 'full'),
    anonymization_level = 'full'
WHERE anonymization_level = 'partial'
  AND created_at < NOW() - INTERVAL '90 days'

// 4. Logar todas as operações em audit_deletions_log
```

**Componente de configuração:**
- Sliders/inputs para retention_years, auto_anonymize_after_days
- Toggle para hard_delete_enabled (com warning)
- Apenas workspace owners podem configurar

**Atualização TaskMaster:** `task-master set-status --id=13.6 --status=done`

---

## Ordem de Execução Recomendada

```
13.1 (Migration LGPD)
  ↓
13.2 (Funções anonimização)
  ↓
13.3 (Audit logger automático) ─────→ 13.6 (Cleanup job + config)
  ↓
13.4 (Interface histórico)
  ↓
13.5 (Export CSV)
```

**Nota:** 13.3 e 13.6 podem rodar em paralelo após 13.2

---

## Arquivos Críticos a Ler Antes de Implementar

1. `lib/tools/health-plan/orchestrator.ts` - Ponto de integração do audit logger
2. `lib/tools/health-plan/logger.ts` - Padrão de mascaramento existente
3. `components/admin/workspace-permissions.tsx` - Padrão de UI admin
4. `app/api/admin/workspace-permissions/route.ts` - Padrão de API admin
5. `supabase/migrations/20251113145726_create_recommendation_system_tables.sql` - Schema atual
6. `lib/tools/health-plan/types.ts` - Types existentes

---

## Atualizações TaskMaster Durante Implementação

```bash
# Antes de cada subtarefa
task-master set-status --id=13.X --status=in-progress

# Após concluir cada subtarefa
task-master set-status --id=13.X --status=done

# Se encontrar bloqueios
task-master update-subtask --id=13.X --prompt="[descrição do bloqueio]"

# Ao finalizar toda a Task 13
task-master set-status --id=13 --status=done
```

---

## Testes Necessários

| Subtarefa | Testes |
|-----------|--------|
| 13.1 | Migration executa sem erro, campos criados com tipos corretos |
| 13.2 | Anonimização full/partial/none, campos sensíveis detectados, hash SHA256 |
| 13.3 | Audit salvo após recomendação, fallback se falhar, langsmith_run_id presente |
| 13.4 | Filtros funcionam, paginação, RLS respeitado, link LangSmith |
| 13.5 | CSV gerado, rate limiting, limite 10k, encoding UTF-8 |
| 13.6 | Job deleta expirados, soft vs hard delete, anonimização progressiva |

---

## Estimativa

- **13.1**: 30 min (migration simples)
- **13.2**: 2h (TypeScript + SQL + testes)
- **13.3**: 1.5h (integração + testes)
- **13.4**: 2h (componente + API)
- **13.5**: 1.5h (export + rate limiting)
- **13.6**: 2.5h (Edge Function + config UI)

**Total estimado**: ~10 horas de implementação
