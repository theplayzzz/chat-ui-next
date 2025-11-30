# Plano de Implementação: Task #17 - Interface Administrativa ERP

**Data:** 2025-11-30
**Status:** Planejado
**PRD Base:** `health-plan-agent-prd.md` (RF-006, RNF-003)

---

## Contexto

Criar interface administrativa completa para gerenciar configurações ERP por workspace, incluindo formulário CRUD, dashboard de cache, histórico de chamadas API, e monitoramento de health checks.

**Requisitos relacionados do PRD:**
- **RF-006:** Integração com API ERP (Preços) - timeout 10s, retry 2x, cache 15min
- **RNF-003:** Disponibilidade - graceful degradation, retry automático

---

## Arquitetura Existente

### Backend (Já Implementado)
| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Database | `workspace_erp_config` table | Configurações ERP com RLS policies |
| DB Helpers | `db/workspace-erp-config.ts` | CRUD + getDecryptedAPIKey |
| ERP Client | `lib/clients/erp-client.ts` | fetchPrices com retry/timeout |
| Cache | `lib/cache/erp-price-cache.ts` | ERPPriceCache singleton |
| Integration | `lib/tools/health-plan/fetch-erp-prices.ts` | Workflow completo |

### Padrões UI Existentes
| Padrão | Arquivos de Referência |
|--------|------------------------|
| Admin Components | `components/admin/audit-history.tsx`, `audit-retention-config.tsx` |
| API Routes | `app/api/admin/workspace-permissions/`, `audit-retention/` |
| Auth | `validateUserAuthentication()` + `isUserAdmin()` |
| UI Framework | Radix UI + Tailwind + @tabler/icons-react |
| Forms | react-hook-form + zod |

---

## Subtasks e Implementação

### Subtask 17.1: Migrations SQL

**Arquivos a criar:**
```
supabase/migrations/
├── 20251130000001_create_erp_api_logs.sql
└── 20251130000002_create_erp_health_checks.sql
```

**Tabela erp_api_logs:**
```sql
CREATE TABLE erp_api_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL, -- 'success' | 'error' | 'timeout'
  response_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  request_params JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_erp_api_logs_workspace_id ON erp_api_logs(workspace_id);
CREATE INDEX idx_erp_api_logs_timestamp ON erp_api_logs(timestamp DESC);
CREATE INDEX idx_erp_api_logs_status ON erp_api_logs(status);

-- RLS
ALTER TABLE erp_api_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their workspace logs"
  ON erp_api_logs FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));
```

**Tabela erp_health_checks:**
```sql
CREATE TABLE erp_health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL, -- 'healthy' | 'degraded' | 'down'
  latency_ms INTEGER,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_erp_health_checks_workspace_id ON erp_health_checks(workspace_id);
CREATE INDEX idx_erp_health_checks_timestamp ON erp_health_checks(timestamp DESC);

-- RLS
ALTER TABLE erp_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their workspace health checks"
  ON erp_health_checks FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));
```

---

### Subtask 17.2: Formulário ERP Config + Auto-logging

**Arquivos a criar:**
```
components/admin/erp-config/
├── erp-config-form.tsx
└── index.ts

app/api/admin/erp-config/
├── route.ts        # CRUD principal
└── test/route.ts   # Testar conectividade
```

**Schema Zod para validação:**
```typescript
const erpConfigSchema = z.object({
  api_url: z.string().url().startsWith('https://'),
  api_key: z.string().min(1, 'API key é obrigatória'),
  timeout_ms: z.number().min(1000).max(60000).default(10000),
  max_retries: z.number().min(0).max(5).default(2),
  cache_ttl_seconds: z.number().min(60).max(86400).default(900),
  custom_headers: z.record(z.string()).optional()
})
```

**Componentes do formulário:**
- react-hook-form + zodResolver
- Campos: Input (api_url), Password (api_key), Number inputs (timeout, retries, ttl)
- JSON editor para custom_headers
- Botão "Testar Conectividade"
- Toast notifications (sonner)

**Modificação do ERPClient para auto-logging:**

Adicionar em `lib/clients/erp-client.ts`:
```typescript
private async logAPICall(params: {
  workspaceId: string
  status: 'success' | 'error' | 'timeout'
  responseTimeMs: number
  cacheHit: boolean
  errorMessage?: string
  requestParams?: Record<string, unknown>
}): Promise<void> {
  try {
    await supabase.from('erp_api_logs').insert({
      workspace_id: params.workspaceId,
      status: params.status,
      response_time_ms: params.responseTimeMs,
      cache_hit: params.cacheHit,
      error_message: params.errorMessage,
      request_params: params.requestParams
    })
  } catch (error) {
    console.error('[ERPClient] Failed to log API call:', error)
  }
}
```

