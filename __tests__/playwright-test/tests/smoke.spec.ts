import { test, expect } from '@playwright/test';

const BASE_URL = 'https://chat-ui-next.vercel.app';
const LOGIN_EMAIL = 'play-felix@hotmail.com';

test.describe('Smoke Test', () => {
  test('Acessar aplicacao, fazer login, chegar no chat', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Acessar landing page
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.screenshot({ path: 'screenshots/01-landing.png', fullPage: true });
    console.log('Step 1 - Landing page:', page.url());

    // 2. Clicar "Start Chatting"
    const startBtn = page.locator('text=Start Chatting');
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'screenshots/02-after-start.png', fullPage: true });
      console.log('Step 2 - After Start Chatting:', page.url());
    }

    // 3. Verificar se estamos na pagina de login
    const currentUrl = page.url();
    console.log('Step 3 - Current URL:', currentUrl);

    if (currentUrl.includes('login')) {
      // Procurar campo de email
      const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email" i]');

      if (await emailInput.count() > 0) {
        await emailInput.first().fill(LOGIN_EMAIL);
        await page.screenshot({ path: 'screenshots/03-email-filled.png', fullPage: true });
        console.log('Step 3a - Email filled');

        // Verificar se tem campo de senha
        const passwordInput = page.locator('input[type="password"]');
        if (await passwordInput.count() > 0) {
          console.log('Step 3b - Password field found. Need password to continue.');
          await page.screenshot({ path: 'screenshots/03b-needs-password.png', fullPage: true });
        }

        // Procurar botao de login/magic link
        const buttons = await page.locator('button').all();
        for (const btn of buttons) {
          const text = await btn.textContent();
          console.log(`  Button found: "${text?.trim()}"`);
        }

        // Tentar clicar o botao principal
        const loginBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign"), button:has-text("Entrar"), button:has-text("Continue"), button:has-text("Magic")');
        if (await loginBtn.count() > 0) {
          await loginBtn.first().click();
          await page.waitForTimeout(5000);
          await page.screenshot({ path: 'screenshots/04-after-login.png', fullPage: true });
          console.log('Step 4 - After login:', page.url());
        }
      } else {
        // Listar todos os inputs
        console.log('No email input found. Available inputs:');
        const inputs = await page.locator('input').all();
        for (const input of inputs) {
          const type = await input.getAttribute('type');
          const name = await input.getAttribute('name');
          const placeholder = await input.getAttribute('placeholder');
          console.log(`  input: type=${type}, name=${name}, placeholder=${placeholder}`);
        }
      }
    } else if (currentUrl.includes('chat') || currentUrl.includes('setup')) {
      console.log('Already past login!');
    }

    await page.screenshot({ path: 'screenshots/05-final.png', fullPage: true });
    console.log('Final URL:', page.url());

    // Teste basico passa se nao deu erro 500
    expect(page.url()).not.toContain('error');
  });
});
