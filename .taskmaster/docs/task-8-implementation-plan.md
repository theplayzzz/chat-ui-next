# Plano de Implementação - Tarefa 8: Integração com API ERP

## 📚 Referências
- **PRD:** `/root/chatbot-ui/chatbot-ui/.taskmaster/docs/health-plan-agent-prd.md` (RF-006, linhas 176-197)
- **Tarefa:** #8 - Desenvolver integração com API ERP
- **Arquivo principal:** `lib/tools/health-plan/fetch-erp-prices.ts`
- **Subtarefas:** 8.1 → 8.2 → 8.3 → 8.4 → 8.5 → 8.6

---

## 🎯 Objetivo
Implementar ferramenta `fetchERPPrices` que consulta preços atualizados de planos de saúde via API ERP externa, com cache inteligente, retry automático, e graceful degradation conforme especificado no **RF-006 do PRD**.

---

## 📋 Fase 1: Subtask 8.1 - Configuração por Workspace

### **Ações:**
1. **Marcar subtarefa como em progresso:**
   ```bash
   task-master set-status --id=8.1 --status=in-progress
   ```

2. **Criar migration do Supabase:**
   - Arquivo: `supabase/migrations/YYYYMMDDHHMMSS_create_workspace_erp_config.sql`
   - Criar tabela `workspace_erp_config` com:
     - `id` (UUID, PRIMARY KEY)
     - `workspace_id` (UUID, FK para workspaces, UNIQUE)
     - `api_url` (TEXT, NOT NULL)
     - `api_key_encrypted` (TEXT, usando pg_crypto)
     - `custom_headers` (JSONB, default '{}')
     - `timeout_ms` (INT, default 10000)
     - `retry_attempts` (INT, default 2)
     - `cache_ttl_minutes` (INT, default 15)
     - `created_at` (TIMESTAMP)
     - `updated_at` (TIMESTAMP)
   - Implementar RLS policies para isolamento por workspace
   - Adicionar índices apropriados
   - Usar `pgcrypto` extension para criptografia

3. **Criar tipos TypeScript:**
   - Arquivo: `lib/tools/health-plan/types.ts` (adicionar ao arquivo existente)
   - Interfaces:
     ```typescript
     export interface WorkspaceERPConfig {
       id: string
       workspace_id: string
       api_url: string
       api_key_encrypted: string
       custom_headers: Record<string, string>
       timeout_ms: number
       retry_attempts: number
       cache_ttl_minutes: number
       created_at: string
       updated_at: string
     }

     export interface ERPConfigInsert {
       workspace_id: string
       api_url: string
       api_key: string // Será criptografado
       custom_headers?: Record<string, string>
       timeout_ms?: number
       retry_attempts?: number
       cache_ttl_minutes?: number
     }

     export interface ERPConfigUpdate {
       api_url?: string
       api_key?: string
       custom_headers?: Record<string, string>
       timeout_ms?: number
       retry_attempts?: number
       cache_ttl_minutes?: number
     }
     ```

4. **Criar funções helper:**
   - Arquivo: `db/workspace-erp-config.ts` (novo)
   - Funções seguindo padrão de `db/collections.ts`:
     ```typescript
     export const getERPConfigByWorkspaceId(workspaceId: string)
     export const createERPConfig(config: ERPConfigInsert)
     export const updateERPConfig(workspaceId: string, updates: ERPConfigUpdate)
     export const deleteERPConfig(workspaceId: string)
     ```

5. **Atualizar tipos gerados:**
   ```bash
   npx supabase gen types typescript --local > supabase/types.ts
   ```

6. **Atualizar Task Master:**
   ```bash
   task-master update-subtask --id=8.1 --prompt="✅ Concluído: Criada tabela workspace_erp_config com RLS, tipos TypeScript em lib/tools/health-plan/types.ts, e funções helper em db/workspace-erp-config.ts seguindo padrão do projeto. Migration em supabase/migrations/. Criptografia implementada com pg_crypto."
   ```

7. **Marcar como concluída:**
   ```bash
   task-master set-status --id=8.1 --status=done
   ```

---

## 📋 Fase 2: Subtask 8.2 - Cliente HTTP Robusto

### **Ações:**
1. **Marcar subtarefa como em progresso:**
   ```bash
   task-master set-status --id=8.2 --status=in-progress
   ```

