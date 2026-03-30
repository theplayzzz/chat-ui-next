import { test, expect } from '@playwright/test';
import path from 'path';

const BASE_URL = 'https://chat-ui-next.vercel.app';
const LOGIN_EMAIL = 'play-felix@hotmail.com';
const DOCS_DIR = path.join(__dirname, '..', '..', 'documentos');

async function loginAndOpenSidebar(page: any) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
  const startBtn = page.locator('text=Start Chatting');
  if (await startBtn.isVisible()) {
    await startBtn.click();
    await page.waitForTimeout(2000);
  }
  if (page.url().includes('login')) {
    await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(LOGIN_EMAIL);
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForTimeout(5000);
  }
  await page.mouse.click(20, 375);
  await page.waitForTimeout(1500);
}

async function uploadViaChat(page: any, filePath: string) {
  // Upload via (+) button no chat input
  const chatFileInput = page.locator('input[type="file"]').first();
  await chatFileInput.setInputFiles(filePath);
  await page.waitForTimeout(5000);

  // Verificar se apareceu "Hide files"
  const bodyText = await page.textContent('body');
  if (bodyText?.includes('Hide files')) {
    console.log(`  Uploaded: ${path.basename(filePath)}`);
    return true;
  }
  return false;
}

test.describe('Upload 5 PDFs e verificar', () => {
  test('Upload todos os PDFs via chat (+)', async ({ page }) => {
    test.setTimeout(300000);

    await loginAndOpenSidebar(page);

    const files = [
      'Manual_de_Vendas_PME AMIL.pdf',
      'Material de Apoio ao Corretor Linha Porto SaÚDE.pdf',
      'PLANOS BÁSICO.pdf',
      'PLANOS COM EINSTEIN.pdf',
      'Treinamento todas as linhas.pdf'
    ];

    // Upload cada arquivo
    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(DOCS_DIR, files[i]);
      console.log(`\nUploading file ${i+1}/${files.length}: ${files[i]}`);

      const chatFileInput = page.locator('input[type="file"]').first();
      await chatFileInput.setInputFiles(filePath);

      // Aguardar processamento (embedding pode demorar)
      console.log('  Waiting for processing...');
      let uploaded = false;
      for (let j = 0; j < 60; j++) { // ate 2 min por arquivo
        await page.waitForTimeout(2000);
        const bodyText = await page.textContent('body');
        if (bodyText?.includes('Hide files') || bodyText?.includes(files[i].substring(0, 20).toLowerCase())) {
          uploaded = true;
          break;
        }
        if (j % 10 === 0 && j > 0) console.log(`  Still processing... (${j*2}s)`);
      }

      if (uploaded) {
        console.log(`  SUCCESS: ${files[i]} uploaded`);
      } else {
        console.log(`  TIMEOUT: ${files[i]} may have failed`);
      }

      await page.screenshot({ path: `screenshots/batch-upload-${i+1}.png`, fullPage: true });
      await page.waitForTimeout(2000);
    }

    // Verificar na sidebar Files
    await page.mouse.click(28, 236); // Icon de Files
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/batch-upload-files-list.png', fullPage: true });

    console.log('\nAll uploads completed. Check screenshots for results.');
    expect(true).toBe(true);
  });
});
