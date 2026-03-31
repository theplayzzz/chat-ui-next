import { test, expect } from "@playwright/test"

const BASE_URL = "https://chat-ui-next.vercel.app"
const LOGIN_EMAIL = "play-felix@hotmail.com"

async function login(page: any) {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 20000 })
  const startBtn = page.locator("text=Start Chatting")
  if (await startBtn.isVisible()) {
    await startBtn.click()
    await page.waitForTimeout(2000)
  }
  if (page.url().includes("login")) {
    await page.locator('input[type="email"]').first().fill(LOGIN_EMAIL)
    await page.locator('button:has-text("Entrar")').first().click()
    await page.waitForTimeout(5000)
  }
}

test.describe("Upload Missing Documents", () => {
  test("Upload Porto Saude PDF via chat input", async ({ page }) => {
    test.setTimeout(180000)
    await login(page)

    // Upload via file input
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(
      "/root/chat-ui-next/__tests__/documentos/Material de Apoio ao Corretor Linha Porto SaÚDE.pdf"
    )

    // Wait for upload and processing
    await page.waitForTimeout(60000)
    await page.screenshot({
      path: "screenshots/upload-porto-saude.png",
      fullPage: true
    })

    console.log("Porto Saude upload initiated")
    expect(true).toBe(true)
  })

  test("Upload Treinamento PDF via chat input", async ({ page }) => {
    test.setTimeout(180000)
    await login(page)

    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(
      "/root/chat-ui-next/__tests__/documentos/Treinamento todas as linhas.pdf"
    )

    await page.waitForTimeout(60000)
    await page.screenshot({
      path: "screenshots/upload-treinamento.png",
      fullPage: true
    })

    console.log("Treinamento upload initiated")
    expect(true).toBe(true)
  })
})