---

### Subtask 17.3: Dashboard de Cache

**Arquivo:** `components/admin/erp-config/cache-stats-dashboard.tsx`

**Layout: Grid 2x2 de cards**

| Card | Métrica | Cores |
|------|---------|-------|
| 1 | Hit Rate (%) | Verde >70%, Amarelo 40-70%, Vermelho <40% |
| 2 | Miss Rate (%) | Inverso do Hit Rate |
| 3 | Total Entries | Neutro (azul) |
| 4 | Evictions | Neutro (cinza) |

**API Route:** `app/api/admin/erp-config/stats/route.ts`
```typescript
export async function GET(req: Request) {
  // 1. Validar auth + admin
  // 2. Chamar erpPriceCache.getCacheStats()
  // 3. Retornar JSON
}
```

**Funcionalidades:**
- Botão "Limpar Cache" com Dialog de confirmação
- Auto-refresh a cada 30s (useEffect + setInterval)
- Skeleton loading state

---

### Subtask 17.4: Histórico de Chamadas API

**Arquivo:** `components/admin/erp-config/api-call-history.tsx`

**Seguir padrão de:** `components/admin/audit-history.tsx`

**Colunas da tabela:**
| Coluna | Tipo | Formatação |
|--------|------|------------|
| Timestamp | TIMESTAMPTZ | date-fns format |
| Status | TEXT | Badge (verde/vermelho/amarelo) |
| Response Time | INTEGER | `${ms}ms` |
| Cache Hit | BOOLEAN | IconCheck / IconX |
| Error Message | TEXT | Truncado + tooltip |

**Filtros:**
- Date range: react-day-picker (já instalado)
- Status: Checkboxes (success, error, timeout)
- Paginação: 20 registros/página, server-side

**API Route:** `app/api/admin/erp-config/logs/route.ts`
```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const status = searchParams.get('status')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Query com filtros e paginação
  // Retornar { data, total, page, pageSize }
}
```

---

### Subtask 17.5: Health Monitor + Cron Job + Página Principal

**Arquivos a criar:**
```
components/admin/erp-config/
├── health-monitor-panel.tsx
└── erp-config-page.tsx

app/[locale]/[workspaceid]/admin/erp-config/
└── page.tsx

app/api/admin/erp-config/
├── health/route.ts
└── cache/clear/route.ts

app/api/cron/
└── erp-health-check/route.ts (ou Supabase Edge Function)
```

**Health Monitor Panel:**
- Indicador visual grande (círculo SVG colorido)
- Status: `healthy` (verde), `degraded` (amarelo), `down` (vermelho)
- Mini-tabela: últimos 5 health checks
- Taxa de erro calculada (últimas 24h)

**Cálculo de Status:**
```typescript
function calculateHealthStatus(
  recentChecks: HealthCheck[],
  windowHours: number = 1
): 'healthy' | 'degraded' | 'down' {
  const windowMs = windowHours * 60 * 60 * 1000
  const now = Date.now()

  const checksInWindow = recentChecks.filter(
    c => now - new Date(c.timestamp).getTime() < windowMs
  )

  if (checksInWindow.length === 0) return 'down'

  const errorRate = checksInWindow.filter(
    c => c.status === 'error'
  ).length / checksInWindow.length

  if (errorRate > 0.5) return 'down'      // >50% erros
  if (errorRate > 0.2) return 'degraded'  // >20% erros
  return 'healthy'
}
```

**Cron Job (Vercel):**

`vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/erp-health-check",
    "schedule": "*/5 * * * *"
  }]
}
```

`app/api/cron/erp-health-check/route.ts`:
```typescript
export async function GET(req: Request) {
  // Verificar CRON_SECRET
  // Buscar workspaces com ERP config
  // Para cada workspace:
  //   - Criar ERPClient
  //   - Testar com planIds mock
  //   - Calcular latência e status
  //   - Inserir em erp_health_checks
  // Retornar resumo
}
```

**Página Principal com Tabs:**

