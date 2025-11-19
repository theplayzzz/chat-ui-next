# Testes - fetchERPPrices

## Visão Geral

Suite de testes completa para o sistema de integração ERP, incluindo cálculo de preços familiares, cache inteligente, retry com backoff exponencial, e graceful degradation.

## Cenários Testados

### 1. Cálculo de Preços

#### Famílias Típicas
- ✅ Família típica (titular + cônjuge + 2 filhos)
- ✅ Titular sem dependentes
- ✅ Família grande (>5 dependentes)

#### Modelos de Precificação
- ✅ **familia_unica**: Preço fixo para família, distribuído igualmente
- ✅ **por_pessoa**: Soma de preços individuais com lookup inteligente
- ✅ **faixa_etaria**: Busca por idade exata ou closest match

#### Edge Cases
- ✅ Idade 0 (recém-nascido)
- ✅ Idade 120 (máxima permitida)
- ✅ Rejeição de idades inválidas (<0, >120)
- ✅ Match exato de idade
- ✅ Closest age match quando não encontrado
- ✅ Fallback para preço titular quando sem dados ERP

### 2. Sistema de Cache

#### Operações Básicas
- ✅ Cache de respostas bem-sucedidas
- ✅ Cache hit dentro do TTL
- ✅ Cache miss após expiração
- ✅ Invalidação por workspace
- ✅ Estatísticas de hit/miss

#### Geração de Chaves
- ✅ Chaves consistentes para mesmos inputs
- ✅ Mesma chave independente da ordem dos plan IDs
- ✅ Chaves diferentes para workspaces diferentes
- ✅ Chaves diferentes para planos diferentes

### 3. Retry e Timeout

#### Cenários HTTP (MSW Mock Server)
- ✅ Resposta bem-sucedida da API
- ✅ Timeout após 10 segundos
- ✅ Erro 500 (Server Error)
- ✅ Resposta malformada (Validation Error)

#### Lógica de Retry
- ⚠️ Retry em falhas de rede (requer integração completa)
- ⚠️ Backoff exponencial (100ms, 200ms) (requer integração completa)
- ⚠️ Máximo de 2 tentativas (requer integração completa)

### 4. Graceful Degradation

- ⚠️ Fallback para stale cache quando API falha (requer integração completa)
- ⚠️ Limite de 24h para cache antigo (requer integração completa)
- ⚠️ Metadados de freshness (source, cached_at, is_fresh) (requer integração completa)

### 5. Integração com Supabase

- ⚠️ Configurações do Supabase (requer DB local)
- ⚠️ RLS policies (requer DB local)
- ⚠️ Criptografia de credenciais (requer DB local)

## Executar Testes

### Testes Unitários (Pricing + Cache)

```bash
# Executar todos os testes
npm test

# Executar testes específicos
npm test fetch-erp-prices

# Executar com coverage
npm run test:coverage

# Executar com watch mode
npm test -- --watch
```

### Testes de Integração

**Nota:** Testes de integração completa requerem:
1. Supabase local rodando (`npx supabase start`)
2. Migration aplicada (`npx supabase db push`)
3. Workspace de teste configurado

```bash
# Setup para testes de integração
npx supabase start
npx supabase db push

# Executar testes de integração
npm test -- --run integration
```

## Estrutura dos Testes

```
lib/tools/health-plan/__tests__/
├── fetch-erp-prices.test.ts    # Suite principal de testes
└── README.md                   # Este arquivo
```

## Coverage Esperado

- **Target**: >85%
- **Componentes cobertos**:
  - `calculateFamilyPrice()`: 100%
  - Cache operations: 100%
  - Cache key generation: 100%
  - HTTP client scenarios: Parcial (estrutura pronta)

## Próximos Passos

### Testes Pendentes (Requerem Integração Completa)

1. **Retry Logic End-to-End**
   - Testar retry em falhas de rede reais
   - Validar backoff exponencial
   - Confirmar máximo de tentativas

2. **Graceful Degradation End-to-End**
   - Simular API offline
   - Validar fallback para stale cache
   - Testar limite de 24 horas

3. **Integração Supabase**
   - Testar CRUD de configurações ERP
   - Validar RLS policies
   - Testar criptografia/decriptografia de API keys

4. **Performance Tests**
   - Benchmark de cache hit vs API call
   - Stress test com múltiplos workspaces
   - Concurrency test

## Debugging

### Logs Durante Testes

Os logs do cache e cliente HTTP são habilitados automaticamente:

```typescript
// Cache logs
[ERPPriceCache] Auto-cleanup removed 5 expired entries

// Client logs
[ERPClient] Request attempt 1 { workspace_id: '...', ... }
[ERPClient] Success after 1 attempt(s) in 125ms
```

### Mock Server Debug

Para ver requisições MSW:

```typescript
mockServer.events.on('request:start', ({ request }) => {
  console.log('MSW intercepted:', request.method, request.url)
})
```

## Referências

- **PRD**: `.taskmaster/docs/health-plan-agent-prd.md` (RF-006, linhas 176-197)
- **Implementação**: `task-8-implementation-plan.md`
- **Vitest**: https://vitest.dev/
- **MSW**: https://mswjs.io/

## Contribuindo

Ao adicionar novos testes:

1. Siga a estrutura `describe` > `it` existente
2. Use nomes descritivos (português)
3. Adicione comentários para testes complexos
4. Atualize este README com novos cenários
5. Mantenha coverage >85%

---

**Última atualização:** 2025-11-18
**Versão:** 1.0
**Autor:** Task 8 Implementation
