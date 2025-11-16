# Health Plan Agent - extractClientInfo Tool

Ferramenta de extração de informações do cliente para recomendação de planos de saúde usando GPT-4o com structured output.

## 📁 Estrutura

```
lib/tools/health-plan/
├── extract-client-info.ts           # Implementação principal da tool
├── schemas/
│   └── client-info-schema.ts       # Schema Zod completo e validações
├── prompts/
│   └── extraction-prompts.ts       # Prompts otimizados para GPT-4o
├── validators/
│   └── missing-fields-detector.ts  # Validação e detecção de campos
├── types.ts                        # Types compartilhados
├── __tests__/
│   └── extract-client-info.test.ts # Testes completos
└── README.md                       # Esta documentação
```

## 🚀 Como Usar

### Exemplo Básico

```typescript
import { extractFromConversation } from "@/lib/tools/health-plan/extract-client-info"

const messages = [
  {
    role: "user",
    content: "Tenho 35 anos e moro em São Paulo. Posso pagar R$ 800 por mês."
  }
]

const result = await extractFromConversation(
  messages,
  process.env.OPENAI_API_KEY!
)

console.log(result.clientInfo) // { age: 35, city: "São Paulo", state: "SP", budget: 800 }
console.log(result.isComplete) // true
console.log(result.completeness) // 70 (porcentagem)
console.log(result.missingFields) // ["dependentes", "condições pré-existentes", ...]
```

### Extração Incremental

```typescript
// Primeira chamada
const result1 = await extractFromConversation(
  [{ role: "user", content: "Tenho 35 anos" }],
  apiKey
)

// Segunda chamada (merge automático)
const result2 = await extractFromConversation(
  [
    { role: "user", content: "Tenho 35 anos" },
    { role: "assistant", content: "E em qual cidade você mora?" },
    { role: "user", content: "São Paulo, capital" }
  ],
  apiKey,
  result1.clientInfo // Passa info anterior
)

console.log(result2.clientInfo)
// { age: 35, city: "São Paulo", state: "SP" }
```

## 📊 Schema de Dados

### ClientInfo Completo

```typescript
interface ClientInfo {
  // Campos obrigatórios
  age: number // 0-120
  city: string
  state: string // Sigla 2 letras (ex: SP, RJ)
  budget: number // Valor positivo em reais

  // Campos opcionais
  dependents?: Array<{
    relationship: "spouse" | "child" | "parent" | "other"
    age: number
  }>
  preExistingConditions?: string[]
  medications?: string[]
  preferences?: {
    networkType?: "broad" | "restricted"
    coParticipation?: boolean
    specificHospitals?: string[]
  }

  // Metadata (auto-gerado)
  metadata?: {
    extractedAt: string
    schemaVersion: string
    completeness: number
  }
}
```

## 🧪 Testes

### Executar Testes

```bash
npm test lib/tools/health-plan/__tests__/extract-client-info.test.ts
```

### Cobertura de Testes

- ✅ Parsing de JSON válido e inválido
- ✅ Validação Zod (valores válidos e inválidos)
- ✅ Detecção de campos faltantes
- ✅ Merge de informações incrementais
- ✅ Validação de completude
- ✅ Regras de negócio (warnings)
- ✅ Cenários complexos (famílias grandes, múltiplas condições)
- ✅ Valores edge (idade 0, 120, budget negativo)

## 🎯 Casos de Uso

### Caso 1: Informação Completa em Uma Mensagem

**Input:**
```
"Tenho 42 anos, moro em Belo Horizonte, MG.
Quero incluir minha esposa de 38 anos e dois filhos de 10 e 7 anos.
Meu orçamento é R$ 1500."
```

**Output:**
```json
{
  "age": 42,
  "city": "Belo Horizonte",
  "state": "MG",
  "budget": 1500,
  "dependents": [
    { "relationship": "spouse", "age": 38 },
    { "relationship": "child", "age": 10 },
    { "relationship": "child", "age": 7 }
  ],
  "isComplete": true,
  "completeness": 80
}
```

### Caso 2: Informação com Condições Médicas

