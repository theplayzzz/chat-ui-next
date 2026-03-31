# Playwright E2E Tests

## O que e o Playwright

Playwright e uma ferramenta de automacao de browser que simula um usuario real. Ele abre um Chromium headless (sem janela), navega na aplicacao, clica em botoes, preenche formularios, envia mensagens no chat, e captura screenshots de cada etapa.

Usamos para validar que a aplicacao funciona corretamente do ponto de vista do usuario, sem depender de testes manuais.

## Setup

```bash
cd __tests__/playwright-test
npm install                        # Instalar dependencias
npx playwright install chromium    # Instalar browser
npx playwright install-deps        # Instalar dependencias do SO
```

## Como Executar

```bash
# Rodar um teste especifico
npx playwright test tests/<arquivo>.spec.ts --project=chromium --reporter=list

# Rodar todos os testes
npx playwright test --project=chromium --reporter=list

# Rodar com modo visual (precisa de display)
npx playwright test --project=chromium --headed
```

Screenshots sao salvos automaticamente em `screenshots/`.

---

## Conta de Teste

| Campo | Valor |
|-------|-------|
| **URL** | `https://chat-ui-next.vercel.app` |
| **Email** | `play-felix@hotmail.com` |
| **Autenticacao** | Magic link (sem senha) |
| **Assistente padrao** | Health Plan v2 |
| **Workspace** | `78fb784a-4fc1-46da-8a31-82db56dc09e6` |

---

## Como o Login Funciona

```typescript
// 1. Acessar a landing page
await page.goto('https://chat-ui-next.vercel.app');

// 2. Clicar "Start Chatting"
await page.locator('text=Start Chatting').click();
await page.waitForTimeout(2000);

// 3. Preencher email e clicar "Entrar"
await page.locator('input[type="email"]').first().fill('play-felix@hotmail.com');
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForTimeout(5000);

// Pronto — esta no chat
```

**Nota**: O login por magic link funciona sem senha neste ambiente. O Supabase esta configurado para aceitar login direto com email.

---

## Mapa da Interface

```
┌─────────┬──────────────────────────────────────────┐
│ Icons   │ Sidebar (toggle: click x=20, y=375)      │
│ laterais│                                          │
│ x=28    │ Conteudo muda conforme icon clicado       │
│         │                                          │
│ y=12  ◉ │ Chat (historico de conversas)             │
│ y=68  ◎ │ Prompts                                  │
│ y=124 ◎ │ Presets                                  │
│ y=180 ◎ │ Assistants                               │
│ y=236 ◎ │ ← FILES   [+ New File]                   │
│ y=292 ◎ │ ← COLLECTIONS [+ New Collection]          │
│ y=348 ◎ │ Models                                   │
│ y=396 ◎ │ Tools                                    │
│ y=660 ◎ │ Profile                                  │
├─────────┤                                          │
│   [>]   │ Seta para abrir/fechar sidebar            │
└─────────┴──────────────────────────────────────────┘

CHAT INPUT:
┌──────────────────────────────────────────────────┐
│  ┌─[⊕][📚]──────────────────────────────[▶]──┐  │
│  │ Ask anything. Type @ / # !                 │  │
│  └────────────────────────────────────────────┘  │
│   ⊕ = upload novo arquivo                        │
│   📚 = abrir seletor de collections              │
│   ▶ = enviar mensagem                            │
│   # = abrir file picker (selecionar existente)   │
└──────────────────────────────────────────────────┘
```

## Navegacao Basica (Snippets)

### Abrir Sidebar
```typescript
await page.mouse.click(20, 375);  // Clicar na seta >
await page.waitForTimeout(1000);
```

### Ir para Files
```typescript
await page.mouse.click(28, 236);  // Icon de Files
await page.waitForTimeout(1000);
```

### Ir para Collections
```typescript
await page.mouse.click(28, 292);  // Icon de Collections
await page.waitForTimeout(1000);
```

### Upload de Arquivo via Chat (+)
```typescript
const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles('/caminho/para/arquivo.pdf');
await page.waitForTimeout(10000);  // Aguardar processamento
```

### Upload via Wizard (Sidebar → + New File)
```typescript
await page.mouse.click(28, 236);  // Files
await page.locator('button:has-text("New File")').click();
// Wizard abre: selecionar arquivo → proximo → confirmar → processar
```

### Abrir Collection Selector
```typescript
await page.mouse.click(311, 657);  // Icone de livros no chat input
await page.waitForTimeout(8000);   // Aguardar collections carregarem
```

### Enviar Mensagem no Chat
```typescript
const textarea = page.locator('textarea').first();
await textarea.click();
await textarea.fill('Sua mensagem aqui');
await textarea.press('Enter');

// Aguardar resposta do agente (pode levar 30-90s)
for (let i = 0; i < 45; i++) {
  await page.waitForTimeout(2000);
  const spinning = await page.locator('.animate-spin').isVisible().catch(() => false);
  if (!spinning && i > 3) break;
}
```

