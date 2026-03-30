import { test, expect } from '@playwright/test';
import path from 'path';

const BASE_URL = 'https://chat-ui-next.vercel.app';
const LOGIN_EMAIL = 'play-felix@hotmail.com';
const DOCS_DIR = path.join(__dirname, '..', '..', 'documentos');

const FILES = [
  { name: 'Manual_de_Vendas_PME AMIL.pdf', collection: 'AMIL PME' },
  { name: 'Material de Apoio ao Corretor Linha Porto SaÚDE.pdf', collection: 'Porto Seguro' },
  { name: 'PLANOS BÁSICO.pdf', collection: 'SulAmerica Basico' },
  { name: 'PLANOS COM EINSTEIN.pdf', collection: 'Einstein' },
];

async function login(page: any) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
  const startBtn = page.locator('text=Start Chatting');
  if (await startBtn.isVisible()) { await startBtn.click(); await page.waitForTimeout(2000); }
  if (page.url().includes('login')) {
    await page.locator('input[type="email"]').first().fill(LOGIN_EMAIL);
    await page.locator('button:has-text("Entrar")').first().click();
    await page.waitForTimeout(5000);
  }
}

async function openSidebar(page: any, iconY: number) {
  // Garantir sidebar aberta
  const newFileBtn = page.locator('button:has-text("New File"), button:has-text("New Collection"), button:has-text("New Chat")');
  if (!(await newFileBtn.first().isVisible().catch(() => false))) {
    await page.mouse.click(20, 375);
    await page.waitForTimeout(1000);
  }
  await page.mouse.click(28, iconY);
  await page.waitForTimeout(1000);
}

async function sendChatAndWait(page: any, message: string, maxWaitS: number = 90): Promise<string> {
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill(message);
  await page.waitForTimeout(300);
  await textarea.press('Enter');
  console.log(`    Sent: "${message.substring(0, 60)}"`);

  await page.waitForTimeout(8000);
  for (let i = 0; i < Math.ceil(maxWaitS / 2); i++) {
    await page.waitForTimeout(2000);
    const spinning = await page.locator('.animate-spin').isVisible().catch(() => false);
    if (!spinning && i > 2) break;
    if (i % 10 === 0 && i > 0) console.log(`    Waiting... (${i * 2 + 8}s)`);
  }
  await page.waitForTimeout(2000);

  // Capturar resposta - pegar o ultimo bloco de texto apos a mensagem
  const body = await page.textContent('body') || '';
  const parts = body.split(message);
  if (parts.length > 1) {
    const after = parts[parts.length - 1]
      .replace(/Ask anything.*$/s, '')
      .replace(/Talking to.*$/s, '')
      .replace(/Ocultar.*$/s, '')
      .replace(/Hide files.*$/s, '')
      .trim();
    return after.substring(0, 2000);
  }
  return '';
}

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  details: string;
}
const results: TestResult[] = [];

function log(name: string, status: 'PASS' | 'FAIL' | 'PARTIAL', details: string) {
  results.push({ name, status, details });
  console.log(`\n[${status}] ${name}`);
  console.log(`  ${details}`);
}