2. **Criar cliente HTTP:**
   - Arquivo: `lib/clients/erp-client.ts` (novo)
   - Implementar classe `ERPClient` com:
     ```typescript
     export class ERPClient {
       private config: WorkspaceERPConfig

       constructor(config: WorkspaceERPConfig)

       async fetchPrices(planIds: string[]): Promise<ERPResult<PriceData>>

       private async fetchWithRetry(): Promise<Response>
       private async sleep(ms: number): Promise<void>
       private handleError(error: unknown): ERPError
       private logRequest(attempt: number, context: object): void
     }
     ```
   - Features:
     - `fetch()` com `AbortController` para timeout
     - Retry logic com backoff exponencial (100ms, 200ms)
     - Tratamento de erros: 4xx, 5xx, timeout, network
     - Logging estruturado com contexto (workspace_id, attempt, error_type)
     - Suporte a custom headers da configuração

3. **Criar schemas Zod:**
   - Arquivo: `lib/tools/health-plan/schemas/erp-response-schema.ts` (novo)
   - Validar formato de resposta da API ERP
   - Schemas para diferentes modelos de precificação:
     ```typescript
     export const ERPPriceItemSchema = z.object({
       planId: z.string(),
       titular: z.number().positive(),
       dependentes: z.array(z.object({
         idade: z.number().int().min(0),
         preco: z.number().positive()
       })).optional(),
       descontos: z.number().optional(),
       total: z.number().positive()
     })

     export const ERPResponseSchema = z.object({
       success: z.boolean(),
       data: z.array(ERPPriceItemSchema),
       timestamp: z.string().datetime()
     })
     ```

4. **Criar tipos de retorno:**
   - Usar discriminated unions:
     ```typescript
     export type ERPResult<T> =
       | { success: true; data: T; source: 'api' }
       | { success: false; error: ERPError; canRetry: boolean }

     export interface ERPError {
       code: string
       message: string
       statusCode?: number
       attempt: number
       timestamp: string
     }
     ```

5. **Atualizar Task Master:**
   ```bash
   task-master update-subtask --id=8.2 --prompt="✅ Concluído: Cliente HTTP em lib/clients/erp-client.ts com timeout via AbortController, retry com backoff exponencial, tratamento completo de erros, logging estruturado. Schemas Zod em lib/tools/health-plan/schemas/erp-response-schema.ts. Suporte a custom headers implementado."
   ```

6. **Marcar como concluída:**
   ```bash
   task-master set-status --id=8.2 --status=done
   ```

---

## 📋 Fase 3: Subtask 8.3 - Cálculo de Preços Familiares

### **Ações:**
1. **Marcar subtarefa como em progresso:**
   ```bash
   task-master set-status --id=8.3 --status=in-progress
   ```

2. **Criar módulo de pricing:**
   - Arquivo: `lib/utils/pricing.ts` (novo)
   - Função principal:
     ```typescript
     export function calculateFamilyPrice(
       erpData: ERPPriceData,
       familyProfile: FamilyProfile,
       model: PricingModel
     ): PriceBreakdown
     ```
   - Lógica:
     - Calcular titular + dependentes (com variação por idade)
     - Suportar 3 modelos de API:
       1. **Preço único família:** Valor fixo independente do tamanho
       2. **Preço por pessoa:** Soma de preços individuais
       3. **Tabela por faixa etária:** Busca em tabela de preços por idade
     - Retornar breakdown detalhado com transparência

3. **Criar tipos:**
   - Adicionar em `lib/tools/health-plan/types.ts`:
     ```typescript
     export interface FamilyProfile {
       titular: { idade: number }
       dependentes: Array<{
         relacao: 'conjuge' | 'filho' | 'pai' | 'mae' | 'outro'
         idade: number
       }>
     }

     export interface PriceBreakdown {
       titular: number
       dependentes: Array<{
         relacao: string
         idade: number
         preco: number
       }>
       subtotal: number
       descontos: number
       total: number
       model: PricingModel
     }

     export type PricingModel =
       | 'familia_unica'
       | 'por_pessoa'
       | 'faixa_etaria'
     ```

4. **Implementar validação:**
   - Usar Zod para validar entrada/saída
   - Edge cases:
     - 0 dependentes (só titular)
     - Muitos dependentes (>5)
     - Idades inválidas (<0, >120)

