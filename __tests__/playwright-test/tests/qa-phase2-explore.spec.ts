import { test, expect } from '@playwright/test';

const BASE_URL = 'https://chat-ui-next.vercel.app';
const LOGIN_EMAIL = 'play-felix@hotmail.com';

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

test.describe('Phase 2 Explore: Collections UI', () => {
  test('Map Collections section and create flow', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);

    // Abrir sidebar
    await page.mouse.click(20, 375);
    await page.waitForTimeout(1500);

    // Collections icon (y=292)
    await page.mouse.click(28, 292);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/p2-01-collections.png', fullPage: true });

    // Listar conteudo
    const buttons = await page.locator('button:visible').all();
    console.log('Buttons visible:');
    for (const b of buttons) {
      const text = await b.textContent();
      const box = await b.boundingBox();
      if (text?.trim() && box && box.x < 400) {
        console.log(`  "${text.trim().substring(0,40)}" x=${box.x.toFixed(0)} y=${box.y.toFixed(0)}`);
      }
    }

    // Clicar "+ New Collection"
    const newCollBtn = page.locator('button:has-text("New Collection")');
    if (await newCollBtn.isVisible()) {
      await newCollBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'screenshots/p2-02-new-collection-dialog.png', fullPage: true });

      // Mapear inputs no dialog
      const inputs = await page.locator('input:visible, textarea:visible').all();
      console.log('\nInputs in dialog:');
      for (const inp of inputs) {
        const type = await inp.getAttribute('type');
        const placeholder = await inp.getAttribute('placeholder');
        const name = await inp.getAttribute('name');
        console.log(`  type=${type}, name=${name}, placeholder=${placeholder}`);
      }

      const dialogBtns = await page.locator('button:visible').all();
      console.log('\nDialog buttons:');
      for (const b of dialogBtns) {
        const text = await b.textContent();
        if (text?.trim()) console.log(`  "${text.trim().substring(0,40)}"`);
      }
    }

    // Verificar se tem collections existentes
    const collItems = await page.locator('div[tabindex="0"]').filter({ hasText: /Proposta|Neural|AMIL|Porto|Einstein/ }).all();
    console.log(`\nExisting collections: ${collItems.length}`);
    for (const item of collItems) {
      const text = await item.textContent();
      if (await item.isVisible()) console.log(`  "${text?.trim().substring(0,50)}"`);
    }

    // Se tem collection existente, clicar pra ver detalhes
    if (collItems.length > 0 && await collItems[0].isVisible()) {
      await collItems[0].click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'screenshots/p2-03-collection-detail.png', fullPage: true });

      // Mapear o sheet de detalhes
      const labels = await page.locator('label:visible').all();
      console.log('\nCollection detail labels:');
      for (const l of labels) {
        const text = await l.textContent();
        if (text?.trim()) console.log(`  "${text.trim()}"`);
      }
    }

    expect(true).toBe(true);
  });
});
