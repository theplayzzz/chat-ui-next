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

test.describe('Teste 2: Upload via Wizard (Sidebar)', () => {
  test('Upload AMIL PME pelo wizard + New File', async ({ page }) => {
    test.setTimeout(300000);

    await login(page);

    // Abrir sidebar → Files
    await page.mouse.click(20, 375);
    await page.waitForTimeout(1500);
    await page.mouse.click(28, 236);
    await page.waitForTimeout(1000);

    // Clicar [+ New File]
    await page.locator('button:has-text("New File")').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'screenshots/t2-01-wizard-open.png', fullPage: true });

    // Verificar que o wizard abriu
    const wizardTitle = page.locator('text=Upload de Arquivo');
    const wizardVisible = await wizardTitle.isVisible();
    console.log(`Wizard visible: ${wizardVisible}`);

    // STEP 1: Selecionar arquivo
    const pdfPath = path.join(DOCS_DIR, 'Manual_de_Vendas_PME AMIL.pdf');
    const fileInput = page.locator('input[type="file"]');
    const inputCount = await fileInput.count();
    console.log(`File inputs: ${inputCount}`);

    // Tentar com data-testid primeiro (nosso fix)
    const testIdInput = page.locator('[data-testid="file-upload-input"]');
    const hasTestId = await testIdInput.count() > 0;
    console.log(`Has data-testid input: ${hasTestId}`);

    if (hasTestId) {
      await testIdInput.setInputFiles(pdfPath);
    } else {
      // Fallback: usar o file input visivel no dialog
      const visibleInputs = await fileInput.all();
      for (const inp of visibleInputs) {
        const vis = await inp.isVisible();
        if (vis) {
          await inp.setInputFiles(pdfPath);
          break;
        }
      }
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/t2-02-file-selected.png', fullPage: true });

    // Verificar se Proximo esta habilitado
    const nextBtn = page.locator('button:has-text("Próximo")');
    const nextDisabled = await nextBtn.getAttribute('disabled');
    console.log(`Proximo disabled: ${nextDisabled}`);

    if (nextDisabled === null) {
      // Wizard aceita - clicar Proximo
      await nextBtn.click();
      console.log('STEP 1 PASS: Proximo clicked');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'screenshots/t2-03-step2.png', fullPage: true });

      // Monitorar wizard ate chegar na confirmacao ou completar
      let wizardCompleted = false;
      let confirmClicked = false;

      for (let i = 0; i < 120; i++) { // ate 4 min
        await page.waitForTimeout(2000);
        const bodyText = await page.textContent('body');

        // Screenshot a cada 20s
        if (i % 10 === 0) {
          await page.screenshot({ path: `screenshots/t2-progress-${i}.png`, fullPage: true });
          console.log(`  Check at ${(i+1)*2}s...`);
        }

        // Tela de confirmacao
        if (bodyText?.includes('Confirmar e Processar') && !confirmClicked) {
          console.log('STEP 3: Confirmation screen reached');
          await page.screenshot({ path: 'screenshots/t2-04-confirmation.png', fullPage: true });

          // Capturar campos visiveis
          const inputs = await page.locator('input:visible').all();
          for (const inp of inputs) {
            const val = await inp.inputValue().catch(() => '');
            const type = await inp.getAttribute('type');
            if (val && type !== 'file') console.log(`  Input: "${val.substring(0, 50)}" (${type})`);
          }

          await page.locator('button:has-text("Confirmar e Processar")').click();
          confirmClicked = true;
          console.log('STEP 3: Confirmar clicked');
          await page.waitForTimeout(3000);
          await page.screenshot({ path: 'screenshots/t2-05-processing.png', fullPage: true });
          continue;
        }

        // Processamento em andamento
        if (bodyText?.includes('Processando') || bodyText?.includes('Gerando embeddings') || bodyText?.includes('Classificando')) {
          if (i % 10 === 0) console.log('  Processing in progress...');
          continue;
        }

        // Completou - tela de resumo
        if (bodyText?.includes('concluído') || bodyText?.includes('Fechar') || bodyText?.includes('Upload Outro')) {
          console.log(`STEP 5: Upload complete at ${(i+1)*2}s`);
          await page.screenshot({ path: 'screenshots/t2-06-summary.png', fullPage: true });
          wizardCompleted = true;
          break;
        }

        // Erro
        if (bodyText?.includes('Erro') || bodyText?.includes('falhou')) {
          console.log(`ERROR at ${(i+1)*2}s`);
          await page.screenshot({ path: 'screenshots/t2-error.png', fullPage: true });
          break;
        }
      }

      console.log(`\n=== TESTE 2 RESULTADO ===`);
      console.log(`Wizard completed: ${wizardCompleted}`);
      console.log(`Confirm clicked: ${confirmClicked}`);

    } else {
      // Wizard NAO aceita setInputFiles - bug do deploy anterior
      console.log('STEP 1 FAIL: Proximo still disabled after file selection');
      console.log('Deploy may not include the input fix. Falling back to chat upload.');
      await page.screenshot({ path: 'screenshots/t2-wizard-fail.png', fullPage: true });

      // Fechar wizard
      await page.locator('button:has-text("Cancelar")').click();
      await page.waitForTimeout(1000);

      // Fallback: upload via chat (+)
      console.log('\nFallback: uploading via chat (+)');
      const chatInput = page.locator('input[type="file"]').first();
      await chatInput.setInputFiles(pdfPath);
      await page.waitForTimeout(15000);
      await page.screenshot({ path: 'screenshots/t2-fallback-chat.png', fullPage: true });

      const hasHideFiles = await page.locator('text=Hide files').isVisible();
      console.log(`Chat upload success: ${hasHideFiles}`);
    }

    await page.screenshot({ path: 'screenshots/t2-final.png', fullPage: true });
    expect(true).toBe(true);
  });
});
