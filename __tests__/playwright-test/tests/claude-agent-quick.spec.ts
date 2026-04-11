/**
 * Quick smoke test: verify Claude Agent is responding in the UI
 */
import { test, expect } from "@playwright/test"

const BASE_URL = "https://chat-ui-next.vercel.app"
const LOGIN_EMAIL = "play-felix@hotmail.com"

async function login(page: any) {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 })
  const startBtn = page.locator("text=Start Chatting")
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await startBtn.click()
    await page.waitForTimeout(2000)
  }
  if (page.url().includes("login")) {
    await page.locator('input[type="email"]').first().fill(LOGIN_EMAIL)
    await page.locator('button:has-text("Entrar")').first().click()
    await page.waitForTimeout(8000)
  }
  await page.waitForSelector("textarea", { timeout: 20000 }).catch(() => {})
}

async function selectClaudeAgent(page: any) {
  // Click the assistant dropdown (top-left at ~x=120, y=27)
  await page.mouse.click(120, 27)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: "screenshots/quick-01-dropdown.png" })

  // Click Claude Agent Documentos
  const option = page.locator("text=Claude Agent Documentos").first()
  if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
    await option.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: "screenshots/quick-02-selected.png" })
    return true
  }
  return false
}

async function sendAndWait(page: any, msg: string, timeoutSecs = 240, label = ""): Promise<string> {
  // Assistant messages are wrapped in bg-secondary; user messages are not.
  const assistantSelector = ".bg-secondary .prose"
  const beforeCount = await page.locator(assistantSelector).count()

  const textarea = page.locator("textarea").first()
  await textarea.click()
  await page.waitForTimeout(300)

  // fill() fires individual keyboard events — React processes onChange synchronously
  await textarea.fill(msg)

  const textareaValue = await textarea.inputValue().catch(() => "N/A")
  console.log(`  [${label}] textarea = "${textareaValue.substring(0, 60)}"`)

  await textarea.press("Enter")

  await page.waitForTimeout(800)
  const afterValue = await textarea.inputValue().catch(() => "N/A")
  console.log(`  [${label}] after send = "${afterValue.substring(0, 30)}" (empty = sent OK)`)

  await page.screenshot({ path: `screenshots/debug-${label}-2-sent.png` }).catch(() => {})

  // Wait for a new assistant message to appear
  await page.waitForFunction(
    (count: number) =>
      document.querySelectorAll(".bg-secondary .prose").length > count,
    beforeCount,
    { timeout: timeoutSecs * 1000 }
  ).catch(() => {})

  // Wait for spinner to disappear (streaming complete)
  await page.locator(".animate-spin")
    .waitFor({ state: "hidden", timeout: timeoutSecs * 1000 })
    .catch(() => {})
  await page.waitForTimeout(1000)

  const assistants = await page.locator(assistantSelector).all()
  if (assistants.length > 0) return (await assistants[assistants.length - 1].textContent()) || ""
  return ""
}

test("Claude Agent quick smoke test", async ({ page }) => {
  test.setTimeout(600000)

  // Capture network requests to /api/chat/claude-agent
  const apiCalls: string[] = []
  page.on("request", req => {
    if (req.url().includes("claude-agent")) {
      apiCalls.push(`→ ${req.method()} ${req.url().replace("https://chat-ui-next.vercel.app", "")}`)
    }
  })
  page.on("response", resp => {
    if (resp.url().includes("claude-agent")) {
      apiCalls.push(`← ${resp.status()} ${resp.url().replace("https://chat-ui-next.vercel.app", "")}`)
    }
  })
  // Capture console errors
  page.on("console", msg => {
    if (msg.type() === "error" || msg.text().includes("claude-agent") || msg.text().includes("Claude Agent")) {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text().substring(0, 200)}`)
    }
  })
  page.on("pageerror", err => console.log(`[PAGE ERROR] ${err.message}`))

  await login(page)
  const selected = await selectClaudeAgent(page)
  console.log("Assistant selected:", selected)

  // Turn 1: basic question
  console.log("\n[T1] Sending question about documents...")
  const r1 = await sendAndWait(page, "Quais documentos você tem disponíveis para consulta?", 240, "t1")
  console.log(`[T1] Response (${r1.length} chars): "${r1.replace(/\s+/g, " ").substring(0, 300)}"`)
  await page.screenshot({ path: "screenshots/quick-t1.png" })

  // Turn 2: specific fact question
  console.log("\n[T2] Sending specific question...")
  const r2 = await sendAndWait(page, "A cidade de Campinas é coberta pelo plano Bronze SP Mais da AMIL?", 240, "t2")
  console.log(`[T2] Response (${r2.length} chars): "${r2.replace(/\s+/g, " ").substring(0, 300)}"`)
  await page.screenshot({ path: "screenshots/quick-t2.png" })

  // Validate
  const t1ok = r1.length > 50 && /amil|porto|einstein|pdf|documento/i.test(r1)
  const t2ok = r2.length > 50 && /campinas/i.test(r2)

  console.log(`\nT1 (list docs): ${t1ok ? "✓ PASS" : "✗ FAIL"} — ${r1.length} chars`)
  console.log(`T2 (Campinas): ${t2ok ? "✓ PASS" : "✗ FAIL"} — ${r2.length} chars`)
  console.log(`Network calls: ${apiCalls.length > 0 ? apiCalls.join(" | ") : "NONE — send button never triggered the route"}`)

  expect(r1.length, `T1 response empty — Claude Agent not responding`).toBeGreaterThan(50)
  expect(r2.length, `T2 response empty — Claude Agent not responding`).toBeGreaterThan(50)
  expect(t2ok, `T2: expected "Campinas" in response. Got: "${r2.substring(0, 200)}"`).toBe(true)
})