5. **Atualizar Task Master:**
   ```bash
   task-master update-subtask --id=8.3 --prompt="✅ Concluído: Função calculateFamilyPrice() em lib/utils/pricing.ts. Suporta 3 modelos de precificação (único, por pessoa, faixa etária). Retorna breakdown detalhado. Validação Zod implementada. Edge cases tratados."
   ```

6. **Marcar como concluída:**
   ```bash
   task-master set-status --id=8.3 --status=done
   ```

---

## 📋 Fase 4: Subtask 8.4 - Sistema de Cache

### **Ações:**
1. **Marcar subtarefa como em progresso:**
   ```bash
   task-master set-status --id=8.4 --status=in-progress
   ```

2. **Criar sistema de cache:**
   - Arquivo: `lib/cache/erp-price-cache.ts` (novo)
   - Estrutura:
     ```typescript
     interface CacheEntry {
       data: PriceBreakdown[]
       timestamp: number
       ttl: number
       hits: number
       workspace_id: string
     }

     class ERPPriceCache {
       private cache: Map<string, CacheEntry>
       private stats: {
         hits: number
         misses: number
         evictions: number
       }

       constructor()

       getCached(key: string): CacheEntry | null
       setCached(key: string, data: any, ttl: number): void
       invalidateCache(workspaceId?: string, planIds?: string[]): void
       clearExpired(): number
       getCacheStats(): CacheStats

       private generateKey(workspaceId: string, planIds: string[]): string
       private isExpired(entry: CacheEntry): boolean
     }

     export const erpPriceCache = new ERPPriceCache()
     ```
   - Key format: `erp_prices:{workspace_id}:{plan_ids_hash}`
   - Hash usando crypto: `createHash('sha256').update(planIds.sort().join(',')).digest('hex').slice(0, 16)`

3. **Implementar funções:**
   - `getCached()`: Verifica TTL antes de retornar, incrementa hits
   - `setCached()`: Armazena com timestamp atual
   - `invalidateCache()`: Remove por workspace ou plan_ids específicos
   - `clearExpired()`: Cleanup periódico via setInterval (a cada 5 min)

4. **Adicionar estatísticas:**
   - `getCacheStats()`:
     ```typescript
     interface CacheStats {
       totalEntries: number
       hitRate: number
       missRate: number
       evictions: number
       oldestEntry: number | null
       totalHits: number
     }
     ```
   - Para monitoramento e otimização

5. **Thread safety:**
   - Node.js é single-threaded, mas garantir atomic operations
   - Usar Promises para async operations

6. **Inicializar cleanup:**
   ```typescript
   // Auto-cleanup a cada 5 minutos
   setInterval(() => {
     const removed = erpPriceCache.clearExpired()
     if (removed > 0) {
       console.log(`[Cache] Removed ${removed} expired entries`)
     }
   }, 5 * 60 * 1000)
   ```

7. **Atualizar Task Master:**
   ```bash
   task-master update-subtask --id=8.4 --prompt="✅ Concluído: Cache em memória em lib/cache/erp-price-cache.ts. TTL 15min configurável. Funções: getCached, setCached, invalidateCache, clearExpired. Estatísticas de hit/miss implementadas. Thread-safe para concurrency. Auto-cleanup a cada 5min."
   ```

8. **Marcar como concluída:**
   ```bash
   task-master set-status --id=8.4 --status=done
   ```

---

## 📋 Fase 5: Subtask 8.5 - Graceful Degradation

### **Ações:**
1. **Marcar subtarefa como em progresso:**
   ```bash
   task-master set-status --id=8.5 --status=in-progress
   ```

