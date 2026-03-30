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
    await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(LOGIN_EMAIL);
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForTimeout(5000);
  }
}

test.describe('Teste 1: Deletar todos os arquivos existentes', () => {
  test('Deletar cada arquivo via sidebar Files → Edit Sheet → Delete', async ({ page }) => {
    test.setTimeout(300000);

    await login(page);

    // Abrir sidebar → Files
    await page.mouse.click(20, 375);
    await page.waitForTimeout(1500);
    await page.mouse.click(28, 236);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'screenshots/t1-01-before-delete.png', fullPage: true });

    let deleteCount = 0;
    const maxDeletes = 20; // safety

    for (let attempt = 0; attempt < maxDeletes; attempt++) {
      // Verificar se ainda tem arquivos na lista
      // Arquivos sao divs com nomes de PDF na sidebar (entre y=170 e y=640, x entre 60 e 340)
      const fileLinks = await page.locator('div[tabindex="0"]').filter({ hasText: /\.pdf/ }).all();
      const visibleFiles = [];

      for (const fl of fileLinks) {
        const visible = await fl.isVisible();
        const box = await fl.boundingBox();
        if (visible && box && box.x > 60 && box.x < 350 && box.y > 160 && box.y < 650) {
          const text = await fl.textContent();
          visibleFiles.push({ el: fl, text: text?.trim() || '', y: box.y });
        }
      }

      if (visibleFiles.length === 0) {
        console.log(`\nNo more files to delete. Total deleted: ${deleteCount}`);
        break;
      }

      const target = visibleFiles[0];
      console.log(`\nDeleting [${attempt + 1}]: "${target.text.substring(0, 50)}"`);

      // Clicar no arquivo para abrir Sheet
      await target.el.click();
      await page.waitForTimeout(1500);

      // Clicar "Delete" (texto vermelho no rodape do Sheet)
      const deleteBtn = page.locator('button:has-text("Delete")');
      if (await deleteBtn.count() > 0) {
        await deleteBtn.first().click();
        await page.waitForTimeout(1000);

        // Verificar se apareceu dialog de confirmacao
        const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("OK"), button:has-text("Excluir"), button:has-text("Delete")');
        const confirmCount = await confirmBtn.count();
        if (confirmCount > 1) {
          // Segundo "Delete" ou "Confirm" no dialog
          await confirmBtn.last().click();
          await page.waitForTimeout(1000);
        }

        await page.waitForTimeout(2000);
        deleteCount++;
        console.log(`  Deleted successfully (#${deleteCount})`);
        await page.screenshot({ path: `screenshots/t1-delete-${deleteCount}.png`, fullPage: true });

        // Re-navegar para Files caso o Sheet tenha fechado a sidebar
        const sidebarVisible = await page.locator('button:has-text("New File")').isVisible();
        if (!sidebarVisible) {
          await page.mouse.click(20, 375);
          await page.waitForTimeout(1000);
          await page.mouse.click(28, 236);
          await page.waitForTimeout(1000);
        }
      } else {
        console.log('  Delete button not found, skipping');
        // Fechar o sheet clicando Cancel
        const cancelBtn = page.locator('button:has-text("Cancel")');
        if (await cancelBtn.count() > 0) await cancelBtn.first().click();
        await page.waitForTimeout(1000);
      }
    }

    await page.screenshot({ path: 'screenshots/t1-02-after-delete-all.png', fullPage: true });

    console.log(`\n=== TESTE 1 RESULTADO ===`);
    console.log(`Arquivos deletados: ${deleteCount}`);

    expect(deleteCount).toBeGreaterThan(0);
  });
});
