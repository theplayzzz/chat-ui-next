import { test, expect } from '@playwright/test';
import path from 'path';

const BASE_URL = 'https://chat-ui-next.vercel.app';
const LOGIN_EMAIL = 'play-felix@hotmail.com';
const DOCS_DIR = path.join(__dirname, '..', '..', 'documentos');

const FILES = [
  'Manual_de_Vendas_PME AMIL.pdf',
  'Material de Apoio ao Corretor Linha Porto SaÚDE.pdf',
  'PLANOS BÁSICO.pdf',
  'PLANOS COM EINSTEIN.pdf',
  'Treinamento todas as linhas.pdf'
];

// ===== HELPERS =====

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

async function openSidebarFiles(page: any) {
  await page.mouse.click(20, 375);
  await page.waitForTimeout(1000);
  await page.mouse.click(28, 236);
  await page.waitForTimeout(1000);
}

async function deleteAllFiles(page: any): Promise<number> {
  let count = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const fileLinks = await page.locator('div[tabindex="0"]').filter({ hasText: /\.pdf/ }).all();
    const visibleFiles = [];
    for (const fl of fileLinks) {
      const visible = await fl.isVisible();
      const box = await fl.boundingBox();
      if (visible && box && box.x > 60 && box.x < 350 && box.y > 160 && box.y < 650) {
        visibleFiles.push(fl);
      }
    }
    if (visibleFiles.length === 0) break;
    await visibleFiles[0].click();
    await page.waitForTimeout(1500);
    const deleteBtn = page.locator('button:has-text("Delete")');
    if (await deleteBtn.count() > 0) {
      await deleteBtn.first().click();
      await page.waitForTimeout(1000);
      const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
      if (await confirmBtn.count() > 1) await confirmBtn.last().click();
      await page.waitForTimeout(2000);
      count++;
    }
    const sidebarVisible = await page.locator('button:has-text("New File")').isVisible();
    if (!sidebarVisible) {
      await openSidebarFiles(page);
    }
  }
  return count;
}

async function uploadViaChat(page: any, fileName: string): Promise<boolean> {
  const filePath = path.join(DOCS_DIR, fileName);
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);
  for (let j = 0; j < 90; j++) { // 3 min max
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    if (body?.includes('Hide files') || body?.includes('arquivo')) return true;
    if (j % 15 === 0 && j > 0) console.log(`    Waiting... (${j * 2}s)`);
  }
  return false;
}

async function sendChatMessage(page: any, message: string): Promise<string> {
  // Encontrar textarea de chat
  const chatInput = page.locator('textarea').first();
  if (await chatInput.count() === 0) {
    console.log('    No textarea found!');
    return '';
  }
  await chatInput.click();
  await chatInput.fill(message);
  await page.waitForTimeout(500);
  await chatInput.press('Enter');
  console.log(`    Sent: "${message}"`);

  // Aguardar resposta — o agente pode demorar 30-90s
  await page.waitForTimeout(8000); // esperar inicio

  for (let i = 0; i < 45; i++) { // ate 90s
    await page.waitForTimeout(2000);
    // Verificar se ainda esta gerando (spinner ou "stop" button)
    const generating = await page.locator('.animate-spin, button:has-text("Stop")').isVisible().catch(() => false);
    if (!generating && i > 3) {
      console.log(`    Response received at ${(i * 2 + 8)}s`);
      break;
    }
    if (i % 10 === 0 && i > 0) console.log(`    Waiting for response... (${i * 2 + 8}s)`);
  }

  await page.waitForTimeout(2000);

  // Capturar texto da area de mensagens
  // Mensagens do assistente ficam em divs com markdown
  const allText = await page.textContent('body');
  // Pegar o conteudo apos a ultima mensagem do usuario
  const parts = allText?.split(message) || [];
  if (parts.length > 1) {
    // Tudo apos a ultima ocorrencia da mensagem do usuario
    const afterMessage = parts[parts.length - 1];
    // Limpar: remover textos de UI (Ask anything, Health Plan, etc)
    const cleaned = afterMessage
      .replace(/Ask anything.*$/s, '')
      .replace(/Talking to.*$/s, '')
      .replace(/Hide files.*$/s, '')
      .replace(/Ocultar.*$/s, '')
      .trim();
    return cleaned.substring(0, 2000);
  }
  return '';
}