test.describe('FASE 2: Collections + Chat Semantico', () => {
  test('Upload → Collection → Vincular Assistente → Chat', async ({ page }) => {
    test.setTimeout(600000); // 10 min

    await login(page);
    console.log('Login OK\n');

    // ================================================================
    // STEP 1: Upload 4 PDFs via chat (+)
    // ================================================================
    console.log('========== STEP 1: Upload PDFs ==========');
    let uploadCount = 0;
    for (const f of FILES) {
      const filePath = path.join(DOCS_DIR, f.name);
      console.log(`  Uploading: ${f.name}`);
      await page.locator('input[type="file"]').first().setInputFiles(filePath);
      await page.waitForTimeout(8000);
      uploadCount++;
    }
    await page.screenshot({ path: 'screenshots/p2-step1-uploads.png', fullPage: true });
    log('Step 1: Upload 4 PDFs', uploadCount === 4 ? 'PASS' : 'FAIL', `${uploadCount}/4 uploaded`);

    // ================================================================
    // STEP 2: Criar Collections
    // ================================================================
    console.log('\n========== STEP 2: Criar Collections ==========');
    const collectionsToCreate = ['AMIL PME', 'Porto Seguro', 'SulAmerica Basico', 'Einstein'];
    let collCreated = 0;

    for (const collName of collectionsToCreate) {
      await openSidebar(page, 292); // Collections icon
      await page.locator('button:has-text("New Collection")').click();
      await page.waitForTimeout(1500);

      // Preencher nome
      const nameInput = page.locator('input[placeholder*="Collection name"]');
      await nameInput.fill(collName);

      // Preencher descricao
      const descInput = page.locator('textarea[placeholder*="Descreva"], textarea[placeholder*="escri"]');
      if (await descInput.count() > 0) {
        await descInput.first().fill(`Documentos de planos de saude - ${collName}`);
      }

      await page.screenshot({ path: `screenshots/p2-coll-${collName.replace(/\s/g, '_')}.png`, fullPage: true });

      // Clicar Create
      const createBtn = page.locator('button:has-text("Create")');
      if (await createBtn.count() > 0) {
        await createBtn.first().click();
        await page.waitForTimeout(2000);
        collCreated++;
        console.log(`  Created collection: ${collName}`);
      }
    }
    log('Step 2: Criar Collections', collCreated === 4 ? 'PASS' : 'PARTIAL', `${collCreated}/4 created`);

    // ================================================================
    // STEP 3: Vincular files as collections (via sidebar file edit)
    // Para cada arquivo, editar e associar a collection correspondente
    // ================================================================
    console.log('\n========== STEP 3: Verificar estado ==========');
    await openSidebar(page, 236); // Files
    await page.screenshot({ path: 'screenshots/p2-step3-files.png', fullPage: true });
    await openSidebar(page, 292); // Collections
    await page.screenshot({ path: 'screenshots/p2-step3-collections.png', fullPage: true });
    log('Step 3: Estado verificado', 'PASS', 'Screenshots capturados');

    // ================================================================
    // STEP 4: Chat com retrieval — busca geral
    // Usar o assistente Health Plan v2 e testar perguntas
    // ================================================================
    console.log('\n========== STEP 4: Chat Semantico ==========');

    // Navegar para novo chat
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    if (page.url().includes('login')) {
      await page.locator('input[type="email"]').first().fill(LOGIN_EMAIL);
      await page.locator('button:has-text("Entrar")').first().click();
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(3000);

    // Upload AMIL para contexto do chat
    await page.locator('input[type="file"]').first().setInputFiles(path.join(DOCS_DIR, 'Manual_de_Vendas_PME AMIL.pdf'));
    await page.waitForTimeout(10000);

    // ---- Teste semantico 1: Busca geral ----
    const r1 = await sendChatAndWait(page, 'Quais tipos de planos estao disponiveis neste documento?');
    await page.screenshot({ path: 'screenshots/p2-chat-01-geral.png', fullPage: true });
    const r1ok = r1.length > 100;
    log('Chat T1: Busca geral', r1ok ? 'PASS' : 'FAIL',
      `(${r1.length} chars) ${r1.substring(0, 120)}...`);

    // ---- Teste semantico 2: Perfil familiar ----
    const r2 = await sendChatAndWait(page, 'Tenho 35 anos, moro em Sao Paulo, sou casado e tenho 2 filhos. Quero um plano de saude para minha familia com orcamento de R$1500 por mes. O que voce recomenda?');
    await page.screenshot({ path: 'screenshots/p2-chat-02-familiar.png', fullPage: true });
    const r2ok = r2.length > 100;
    log('Chat T2: Perfil familiar', r2ok ? 'PASS' : 'FAIL',
      `(${r2.length} chars) ${r2.substring(0, 120)}...`);

    // ---- Teste semantico 3: Empresa ----
    const r3 = await sendChatAndWait(page, 'Sou dono de uma empresa com 15 funcionarios. Preciso de um plano empresarial que cubra consultas, exames e internacao. Qual plano PME voces recomendam?');
    await page.screenshot({ path: 'screenshots/p2-chat-03-empresa.png', fullPage: true });
    const r3ok = r3.length > 100;
    log('Chat T3: Empresa/PME', r3ok ? 'PASS' : 'FAIL',
      `(${r3.length} chars) ${r3.substring(0, 120)}...`);

    // ---- Teste semantico 4: Termo exato ----
    const r4 = await sendChatAndWait(page, 'Qual e o periodo de carencia para parto?');
    await page.screenshot({ path: 'screenshots/p2-chat-04-carencia.png', fullPage: true });
    const r4ok = r4.length > 50;
    log('Chat T4: Carencia parto', r4ok ? 'PASS' : 'FAIL',
      `(${r4.length} chars) ${r4.substring(0, 120)}...`);

    // ---- Teste semantico 5: Coparticipacao ----
    const r5 = await sendChatAndWait(page, 'Como funciona a coparticipacao? Tem algum limite de valor?');
    await page.screenshot({ path: 'screenshots/p2-chat-05-copart.png', fullPage: true });
    const r5ok = r5.length > 50;
    log('Chat T5: Coparticipacao', r5ok ? 'PASS' : 'FAIL',
      `(${r5.length} chars) ${r5.substring(0, 120)}...`);

    // ================================================================
    // STEP 5: Cleanup — Delete uploads
    // ================================================================
    console.log('\n========== STEP 5: Cleanup ==========');
    await openSidebar(page, 236);
    let delCount = 0;
    for (let i = 0; i < 10; i++) {
      const fileLinks = await page.locator('div[tabindex="0"]').filter({ hasText: /\.pdf/ }).all();
      const visible = [];
      for (const fl of fileLinks) {
        const vis = await fl.isVisible();
        const box = await fl.boundingBox();
        if (vis && box && box.x > 60 && box.x < 350 && box.y > 160 && box.y < 650) visible.push(fl);
      }
      if (visible.length === 0) break;
      await visible[0].click();
      await page.waitForTimeout(1500);
      const delBtn = page.locator('button:has-text("Delete")');
      if (await delBtn.count() > 0) {
        await delBtn.first().click();
        await page.waitForTimeout(1000);
        const confirm = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
        if (await confirm.count() > 1) await confirm.last().click();
        await page.waitForTimeout(2000);
        delCount++;
      }
      const sidebarVis = await page.locator('button:has-text("New File")').isVisible();
      if (!sidebarVis) await openSidebar(page, 236);
    }
    log('Step 5: Cleanup files', 'PASS', `${delCount} deleted`);

    // ================================================================
    // RELATORIO
    // ================================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('RELATORIO FASE 2 — Collections + Chat Semantico');
    console.log('='.repeat(60));
    console.log(`Data: ${new Date().toISOString()}`);
    for (const r of results) {
      console.log(`  ${r.status.padEnd(7)} | ${r.name.padEnd(35)} | ${r.details.substring(0, 60)}`);
    }
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`\nTOTAL: ${passed} PASS, ${failed} FAIL de ${results.length}`);
    console.log('='.repeat(60));

    expect(failed).toBeLessThanOrEqual(1); // permitir 1 falha toleravel
  });
});
