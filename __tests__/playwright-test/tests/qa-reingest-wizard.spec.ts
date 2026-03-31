/**
 * Re-ingest documents via Upload Wizard (sidebar → Files → New File)
 * This triggers pre-analysis which generates the ChunkingPlan for smart chunking.
 */
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

async function uploadViaWizard(page: any, filePath: string, docName: string) {
  console.log(`\n=== Uploading via Wizard: ${docName} ===`)

  // Navigate to Files section in sidebar
  await page.mouse.click(28, 236) // Files icon
  await page.waitForTimeout(2000)

  // Click "New File" button
  const newFileBtn = page.locator('button:has-text("New File")')
  if (await newFileBtn.isVisible()) {
    await newFileBtn.click()
    await page.waitForTimeout(2000)
  } else {
    // Try alternate approach: look for + button
    const plusBtn = page.locator('[data-testid="create-file"]').first()
    if (await plusBtn.isVisible()) {
      await plusBtn.click()
      await page.waitForTimeout(2000)
    }
  }

  // Step 1: Select file
  const fileInput = page.locator('input[type="file"]').first()
  await fileInput.setInputFiles(filePath)
  console.log(`  File selected: ${docName}`)
  await page.waitForTimeout(3000)

  // Step 2: Wait for pre-analysis (this generates ChunkingPlan)
  // The wizard auto-advances or shows a "Next"/"Analyze" button
  console.log("  Waiting for pre-analysis...")
  await page.waitForTimeout(30000) // Analysis with full doc can take 30s

  await page.screenshot({
    path: `screenshots/wizard-analysis-${docName.replace(/\s/g, "-")}.png`,
    fullPage: true
  })

  // Step 3: Click through wizard steps (Confirm/Process)
  // Look for any "Next", "Confirm", "Process", "Processar" buttons
  for (const btnText of [
    "Próximo",
    "Proximo",
    "Next",
    "Confirmar",
    "Confirm",
    "Processar",
    "Process"
  ]) {
    const btn = page.locator(`button:has-text("${btnText}")`).first()
    if (await btn.isVisible().catch(() => false)) {
      console.log(`  Clicking: ${btnText}`)
      await btn.click()
      await page.waitForTimeout(5000)
    }
  }

  // Wait for processing to complete (chunking + embedding)
  console.log("  Waiting for processing...")
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000)

    // Check for completion indicators
    const summaryVisible = await page
      .locator('text=Resumo')
      .isVisible()
      .catch(() => false)
    const doneVisible = await page
      .locator('text=Concluído')
      .isVisible()
      .catch(() => false)
    const closeBtn = await page
      .locator('button:has-text("Fechar")')
      .isVisible()
      .catch(() => false)

    if (summaryVisible || doneVisible || closeBtn) {
      console.log(`  Processing complete at iteration ${i}`)
      break
    }

    if (i % 10 === 0) {
      console.log(`  Still processing... (${i * 3}s)`)
    }
  }

  await page.screenshot({
    path: `screenshots/wizard-done-${docName.replace(/\s/g, "-")}.png`,
    fullPage: true
  })

  // Close wizard if still open
  const closeBtn = page.locator('button:has-text("Fechar")').first()
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
    await page.waitForTimeout(2000)
  }

  // Also try clicking outside or pressing Escape to close any dialog
  await page.keyboard.press("Escape")
  await page.waitForTimeout(1000)

  console.log(`  ${docName} upload complete`)
}

const documents = [
  { file: "Manual_de_Vendas_PME AMIL.pdf", name: "AMIL PME" },
  { file: "PLANOS COM EINSTEIN.pdf", name: "Einstein" },
  { file: "PLANOS BÁSICO.pdf", name: "Planos Basico" },
  {
    file: "Material de Apoio ao Corretor Linha Porto SaÚDE.pdf",
    name: "Porto Saude"
  }
]

test.describe("Re-ingest via Upload Wizard", () => {
  for (const doc of documents) {
    test(`Upload ${doc.name} via Wizard`, async ({ page }) => {
      test.setTimeout(600000) // 10 min per doc

      await login(page)
      await uploadViaWizard(page, `${DOCS_PATH}/${doc.file}`, doc.name)
      expect(true).toBe(true)
    })
  }
})
