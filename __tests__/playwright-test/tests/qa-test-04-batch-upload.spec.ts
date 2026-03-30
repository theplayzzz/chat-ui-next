import { test, expect } from '@playwright/test';
import path from 'path';

const BASE_URL = 'https://chat-ui-next.vercel.app';
const LOGIN_EMAIL = 'play-felix@hotmail.com';
const DOCS_DIR = path.join(__dirname, '..', '..', 'documentos');

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

const FILES = [
  'Material de Apoio ao Corretor Linha Porto SaÚDE.pdf',
  'PLANOS BÁSICO.pdf',
  'PLANOS COM EINSTEIN.pdf',
  'Treinamento todas as linhas.pdf'
];

test.describe('Teste 4: Upload batch via chat (+)', () => {
  test('Upload 4 PDFs restantes', async ({ page }) => {
    test.setTimeout(300000);

    await login(page);
    await page.waitForTimeout(2000);

    const results: { file: string; success: boolean; time: number }[] = [];

    for (let i = 0; i < FILES.length; i++) {
      const fileName = FILES[i];
      const filePath = path.join(DOCS_DIR, fileName);
      const startTime = Date.now();

      console.log(`\n[${i + 1}/${FILES.length}] Uploading: ${fileName}`);

      // Upload via chat (+) input[type="file"]
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);

      // Aguardar processamento
      let success = false;
      for (let j = 0; j < 60; j++) {
        await page.waitForTimeout(2000);
        const body = await page.textContent('body');
        if (body?.includes('Hide files')) {
          success = true;
          break;
        }
        if (j % 10 === 0 && j > 0) console.log(`  Waiting... (${j * 2}s)`);
      }

      const elapsed = Date.now() - startTime;
      results.push({ file: fileName, success, time: elapsed });
      console.log(`  ${success ? 'SUCCESS' : 'TIMEOUT'} (${(elapsed / 1000).toFixed(1)}s)`);
      await page.screenshot({ path: `screenshots/t4-upload-${i + 1}.png`, fullPage: true });

      // Remover pills de files para o proximo upload (clicar X nos pills)
      const removeButtons = page.locator('button:has(svg)').filter({ has: page.locator('svg') });
      // Ou simplesmente pressionar F para esconder e continuar
      await page.waitForTimeout(1000);
    }

    // Verificar na sidebar Files
    await page.mouse.click(20, 375);
    await page.waitForTimeout(1000);
    await page.mouse.click(28, 236);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/t4-files-list-final.png', fullPage: true });

    // Relatorio
    console.log('\n=== TESTE 4 RESULTADO ===');
    for (const r of results) {
      console.log(`  ${r.success ? 'PASS' : 'FAIL'} | ${r.file} (${(r.time / 1000).toFixed(1)}s)`);
    }
    const allSuccess = results.every(r => r.success);
    console.log(`Total: ${results.filter(r => r.success).length}/${results.length} succeeded`);

    expect(allSuccess).toBe(true);
  });
});