2. **Criar ferramenta principal:**
   - Arquivo: `lib/tools/health-plan/fetch-erp-prices.ts` (novo)
   - Implementar função principal:
     ```typescript
     export async function fetchERPPrices(
       workspaceId: string,
       planIds: string[],
       familyProfile: FamilyProfile
     ): Promise<ERPPriceResult> {
       // 1. Buscar config do workspace
       const config = await getERPConfigByWorkspaceId(workspaceId)
       if (!config) {
         throw new Error('ERP config not found for workspace')
       }

       // 2. Verificar cache primeiro
       const cacheKey = erpPriceCache.generateKey(workspaceId, planIds)
       const cached = erpPriceCache.getCached(cacheKey)

       // 3. Tentar buscar da API
       try {
         const client = new ERPClient(config)
         const result = await client.fetchPrices(planIds)

         if (result.success) {
           // Calcular preços familiares
           const breakdown = calculateFamilyPrice(
             result.data,
             familyProfile,
             'por_pessoa' // ou detectar do config
           )

           // Salvar no cache
           erpPriceCache.setCached(cacheKey, breakdown, config.cache_ttl_minutes)

           return {
             success: true,
             prices: breakdown,
             source: 'live',
             cached_at: null,
             is_fresh: true
           }
         }
       } catch (error) {
         // 4. API falhou, tentar cache (stale)
         console.warn('[fetchERPPrices] API failed, attempting stale cache', error)
       }

       // 5. Usar stale cache se disponível
       if (cached) {
         const age = Date.now() - cached.timestamp
         const maxStaleAge = 24 * 60 * 60 * 1000 // 24 horas

         if (age < maxStaleAge) {
           console.warn(`[fetchERPPrices] Using stale cache (${Math.round(age / 1000 / 60)}min old)`)

           return {
             success: true,
             prices: cached.data,
             source: 'stale_cache',
             cached_at: new Date(cached.timestamp).toISOString(),
             is_fresh: false
           }
         }
       }

       // 6. Sem cache ou cache muito antigo
       return {
         success: false,
         error: 'ERP API unavailable and no valid cache',
         source: 'none',
         cached_at: null,
         is_fresh: false
       }
     }
     ```

3. **Implementar warnings:**
   - Logging estruturado quando usar stale cache
   - Limite máximo: 24 horas
   - Incluir idade do cache nos logs

4. **Criar tipos de retorno:**
   - Adicionar em `lib/tools/health-plan/types.ts`:
     ```typescript
     export type PriceSource = 'live' | 'cache' | 'stale_cache' | 'none'

     export interface ERPPriceResult {
       success: boolean
       prices?: PriceBreakdown[]
       source: PriceSource
       cached_at: string | null
       is_fresh: boolean
       error?: string
       metadata?: {
         workspace_id: string
         plan_ids: string[]
         fetched_at: string
         cache_age_minutes?: number
       }
     }
     ```

5. **Atualizar Task Master:**
   ```bash
   task-master update-subtask --id=8.5 --prompt="✅ Concluído: fetchERPPrices() implementado em lib/tools/health-plan/fetch-erp-prices.ts. Graceful degradation com fallback para stale cache. Metadados de freshness (source, cached_at, is_fresh). Limite 24h para stale cache. Logging detalhado de degradation events. Conforme RF-006 do PRD."
   ```

6. **Marcar como concluída:**
   ```bash
   task-master set-status --id=8.5 --status=done
   ```

---

## 📋 Fase 6: Subtask 8.6 - Suite de Testes

### **Ações:**
1. **Marcar subtarefa como em progresso:**
   ```bash
   task-master set-status --id=8.6 --status=in-progress
   ```

2. **Criar arquivo de testes:**
   - Arquivo: `lib/tools/health-plan/__tests__/fetch-erp-prices.test.ts` (novo)
   - Usar Vitest (framework do projeto)
   - Estrutura:
     ```typescript
     import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
     import { setupServer } from 'msw/node'
     import { http, HttpResponse } from 'msw'

     describe('fetchERPPrices', () => {
       // Grupos de testes
     })
     ```

3. **Implementar mock server:**
   - Usar MSW (Mock Service Worker)
   - Simular cenários:
     ```typescript
     const mockServer = setupServer(
       // ✅ Sucesso
       http.post('https://api.erp.test/prices', async ({ request }) => {
         return HttpResponse.json({
           success: true,
           data: [/* mock prices */],
           timestamp: new Date().toISOString()
         })
       }),

       // ⏱️ Timeout
       http.post('https://api.erp.test/slow', async () => {
         await new Promise(resolve => setTimeout(resolve, 15000))
         return HttpResponse.json({ success: true })
       }),

       // 🔄 Falha intermitente
       http.post('https://api.erp.test/flaky', async () => {
         const shouldFail = Math.random() > 0.5
         if (shouldFail) {
           return new HttpResponse(null, { status: 500 })
         }
         return HttpResponse.json({ success: true })
       }),

       // ❌ Erro 500
       http.post('https://api.erp.test/error', () => {
         return new HttpResponse(null, { status: 500 })
       }),

       // 🔧 Resposta malformada
       http.post('https://api.erp.test/invalid', () => {
         return HttpResponse.json({ invalid: 'data' })
       })
     )
     ```