### Selecionar Arquivo via # (File Picker)
```typescript
const textarea = page.locator('textarea').first();
await textarea.fill('#');
await page.waitForTimeout(1500);  // File Picker abre
// Clicar no arquivo desejado
await page.locator('div[tabindex="0"]').filter({ hasText: /nome_do_arquivo/ }).first().click();
```

### Deletar Arquivo
```typescript
// 1. Sidebar → Files
await page.mouse.click(28, 236);
// 2. Clicar no arquivo
await page.locator('div[tabindex="0"]').filter({ hasText: /nome\.pdf/ }).first().click();
await page.waitForTimeout(1500);
// 3. Clicar "Delete" (texto vermelho no rodape do sheet)
await page.locator('button:has-text("Delete")').first().click();
await page.waitForTimeout(2000);
```

### Criar Collection
```typescript
await page.mouse.click(28, 292);  // Collections
await page.locator('button:has-text("New Collection")').click();
await page.waitForTimeout(1500);
await page.locator('input[placeholder*="Collection name"]').fill('Nome da Collection');
await page.locator('textarea[placeholder*="Descreva"]').first().fill('Descricao');
await page.locator('button:has-text("Create")').first().click();
```

### Capturar Screenshot
```typescript
await page.screenshot({ path: 'screenshots/nome-descritivo.png', fullPage: true });
```

### Capturar Console Logs do Browser
```typescript
page.on('console', msg => {
  console.log(`BROWSER: ${msg.text()}`);
});
```

---

## Template para Novo Teste

```typescript
import { test, expect } from '@playwright/test';

const BASE_URL = 'https://chat-ui-next.vercel.app';
const LOGIN_EMAIL = 'play-felix@hotmail.com';

async function login(page: any) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
  const startBtn = page.locator('text=Start Chatting');
  if (await startBtn.isVisible()) {
    await startBtn.click();
    await page.waitForTimeout(2000);
  }
  if (page.url().includes('login')) {
    await page.locator('input[type="email"]').first().fill(LOGIN_EMAIL);
    await page.locator('button:has-text("Entrar")').first().click();
    await page.waitForTimeout(5000);
  }
}

test.describe('Nome do Teste', () => {
  test('Descricao do que esta testando', async ({ page }) => {
    test.setTimeout(120000);  // Timeout em ms

    await login(page);

    // ... seu teste aqui ...

    await page.screenshot({ path: 'screenshots/meu-teste.png', fullPage: true });
    expect(true).toBe(true);
  });
});
```

---

## Validacao no Banco (Supabase MCP)

Apos rodar testes Playwright, usar o Supabase MCP via Claude Code para validar dados no banco:

```
// No Claude Code:
mcp__supabase__execute_sql com query SQL
```

Exemplo:
```sql
-- Verificar arquivos criados
SELECT name, tokens, ingestion_status FROM files ORDER BY created_at DESC LIMIT 5;

-- Verificar chunks
SELECT count(*), count(openai_embedding) as embeddings FROM file_items WHERE file_id = '<id>';

-- Verificar logs do pipeline
SELECT stage, status, duration_ms FROM rag_pipeline_logs WHERE correlation_id = '<id>' ORDER BY created_at;
```

---

## Arquivos de Teste Existentes

| Arquivo | Fase | O que testa |
|---------|------|-------------|
| `qa-full-suite.spec.ts` | Fase 1 | Upload, delete, chat, pipeline logs |
| `qa-phase2-collections.spec.ts` | Fase 2 | Collections + chat semantico (5 perguntas) |
| `qa-phase3-collections-ui.spec.ts` | Fase 3 | Collection selector UI |
| `smoke.spec.ts` | — | Login basico |

## PDFs de Teste

Localizacao: `__tests__/documentos/`

| Arquivo | Tamanho | Conteudo |
|---------|---------|---------|
| Manual_de_Vendas_PME AMIL.pdf | 1.3 MB | Plano empresarial AMIL |
| Material de Apoio ao Corretor Linha Porto SaUDE.pdf | 2.1 MB | Porto Seguro |
| PLANOS BASICO.pdf | 1.4 MB | Planos basicos |
| PLANOS COM EINSTEIN.pdf | 4.9 MB | Planos com Einstein |
| Treinamento todas as linhas.pdf | 6.3 MB | Treinamento geral |

## Dicas

- **Timeout**: Use `test.setTimeout(120000)` para testes longos (chat pode demorar 90s)
- **Aguardar**: Sempre use `waitForTimeout` apos acoes que disparam requests
- **Collection Selector**: Precisa de 8s para carregar (query ao Supabase)
- **Chat response**: Aguardar `animate-spin` desaparecer (indicador de geracao)
- **Coordenadas**: Os `mouse.click(x, y)` sao baseados na resolucao 1280x720 (default Playwright)
- **Screenshots**: Sempre capture antes e depois de acoes criticas para debug