```tsx
<Tabs defaultValue="config">
  <TabsList>
    <TabsTrigger value="config">Configuração</TabsTrigger>
    <TabsTrigger value="cache">Cache</TabsTrigger>
    <TabsTrigger value="history">Histórico</TabsTrigger>
    <TabsTrigger value="health">Monitoramento</TabsTrigger>
  </TabsList>

  <TabsContent value="config">
    <ERPConfigForm />
  </TabsContent>
  <TabsContent value="cache">
    <CacheStatsDashboard />
  </TabsContent>
  <TabsContent value="history">
    <APICallHistory />
  </TabsContent>
  <TabsContent value="health">
    <HealthMonitorPanel />
  </TabsContent>
</Tabs>
```

---

## Estrutura Final de Arquivos

```
components/admin/erp-config/
├── index.ts
├── erp-config-form.tsx
├── cache-stats-dashboard.tsx
├── api-call-history.tsx
├── health-monitor-panel.tsx
└── erp-config-page.tsx

app/api/admin/erp-config/
├── route.ts              # GET/POST/PUT/DELETE config
├── test/route.ts         # POST testar conectividade
├── stats/route.ts        # GET cache stats
├── logs/route.ts         # GET histórico paginado
├── health/route.ts       # GET health checks
└── cache/clear/route.ts  # DELETE limpar cache

app/api/cron/
└── erp-health-check/route.ts

app/[locale]/[workspaceid]/admin/erp-config/
└── page.tsx

supabase/migrations/
├── 20251130000001_create_erp_api_logs.sql
└── 20251130000002_create_erp_health_checks.sql
```

---

## Ordem de Execução

```
17.1 Migrations (erp_api_logs + erp_health_checks)
    │
    ▼
17.2 Form CRUD + Modificar ERPClient (auto-logging)
    │
    ▼
17.3 Cache Dashboard (cards simples)
    │
    ▼
17.4 Histórico de Chamadas
    │
    ▼
17.5 Health Monitor + Cron Job + Página Principal
```

---

## Comandos TaskMaster

**Ao iniciar:**
```bash
task-master set-status --id=17 --status=in-progress
```

**Após cada subtask:**
```bash
task-master set-status --id=17.X --status=done
task-master update-subtask --id=17.X --prompt="Implementado: [resumo do que foi feito]"
```

**Ao finalizar:**
```bash
task-master set-status --id=17 --status=done
```

---

## Estimativas

| Subtask | Complexidade | Arquivos | Dependências |
|---------|--------------|----------|--------------|
| 17.1 | Baixa | 2 migrations | - |
| 17.2 | Média | 2 components + 2 APIs + modificação ERPClient | 17.1 |
| 17.3 | Baixa | 1 component + 1 API | 17.1 |
| 17.4 | Média | 1 component + 1 API | 17.1 |
| 17.5 | Alta | 2 components + 3 APIs + 1 page + cron | 17.1, 17.2, 17.3, 17.4 |

---

## Decisões Técnicas

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Dashboard | Cards simples | Sem dependência extra (Recharts) |
| Logging | Auto-logging no ERPClient | Transparente, não requer código manual |
| Health Check | Vercel Cron | Já usando Vercel, mais simples que Edge Function |
| UI Framework | Radix UI | Consistência com resto do projeto |

---

## Testes Necessários

### Unitários (Testing Library)
- [ ] ERPConfigForm: validação, submit, teste de conectividade
- [ ] CacheStatsDashboard: renderização de métricas, cores por threshold
- [ ] APICallHistory: filtros, paginação, formatação
- [ ] HealthMonitorPanel: cálculo de status, indicador visual

### Integração
- [ ] Fluxo CRUD completo de config
- [ ] Cache clear e refresh de stats
- [ ] Paginação de logs

### Segurança
- [ ] RLS bloqueia acesso cross-workspace
- [ ] Apenas admins acessam rotas
- [ ] API key não exposta em responses

### E2E
- [ ] Criar config via UI
- [ ] Testar conectividade
- [ ] Visualizar histórico e filtrar
- [ ] Health monitor atualiza após cron

---

## Referências

- PRD: `.taskmaster/docs/health-plan-agent-prd.md`
- Padrão Admin: `components/admin/audit-history.tsx`
- Padrão API: `app/api/admin/workspace-permissions/route.ts`
- ERP Client: `lib/clients/erp-client.ts`
- Cache: `lib/cache/erp-price-cache.ts`
- Tipos: `lib/tools/health-plan/types.ts`