4. **Criar testes:**

   **a) Cálculo de preços:**
   ```typescript
   describe('Price Calculation', () => {
     it('should calculate price for typical family (titular + spouse + 2 children)')
     it('should handle titular only (no dependents)')
     it('should handle large families (>5 dependents)')
     it('should apply age-based pricing correctly')
     it('should handle different pricing models')
   })
   ```

   **b) Cache:**
   ```typescript
   describe('Cache System', () => {
     it('should cache successful API responses')
     it('should return cached data within TTL')
     it('should miss cache after TTL expiration')
     it('should invalidate cache by workspace')
     it('should track hit/miss statistics')
   })
   ```

   **c) Retry:**
   ```typescript
   describe('Retry Logic', () => {
     it('should retry on network failure')
     it('should use exponential backoff (100ms, 200ms)')
     it('should not exceed max attempts (2)')
     it('should succeed on second attempt')
   })
   ```

   **d) Graceful degradation:**
   ```typescript
   describe('Graceful Degradation', () => {
     it('should return stale cache when API fails')
     it('should include freshness metadata')
     it('should reject cache older than 24h')
     it('should log degradation events')
   })
   ```

   **e) Configurações:**
   ```typescript
   describe('Configuration', () => {
     it('should load workspace ERP config')
     it('should validate required fields')
     it('should handle missing config')
     it('should apply custom headers')
     it('should respect timeout settings')
   })
   ```

   **f) Integração:**
   ```typescript
   describe('Integration', () => {
     it('should fetch from Supabase config')
     it('should enforce RLS policies')
     it('should decrypt API keys')
   })
   ```

5. **Verificar coverage:**
   - Meta: >85%
   - Comando: `npm run test:coverage`
   - Gerar relatório: `npm run test:coverage -- --reporter=html`

6. **Documentar cenários:**
   - Arquivo: `lib/tools/health-plan/__tests__/README.md`
   - Conteúdo:
     ```markdown
     # Testes - fetchERPPrices

     ## Cenários Testados

     ### 1. Cálculo de Preços
     - Família típica (titular + cônjuge + 2 filhos)
     - Titular sem dependentes
     - Família grande (>5 dependentes)
     - Diferentes faixas etárias
     - Edge cases (idade 0, idade 120)

     ### 2. Cache
     - Cache hit dentro do TTL
     - Cache miss após expiração
     - Invalidação manual
     - Estatísticas de performance

     ### 3. Retry e Timeout
     - Retry em falhas de rede
     - Backoff exponencial
     - Timeout após 10s
     - Máximo de 2 tentativas

     ### 4. Graceful Degradation
     - Fallback para stale cache
     - Limite de 24h para cache antigo
     - Metadados de freshness

     ### 5. Integração
     - Configurações do Supabase
     - RLS policies
     - Criptografia de credenciais

     ## Executar Testes

     ```bash
     npm test fetch-erp-prices
     npm run test:coverage
     ```
     ```

7. **Atualizar Task Master:**
   ```bash
   task-master update-subtask --id=8.6 --prompt="✅ Concluído: Suite completa de testes em lib/tools/health-plan/__tests__/fetch-erp-prices.test.ts. Mock server MSW simulando todos cenários. Coverage >85%. Testes: cálculo, cache, retry, degradation, configs, integração. Documentação de cenários em README."
   ```

8. **Marcar como concluída:**
   ```bash
   task-master set-status --id=8.6 --status=done
   ```

9. **Marcar tarefa principal como concluída:**
   ```bash
   task-master set-status --id=8 --status=done
   ```

---

## 🔍 Validação Final

