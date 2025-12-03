# LangSmith Trace Analyzer

Scripts para coleta e análise de traces do LangSmith.

## Estrutura

```
scripts/langsmith/
├── README.md              # Este arquivo
├── fetch-trace.ts         # Script principal de coleta
└── traces/                # Diretório com traces coletados
    ├── trace-dc78.json           # Dados completos (últimos 4 dígitos)
    └── trace-dc78-summary.json   # Resumo estruturado
```

## Pré-requisitos

1. **API Key do LangSmith** configurada:
   ```bash
   # No .env.local ou exportar no terminal
   LANGSMITH_API_KEY=lsv2_sk_...
   ```

2. **Dependência langsmith** instalada:
   ```bash
   npm install langsmith
   ```

## Como Usar

### 1. Coletar um Trace pelo ID

```bash
# Formato básico
npx tsx scripts/langsmith/fetch-trace.ts <TRACE_ID>

# Exemplo real
npx tsx scripts/langsmith/fetch-trace.ts 019ae160-3d81-7000-8000-0653eb0edc78
```

### 2. Onde encontrar o Trace ID

O `trace_id` pode ser encontrado:

- **Na URL do LangSmith**: `https://smith.langchain.com/o/.../projects/.../r/<TRACE_ID>`
- **Nos logs da aplicação**: Quando `LANGSMITH_TRACING=true`
- **No response do agente**: Alguns endpoints retornam o `trace_id`

### 3. Arquivos Gerados

Após executar o script, dois arquivos são criados em `traces/`:

| Arquivo | Descrição |
|---------|-----------|
| `trace-XXXX.json` | Dados completos de todas as runs |
| `trace-XXXX-summary.json` | Resumo estruturado para análise rápida |

**Nomenclatura**: `XXXX` são os últimos 4 dígitos do trace_id.

Exemplo:
- Trace ID: `019ae160-3d81-7000-8000-0653eb0edc78`
- Arquivos: `trace-dc78.json` e `trace-dc78-summary.json`

## Estrutura do Summary

```json
{
  "traceId": "019ae160-3d81-7000-8000-0653eb0edc78",
  "shortId": "dc78",
  "fetchedAt": "2025-12-03T12:00:00.000Z",
  "totalRuns": 10,
  "totalTokens": 211605,
  "promptTokens": 187320,
  "completionTokens": 24285,
  "totalDurationSeconds": 45.5,
  "status": "success",
  "problems": {
    "truncatedResponses": ["ChatOpenAI (id...)"],
    "errors": ["generateRecommendation: Nenhum plano disponível"]
  },
  "hierarchy": [
    "✅ health-plan-agent (chain) - 45.5s",
    "  ├── ✅ extractClientInfo (chain) - 2.8s",
    "  ├── ✅ searchHealthPlans (retriever) - 1.0s"
  ],
  "runs": [
    {
      "id": "...",
      "name": "health-plan-agent",
      "runType": "chain",
      "status": "success",
      "tokens": { "total": 70535, "prompt": 62440, "completion": 8095 }
    }
  ]
}
```

## API do LangSmith - Referência

### Usando o SDK (Recomendado)

```typescript
import { Client } from "langsmith";

const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
});

// Buscar todas as runs de um trace
const runs = [];
for await (const run of client.listRuns({
  traceId: "019ae160-3d81-7000-8000-0653eb0edc78",
})) {
  runs.push(run);
}
```

### Usando REST API Diretamente

```bash
curl -X POST "https://api.smith.langchain.com/api/v1/runs/query" \
  -H "x-api-key: $LANGSMITH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "trace_id": "019ae160-3d81-7000-8000-0653eb0edc78"
  }'
```

### Parâmetros Disponíveis para `listRuns`

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `traceId` | string | ID do trace para filtrar |
| `projectName` | string | Nome do projeto LangSmith |
| `runType` | string | Tipo: "chain", "llm", "retriever", "tool" |
| `filter` | string | Filtro avançado (ex: `eq(status, "error")`) |
| `isRoot` | boolean | Apenas runs raiz (sem parent) |
| `parentRunId` | string | Filtrar por parent específico |

### Filtros Avançados

```typescript
// Runs com erro
client.listRuns({
  projectName: "health-plan-agent",
  filter: 'eq(status, "error")'
});

// Runs lentas (> 5 segundos)
client.listRuns({
  projectName: "health-plan-agent",
  filter: 'gt(latency, "5s")'
});

// Por metadata
client.listRuns({
  projectName: "health-plan-agent",
  filter: 'eq(metadata_key, "chatId") and eq(metadata_value, "abc123")'
});
```

## Exemplos de Análise

### Listar Traces Salvos

```bash
ls -la scripts/langsmith/traces/
```

### Buscar Problemas em um Trace

```bash
# Ver resumo formatado
cat scripts/langsmith/traces/trace-dc78-summary.json | jq '.problems'
```

### Analisar Uso de Tokens

```bash
cat scripts/langsmith/traces/trace-dc78-summary.json | jq '{
  total: .totalTokens,
  prompt: .promptTokens,
  completion: .completionTokens,
  runs: .runs | length
}'
```

### Filtrar Runs por Tipo

```bash
cat scripts/langsmith/traces/trace-dc78.json | jq '[.[] | select(.run_type == "llm")]'
```

## Troubleshooting

### "Nenhuma run encontrada"

1. Verifique se o `trace_id` está correto
2. Confirme que você tem acesso ao projeto no LangSmith
3. O trace pode ainda estar sendo processado (aguarde alguns segundos)

### "LANGSMITH_API_KEY não configurada"

```bash
# Opção 1: Exportar no terminal
export LANGSMITH_API_KEY=lsv2_sk_...

# Opção 2: Adicionar ao .env.local
echo "LANGSMITH_API_KEY=lsv2_sk_..." >> .env.local
```

### "Error: 401 Unauthorized"

- A API key pode estar expirada
- Gere uma nova em: https://smith.langchain.com/settings

## Links Úteis

- [LangSmith Dashboard](https://smith.langchain.com)
- [LangSmith API Docs](https://api.smith.langchain.com/docs)
- [LangSmith SDK Reference](https://langsmith-sdk.readthedocs.io/)
- [Query Traces Guide](https://docs.langchain.com/langsmith/export-traces)