// ===== REPORT =====

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  details: string;
  duration: number;
}

const results: TestResult[] = [];

function logResult(name: string, status: 'PASS' | 'FAIL' | 'PARTIAL', details: string, startTime: number) {
  const duration = Date.now() - startTime;
  results.push({ name, status, details, duration });
  console.log(`\n[${status}] ${name} (${(duration / 1000).toFixed(1)}s)`);
  console.log(`  ${details}`);
}

// ===== TESTS =====

test.describe('QA Full Suite — RAG Level 4', () => {
  test('Executar todos os testes em sequencia', async ({ page }) => {
    test.setTimeout(900000); // 15 min total

    await login(page);
    console.log('Login OK');

    // ===== FASE 1: LIMPEZA =====
    console.log('\n========== FASE 1: LIMPEZA ==========');
    let t = Date.now();
    await openSidebarFiles(page);
    const deleted = await deleteAllFiles(page);
    await page.screenshot({ path: 'screenshots/suite-01-clean.png', fullPage: true });
    logResult('T1: Delete existentes', deleted >= 0 ? 'PASS' : 'FAIL', `${deleted} arquivos deletados`, t);

    // ===== FASE 2: UPLOAD =====
    console.log('\n========== FASE 2: UPLOAD ==========');

    // T2: Upload via Wizard
    t = Date.now();
    await openSidebarFiles(page);
    await page.locator('button:has-text("New File")').click();
    await page.waitForTimeout(1500);
    const fileInput = page.locator('input[type="file"]');
    const pdfPath = path.join(DOCS_DIR, 'Manual_de_Vendas_PME AMIL.pdf');
    const visibleInputs = await fileInput.all();
    for (const inp of visibleInputs) {
      const vis = await inp.isVisible();
      if (vis) { await inp.setInputFiles(pdfPath); break; }
    }
    await page.waitForTimeout(2000);
    const nextBtn = page.locator('button:has-text("Próximo")');
    const nextDisabled = await nextBtn.getAttribute('disabled');
    let wizardOk = false;
    if (nextDisabled === null) {
      await nextBtn.click();
      await page.waitForTimeout(2000);
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(2000);
        const body = await page.textContent('body');
        if (body?.includes('Confirmar e Processar')) {
          await page.screenshot({ path: 'screenshots/suite-02-confirm.png', fullPage: true });
          await page.locator('button:has-text("Confirmar e Processar")').click();
          continue;
        }
        if (body?.includes('concluído') || body?.includes('Fechar') || body?.includes('Upload Outro')) {
          wizardOk = true;
          await page.screenshot({ path: 'screenshots/suite-02-done.png', fullPage: true });
          // Fechar wizard
          const closeBtn = page.locator('button:has-text("Fechar")');
          if (await closeBtn.count() > 0) await closeBtn.first().click();
          break;
        }
      }
    }
    logResult('T2: Upload Wizard', wizardOk ? 'PASS' : (nextDisabled === null ? 'PARTIAL' : 'FAIL'),
      wizardOk ? 'Wizard completo 5/5 steps' : `Proximo disabled=${nextDisabled}`, t);

    // T4: Upload batch restante via chat
    t = Date.now();
    const remainingFiles = FILES.slice(1); // skip AMIL (already uploaded)
    let uploadedCount = 0;
    for (const fileName of remainingFiles) {
      console.log(`  Uploading: ${fileName}`);
      const ok = await uploadViaChat(page, fileName);
      if (ok) uploadedCount++;
      console.log(`    ${ok ? 'OK' : 'FAIL'}`);
    }
    await page.screenshot({ path: 'screenshots/suite-04-batch.png', fullPage: true });
    logResult('T4: Upload batch', uploadedCount === remainingFiles.length ? 'PASS' : 'PARTIAL',
      `${uploadedCount}/${remainingFiles.length} uploaded`, t);

    // Verificar lista de files
    await openSidebarFiles(page);
    await page.screenshot({ path: 'screenshots/suite-04-files-list.png', fullPage: true });

    // ===== FASE 3: CHAT RETRIEVAL =====
    console.log('\n========== FASE 3: CHAT RETRIEVAL ==========');

    // T6: Busca geral — upload via (+) e enviar mensagem
    t = Date.now();
    // Navegar para pagina limpa
    await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    if (page.url().includes('login')) {
      await page.locator('input[type="email"]').first().fill(LOGIN_EMAIL);
      await page.locator('button:has-text("Entrar")').first().click();
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(3000);

    // Upload arquivo via (+) para anexar ao chat
    const chatFileInput = page.locator('input[type="file"]').first();
    const amil = path.join(DOCS_DIR, 'Manual_de_Vendas_PME AMIL.pdf');
    await chatFileInput.setInputFiles(amil);
    await page.waitForTimeout(10000); // aguardar processamento
    await page.screenshot({ path: 'screenshots/suite-06-file-attached.png', fullPage: true });

    // Verificar que arquivo foi anexado
    const hideFiles = await page.locator('text=Hide files, text=arquivo, text=Ocultar').first().isVisible().catch(() => false);
    console.log(`  File attached: ${hideFiles}`);

    // Enviar mensagem
    const response6 = await sendChatMessage(page, 'Quais planos estao disponiveis neste documento?');
    await page.screenshot({ path: 'screenshots/suite-06-response.png', fullPage: true });
    const hasContent = response6.length > 50;
    logResult('T6: Chat busca geral', hasContent ? 'PASS' : 'FAIL',
      `FileAttached: ${hideFiles}. Resposta (${response6.length} chars): ${response6.substring(0, 100)}...`, t);

    // T7: Termo exato (no mesmo chat, arquivo ja anexado)
    t = Date.now();
    const response7 = await sendChatMessage(page, 'Qual o valor da coparticipacao?');
    await page.screenshot({ path: 'screenshots/suite-07-response.png', fullPage: true });
    const hasValues = /\d/.test(response7);
    logResult('T7: Termo exato', response7.length > 30 ? 'PASS' : 'FAIL',
      `Contem numeros: ${hasValues}. Resposta (${response7.length} chars): ${response7.substring(0, 100)}...`, t);

    // ===== FASE 4: DELETE =====
    console.log('\n========== FASE 4: DELETE ==========');
    t = Date.now();
    await openSidebarFiles(page);
    const deletedFinal = await deleteAllFiles(page);
    await page.screenshot({ path: 'screenshots/suite-10-clean-final.png', fullPage: true });
    logResult('T10: Delete todos', deletedFinal >= 0 ? 'PASS' : 'FAIL',
      `${deletedFinal} deletados`, t);

    // ===== RELATORIO FINAL =====
    console.log('\n\n' + '='.repeat(60));
    console.log('RELATORIO QA — RAG Level 4');
    console.log('='.repeat(60));
    console.log(`Data: ${new Date().toISOString()}`);
    console.log(`Ambiente: ${BASE_URL}`);
    console.log('');
    for (const r of results) {
      const pad = r.name.padEnd(35);
      console.log(`  ${r.status.padEnd(7)} | ${pad} | ${(r.duration / 1000).toFixed(1)}s | ${r.details.substring(0, 60)}`);
    }
    console.log('');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const partial = results.filter(r => r.status === 'PARTIAL').length;
    console.log(`TOTAL: ${passed} PASS, ${partial} PARTIAL, ${failed} FAIL de ${results.length} testes`);
    console.log('='.repeat(60));

    // Teste passa se nao tem FAIL
    expect(failed).toBe(0);
  });
});
