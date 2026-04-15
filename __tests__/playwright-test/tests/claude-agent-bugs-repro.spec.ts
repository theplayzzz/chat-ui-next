/**
 * Claude Agent — Bug reproduction spec
 *
 * Reproduces two bugs the user reported in production:
 *   1. Duplicated messages: one user prompt produces multiple assistant
 *      responses (Claude Code emits several assistant/text blocks across
 *      its tool_use steps, and each is streamed as a separate bubble).
 *   2. Lost history: after leaving a chat and coming back, the previously
 *      sent messages are gone from the UI (messages not persisted to DB).
 *
 * Flow:
 *   - open app, create chat A with Claude Agent, send 2 messages
 *   - count how many assistant bubbles appeared per user message
 *   - open new chat B, send 1 message
 *   - navigate back to chat A via sidebar, check history still rendered
 */

import { expect, test } from "@playwright/test"

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

async function selectClaudeAgent(page: any): Promise<boolean> {
  await page.mouse.click(120, 27)
  await page.waitForTimeout(1500)
  const option = page.locator("text=Claude Agent Documentos").first()
  if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
    await option.click()
    await page.waitForTimeout(2000)
    return true
  }
  return false
}

/**
 * Sends a message, waits for the agent to finish, and returns how many
 * new assistant bubbles appeared. Bubble count > 1 = DUPLICATION BUG.
 */
async function sendAndCountBubbles(
  page: any,
  msg: string,
  timeoutSecs = 240,
  label = ""
): Promise<{ count: number; lastText: string; allTexts: string[] }> {
  const assistantSelector = ".bg-secondary .prose"
  const beforeCount = await page.locator(assistantSelector).count()

  const textarea = page.locator("textarea").first()
  await textarea.click()
  await page.waitForTimeout(300)
  await textarea.fill(msg)
  await textarea.press("Enter")
  await page.waitForTimeout(800)

  // Wait for at least one new bubble
  await page
    .waitForFunction(
      (count: number) =>
        document.querySelectorAll(".bg-secondary .prose").length > count,
      beforeCount,
      { timeout: timeoutSecs * 1000 }
    )
    .catch(() => {})

  // Wait for streaming to finish (spinner gone)
  await page
    .locator(".animate-spin")
    .waitFor({ state: "hidden", timeout: timeoutSecs * 1000 })
    .catch(() => {})

  // Give UI a bit more time in case a late bubble appears
  await page.waitForTimeout(3000)

  const afterCount = await page.locator(assistantSelector).count()
  const newBubbles = afterCount - beforeCount
  const allTexts: string[] = []
  const assistants = await page.locator(assistantSelector).all()
  for (let i = beforeCount; i < assistants.length; i++) {
    allTexts.push(((await assistants[i].textContent()) || "").trim())
  }
  const lastText = allTexts[allTexts.length - 1] || ""
  console.log(`  [${label}] new assistant bubbles: ${newBubbles}`)
  allTexts.forEach((t, i) => {
    console.log(`    [${label}#${i + 1}] (${t.length} chars) "${t.substring(0, 100).replace(/\s+/g, " ")}..."`)
  })
  return { count: newBubbles, lastText, allTexts }
}

async function countUserBubbles(page: any): Promise<number> {
  // User messages render without bg-secondary wrapper but with .prose
  const all = await page.locator(".prose").count()
  const assistant = await page.locator(".bg-secondary .prose").count()
  return all - assistant
}

