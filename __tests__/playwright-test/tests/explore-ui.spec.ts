import { test, expect } from '@playwright/test';

const BASE_URL = 'https://chat-ui-next.vercel.app';
const LOGIN_EMAIL = 'play-felix@hotmail.com';

test.describe('Explore - Find Files tab', () => {
  test('Click each sidebar icon', async ({ page }) => {
    test.setTimeout(90000);

    // Login
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

    // Abrir sidebar
    await page.mouse.click(20, 375);
    await page.waitForTimeout(1500);

    // Clicar cada icon e capturar screenshot
    const yPositions = [68, 124, 180, 236, 292, 348, 396];

    for (let i = 0; i < yPositions.length; i++) {
      await page.mouse.click(28, yPositions[i]);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `screenshots/sidebar-icon-${i}.png` });
      console.log(`Icon ${i} clicked (y=${yPositions[i]})`);
    }

    expect(true).toBe(true);
  });
});