### **Checklist RF-006 do PRD (linhas 176-197):**
- ✅ Consulta múltiplos planos em uma chamada
- ✅ Timeout de 10 segundos (configurável por workspace)
- ✅ Retry em caso de falha (2 tentativas com backoff)
- ✅ Graceful degradation (usa cache se API indisponível)
- ✅ Log de erros de integração (estruturado)
- ✅ Suporte a headers customizados por cliente
- ✅ Preços retornados em formato estruturado (PriceBreakdown)
- ✅ Cache de preços (15 minutos configurável)
- ✅ Cálculo para família (titular + dependentes)
- ✅ Inclusão de descontos aplicáveis
- ✅ Fallback para preços em cache se API falhar

### **Atualização Final Task Master:**
```bash
task-master update-task --id=8 --prompt="✅ TASK CONCLUÍDA: Integração com API ERP totalmente implementada conforme RF-006 do PRD. Todos os 6 subtasks concluídos. Arquivos criados: workspace_erp_config migration, erp-client.ts, pricing.ts, erp-price-cache.ts, fetch-erp-prices.ts, testes completos. Coverage >85%. Sistema pronto para integração com orquestrador (Task 9). Documentação em .taskmaster/docs/task-8-implementation-plan.md"
```

---

## 📁 Estrutura de Arquivos Criados

```
/root/chatbot-ui/chatbot-ui/
├── supabase/migrations/
│   └── YYYYMMDDHHMMSS_create_workspace_erp_config.sql
├── db/
│   └── workspace-erp-config.ts
├── lib/
│   ├── clients/
│   │   └── erp-client.ts
│   ├── cache/
│   │   └── erp-price-cache.ts
│   ├── utils/
│   │   └── pricing.ts
│   └── tools/health-plan/
│       ├── fetch-erp-prices.ts              (ferramenta principal)
│       ├── schemas/
│       │   └── erp-response-schema.ts       (validação Zod)
│       ├── types.ts                         (atualizado com novos tipos)
│       └── __tests__/
│           ├── fetch-erp-prices.test.ts     (suite de testes)
│           └── README.md                    (doc dos testes)
└── .taskmaster/docs/
    └── task-8-implementation-plan.md        (este documento)
```

---

## 🎯 Estimativa de Tempo

| Subtask | Descrição | Tempo Estimado |
|---------|-----------|----------------|
| 8.1 | Configuração por Workspace | 2-3 horas |
| 8.2 | Cliente HTTP Robusto | 3-4 horas |
| 8.3 | Cálculo de Preços Familiares | 2-3 horas |
| 8.4 | Sistema de Cache | 2-3 horas |
| 8.5 | Graceful Degradation | 2-3 horas |
| 8.6 | Suite de Testes | 4-5 horas |
| **Total** | | **15-21 horas** |

**Duração total:** 2-3 dias de trabalho

---

## ✅ Critérios de Aceitação

### Técnicos
1. ✅ Todos os 6 subtasks marcados como `done` no Task Master
2. ✅ Coverage de testes >85%
3. ✅ Todos os critérios do RF-006 (PRD) atendidos
4. ✅ Migration aplicada com sucesso no Supabase
5. ✅ Tipos TypeScript gerados corretamente
6. ✅ Código seguindo padrões do projeto existente

### Funcionais
1. ✅ Consulta de preços funcionando com API mock
2. ✅ Cache salvando e recuperando dados corretamente
3. ✅ Retry funcionando com backoff exponencial
4. ✅ Graceful degradation retornando stale cache
5. ✅ Cálculo de preços familiares preciso
6. ✅ Configurações por workspace isoladas (RLS)

### Documentação
1. ✅ Código comentado com JSDoc
2. ✅ README de testes documentado
3. ✅ Este plano de implementação atualizado
4. ✅ Tipos TypeScript exportados e documentados

---

## 🚀 Próximos Passos Após Conclusão

1. **Integração com Orquestrador (Task 9):**
   - Usar `fetchERPPrices` no Step 4 do orquestrador
   - Passar resultado para Step 5 (geração de recomendação)

2. **Interface Admin:**
   - Criar UI para configurar credenciais ERP por workspace
   - Dashboard de estatísticas de cache
   - Logs de chamadas à API

3. **Monitoramento:**
   - Integrar com LangSmith (RF-013)
   - Alertas de falhas da API ERP
   - Métricas de performance do cache

4. **Otimizações:**
   - Cache warming para planos populares
   - Batch requests para múltiplos planos
   - Circuit breaker para API instável

---

**Documento criado em:** 2025-11-18
**Última atualização:** 2025-11-18
**Versão:** 1.0
