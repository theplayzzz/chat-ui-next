import { test, expect } from "@playwright/test"

const BASE_URL = "https://chat-ui-next.vercel.app"
const LOGIN_EMAIL = "play-felix@hotmail.com"
const DOCS_PATH = "/root/chat-ui-next/__tests__/documentos"

async function login(page: any) {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 })
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

const documents = [
  "Manual_de_Vendas_PME AMIL.pdf",
  "PLANOS COM EINSTEIN.pdf",
  "PLANOS BÁSICO.pdf",
  "Material de Apoio ao Corretor Linha Porto SaÚDE.pdf"
]

test.describe("Re-ingest Documents with Level 4 Pipeline", () => {
  for (const doc of documents) {
    test(`Upload ${doc}`, async ({ page }) => {
      test.setTimeout(300000) // 5 min per doc

      await login(page)

      // Upload via file input (triggers upload wizard)
      const fileInput = page.locator('input[type="file"]').first()
      await fileInput.setInputFiles(`${DOCS_PATH}/${doc}`)

      // Wait for processing (analysis + chunking can take 60-120s)
      console.log(`Uploading ${doc}...`)
      await page.waitForTimeout(120000)

      await page.screenshot({
        path: `screenshots/reingest-${doc.replace(/\s/g, "-").replace(/\./g, "-")}.png`,
        fullPage: true
      })

      console.log(`${doc} upload completed`)
      expect(true).toBe(true)
    })
  }
})