**Input:**
```
"Tenho 28 anos, Rio de Janeiro.
Tenho diabetes tipo 2 e tomo metformina.
Posso pagar 600 reais."
```

**Output:**
```json
{
  "age": 28,
  "city": "Rio de Janeiro",
  "state": "RJ",
  "budget": 600,
  "preExistingConditions": ["diabetes tipo 2"],
  "medications": ["metformina"],
  "isComplete": true,
  "completeness": 85
}
```

### Caso 3: Linguagem Informal

**Input:**
```
"Opa, tenho 38, tô em Sampa, com a patroa de 35 e o moleque de 6.
Consigo pagar uns 900 mangos."
```

**Output:**
```json
{
  "age": 38,
  "city": "São Paulo",
  "state": "SP",
  "budget": 900,
  "dependents": [
    { "relationship": "spouse", "age": 35 },
    { "relationship": "child", "age": 6 }
  ]
}
```

## ⚠️ Casos Edge Conhecidos

### 1. Orçamento Ambíguo

**Input:** "Entre 500 e 800 reais"
**Comportamento:** Extrai média (650)

### 2. Múltiplos Dependentes da Mesma Relação

**Input:** "Três filhos de 15, 12 e 8 anos"
**Comportamento:** Cria 3 objetos dependentes com relationship: "child"

### 3. Estado por Extenso

**Input:** "Moro em São Paulo" (cidade e estado)
**Comportamento:** Tenta identificar sigla automaticamente (SP)

### 4. Condições Pré-Existentes Vagas

**Input:** "Problemas cardíacos"
**Comportamento:** Mantém descrição original

## 🔧 Configuração

### Variáveis de Ambiente

```bash
OPENAI_API_KEY=sk-...  # Obrigatório
```

### Parâmetros do Modelo GPT-4o

- **Model:** `gpt-4o`
- **Temperature:** `0.2` (consistência)
- **Max Tokens:** `4096`
- **Response Format:** `json_object`

## 📈 Métricas de Performance

### Benchmarks Esperados

- ✅ Acurácia de extração: **95%+**
- ✅ Detecção de campos faltantes: **100%**
- ✅ Tempo de resposta: **< 3 segundos**
- ✅ Custo por extração: **~$0.01** (GPT-4o)

### Limitações Conhecidas

1. **Dependentes sem idade explícita**: Se o usuário não mencionar idade, não será incluído
2. **Medicamentos genéricos**: Nomes informais podem ser mantidos como fornecidos
3. **Preferências implícitas**: Só captura preferências explicitamente mencionadas
4. **Multi-idioma**: Otimizado para português brasileiro

## 🐛 Troubleshooting

### Erro: "JSON inválido"

**Causa:** GPT-4o retornou texto não-JSON
**Solução:** Verificar se `response_format: { type: "json_object" }` está configurado

### Erro: Schema validation failed

**Causa:** Dados extraídos não batem com schema Zod
**Solução:** Revisar prompt para garantir formato correto

### Warning: Orçamento insuficiente

**Causa:** Budget per capita < R$ 200
**Comportamento:** Apenas warning, não bloqueia

## 🔄 Próximos Passos (Integração)

1. **Integrar com orquestrador** (Task #10)
   - Adicionar como Step 1 do fluxo
   - Salvar estado na sessão

2. **Criar API endpoint** (Task #10)
   - Route: `/api/chat/health-plan-agent/extract`
   - Autenticação via Supabase

3. **Frontend components** (Task #12)
   - ClientInfoCard para exibir dados coletados
   - Progress indicator (completeness%)

4. **Testes E2E** (Task #6)
   - Integração com API real
   - Validação end-to-end

## 📚 Referências

- **PRD:** `/.taskmaster/docs/health-plan-agent-prd.md` (RF-002)
- **Task Master:** Task #5 (subtasks 5.1-5.7)
- **Schema Zod:** [Zod Documentation](https://zod.dev)
- **OpenAI API:** [Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)

---

**Status:** ✅ Implementação Completa
**Última Atualização:** 2025-11-16
**Autor:** Claude Code (Task Master AI)