test.describe("Claude Agent — Bug reproduction", () => {
  test.setTimeout(900000) // 15 min

  test("duplicação + persistência de histórico", async ({ page }) => {
    // Capture network + console for later diagnosis
    const apiCalls: string[] = []
    page.on("response", resp => {
      if (resp.url().includes("claude-agent")) {
        apiCalls.push(`${resp.status()} ${resp.url().replace(BASE_URL, "")}`)
      }
    })
    page.on("pageerror", err => console.log(`[PAGE ERROR] ${err.message}`))
    page.on("console", msg => {
      if (msg.type() === "error") {
        console.log(`[BROWSER ERROR] ${msg.text().substring(0, 200)}`)
      }
    })

    await login(page)

    // ─── CHAT A ────────────────────────────────────────────────
    console.log("\n━━━━━━━━━━ CHAT A: initial conversation ━━━━━━━━━━")

    // Ensure we're starting fresh — click "+ New Chat" if present
    const newChatBtn = page.locator("text=New Chat").first()
    if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatBtn.click()
      await page.waitForTimeout(1500)
    }

    const selected = await selectClaudeAgent(page)
    console.log(`Selected Claude Agent: ${selected}`)

    const a1 = await sendAndCountBubbles(
      page,
      "Quais documentos você tem disponíveis? Liste em tópicos.",
      240,
      "A1"
    )
    const a2 = await sendAndCountBubbles(
      page,
      "Qual a carência para parto nos planos AMIL?",
      240,
      "A2"
    )

    await page.screenshot({ path: "screenshots/bug-repro-A-after.png", fullPage: true })

    // Grab chat A URL so we can come back
    const chatAUrl = page.url()
    const userBubblesA = await countUserBubbles(page)
    console.log(`Chat A URL: ${chatAUrl}`)
    console.log(`Chat A user bubbles: ${userBubblesA}`)

    // ─── CHAT B ────────────────────────────────────────────────
    console.log("\n━━━━━━━━━━ CHAT B: new chat ━━━━━━━━━━")

    const newChatBtn2 = page.locator("text=New Chat").first()
    if (await newChatBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatBtn2.click()
      await page.waitForTimeout(1500)
    }

    // Select claude agent again (new chat might reset assistant)
    await selectClaudeAgent(page)

    const b1 = await sendAndCountBubbles(
      page,
      "Olá! Você pode me explicar o plano Bronze RJ?",
      240,
      "B1"
    )

    await page.screenshot({ path: "screenshots/bug-repro-B-after.png", fullPage: true })
    const chatBUrl = page.url()
    console.log(`Chat B URL: ${chatBUrl}`)

    // ─── RETURN TO CHAT A ──────────────────────────────────────
    console.log("\n━━━━━━━━━━ RETURNING TO CHAT A ━━━━━━━━━━")

    // Prefer navigating by URL (most reliable)
    if (chatAUrl !== chatBUrl) {
      await page.goto(chatAUrl, { waitUntil: "networkidle", timeout: 30000 })
      await page.waitForTimeout(3000)
    }

    await page.screenshot({ path: "screenshots/bug-repro-A-returned.png", fullPage: true })

    const userBubblesAfterReturn = await countUserBubbles(page)
    const assistantBubblesAfterReturn = await page
      .locator(".bg-secondary .prose")
      .count()
    console.log(`After return — user bubbles: ${userBubblesAfterReturn}, assistant bubbles: ${assistantBubblesAfterReturn}`)

    // ─── REPORT ────────────────────────────────────────────────
    console.log("\n╔════════════════════════════════════════════╗")
    console.log("║  BUG REPRODUCTION RESULTS                   ║")
    console.log("╠════════════════════════════════════════════╣")
    console.log(`║  A1 bubbles per send:  ${a1.count} (expected: 1)`.padEnd(45) + "║")
    console.log(`║  A2 bubbles per send:  ${a2.count} (expected: 1)`.padEnd(45) + "║")
    console.log(`║  B1 bubbles per send:  ${b1.count} (expected: 1)`.padEnd(45) + "║")
    console.log(
      `║  Chat A after return — user:${userBubblesAfterReturn} asst:${assistantBubblesAfterReturn}`.padEnd(45) + "║"
    )
    console.log("╚════════════════════════════════════════════╝")
    console.log(`Network: ${apiCalls.join(" | ")}`)

    const duplicationBug =
      a1.count > 1 || a2.count > 1 || b1.count > 1
    const persistenceBug = userBubblesAfterReturn < 2 || assistantBubblesAfterReturn < 2

    console.log(
      `\nDUPLICATION BUG present: ${duplicationBug} | PERSISTENCE BUG present: ${persistenceBug}`
    )

    // These assertions FAIL on purpose to document the bugs before fix,
    // then PASS after the fix.
    expect.soft(a1.count, "A1 should produce exactly 1 assistant bubble").toBe(1)
    expect.soft(a2.count, "A2 should produce exactly 1 assistant bubble").toBe(1)
    expect.soft(b1.count, "B1 should produce exactly 1 assistant bubble").toBe(1)
    expect.soft(
      userBubblesAfterReturn,
      "Chat A should have 2 user messages after return"
    ).toBeGreaterThanOrEqual(2)
    expect.soft(
      assistantBubblesAfterReturn,
      "Chat A should have 2 assistant messages after return"
    ).toBeGreaterThanOrEqual(2)
  })
})
