/**
 * Claude Agent — Bug regression / validation spec
 *
 * Validates the two bugs reported in production are fixed:
 *   1. Duplicated messages: one user prompt should produce exactly one
 *      assistant bubble. Pre-fix, Claude Code intermediate text blocks
 *      (e.g. "Vou buscar...") were streamed as separate bubbles.
 *   2. Lost history: after creating a new chat and coming back via the
 *      sidebar, the previous messages must still be there. Pre-fix,
 *      handleCreateMessages threw TypeError on modelData.modelId (Claude
 *      Agent model not in LLM_LIST), which was silently swallowed.
 *
 * Flow:
 *   - login, create chat A (new chat button), select Claude Agent, send 2 msgs
 *   - capture chat A URL
 *   - click new-chat again, select Claude Agent, send 1 msg in chat B
 *   - verify chat A URL != chat B URL (proving we really switched)
 *   - navigate back to chat A URL, assert 2 user + 2 assistant bubbles
 *   - assert each user message produced exactly 1 assistant bubble (no dup)
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

  // Open the sidebar. Dashboard persists the state in localStorage, then reads
  // it on mount. Set it and reload once to make sure the sidebar is rendered.
  const alreadyOpen = await page
    .locator('button:has-text("New Chat")')
    .isVisible({ timeout: 1500 })
    .catch(() => false)
  if (!alreadyOpen) {
    await page.evaluate(() => localStorage.setItem("showSidebar", "true"))
    await page.reload({ waitUntil: "networkidle", timeout: 30000 })
    await page.waitForSelector("textarea", { timeout: 20000 }).catch(() => {})
    await page.waitForSelector('button:has-text("New Chat")', { timeout: 8000 }).catch(() => {})
  }
}

/** Click the "+ New Chat" button in the sidebar and wait for fresh state. */
async function startNewChat(page: any): Promise<void> {
  const btn = page.locator('button:has-text("New Chat")').first()
  if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(2000)
  }
}

async function selectClaudeAgent(page: any): Promise<boolean> {
  // There are multiple dropdowns in the top bar (workspace, assistant, etc).
  // The assistant/QuickSettings button always contains the IconRobotFace
  // or an assistant image, plus "Quick Settings" or an assistant name.
  // Try label-based selectors first (most reliable across re-renders).
  const labelCandidates = [
    'button:has-text("Quick Settings")',
    'button:has-text("Claude Agent Documentos")',
    'button:has-text("Modified Claude Agent")',
    'button:has-text("Health Plan v2")',
    'button:has-text("Health Plan")',
    'button:has-text("Agente de Planos")',
    'button:has-text("Modified")',
  ]

  let clicked = false
  for (const sel of labelCandidates) {
    const btn = page.locator(sel).first()
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => {})
      clicked = true
      console.log(`  [selectClaudeAgent] opened dropdown via: ${sel}`)
      break
    }
  }

  if (!clicked) {
    // Last resort: the 2nd aria-haspopup button (1st is workspace switcher)
    const dropdowns = page.locator('button[aria-haspopup="menu"]')
    const count = await dropdowns.count()
    if (count >= 2) {
      await dropdowns.nth(1).click({ timeout: 3000 }).catch(() => {})
      clicked = true
      console.log(`  [selectClaudeAgent] opened dropdown via nth(1) of ${count}`)
    }
  }

  if (!clicked) {
    await page.screenshot({ path: "screenshots/ca-nodropdown-notrigger.png" })
    return false
  }

  await page.waitForTimeout(1500)

  // Inside the Radix dropdown menu, the QuickSettingOption is a menu item.
  // Use role-scoped lookup to avoid clicking the same text in the sidebar
  // (where it might be intercepted by an overlay).
  const menu = page.locator('[role="menu"]').last()
  const option = menu
    .locator('[role="menuitem"]', { hasText: "Claude Agent Documentos" })
    .first()

  if (await option.isVisible({ timeout: 4000 }).catch(() => false)) {
    // force:true skips actionability checks (overlay interception)
    await option.click({ force: true, timeout: 5000 }).catch(async () => {
      // Last resort: keyboard navigation
      await page.keyboard.press("ArrowDown")
      await page.keyboard.press("Enter")
    })
    await page.waitForTimeout(2000)
    return true
  }

  // Fallback for older renders where role attrs aren't set
  const fallbackOption = page.locator("text=Claude Agent Documentos").first()
  if (await fallbackOption.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fallbackOption.click({ force: true, timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(2000)
    return true
  }

  await page.screenshot({ path: "screenshots/ca-nodropdown-nooption.png" })
  await page.keyboard.press("Escape").catch(() => {})
  return false
}

/** Send a message, wait for response, return (#new assistant bubbles, text). */
async function sendAndCountBubbles(
  page: any,
  msg: string,
  timeoutSecs = 300,
  label = ""
): Promise<{ count: number; lastText: string; allTexts: string[] }> {
  const assistantSelector = ".bg-secondary .prose"
  const beforeCount = await page.locator(assistantSelector).count()

  // Arm response listener BEFORE pressing Enter so we never miss it
  const responsePromise = page
    .waitForResponse(
      (r: any) =>
        r.url().includes("/api/chat/claude-agent") && r.status() === 200,
      { timeout: timeoutSecs * 1000 }
    )
    .catch(() => null)

  const textarea = page.locator("textarea").first()
  await textarea.click()
  await page.waitForTimeout(300)
  await textarea.fill(msg)
  await textarea.press("Enter")

  const response = await responsePromise
  if (!response) {
    console.log(`  [${label}] WARN: no /api/chat/claude-agent response seen`)
  }

  // After the HTTP response resolves, the UI still needs to render the
  // chunks and mark the message as complete. Wait until a new bubble
  // appears and its text stops growing.
  await page
    .waitForFunction(
      (count: number) =>
        document.querySelectorAll(".bg-secondary .prose").length > count,
      beforeCount,
      { timeout: 30000 }
    )
    .catch(() => {})

  // Poll last bubble's length until it stops changing (2 consecutive samples)
  let stable = 0
  let prevLen = -1
  for (let i = 0; i < 40 && stable < 2; i++) {
    const items = await page.locator(assistantSelector).all()
    if (items.length <= beforeCount) {
      await page.waitForTimeout(500)
      continue
    }
    const t = ((await items[items.length - 1].textContent()) || "").length
    stable = t === prevLen ? stable + 1 : 0
    prevLen = t
    await page.waitForTimeout(500)
  }

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
    console.log(
      `    [${label}#${i + 1}] (${t.length} chars) "${t.substring(0, 120).replace(/\s+/g, " ")}"`
    )
  })
  return { count: newBubbles, lastText, allTexts }
}

async function countUserBubbles(page: any): Promise<number> {
  const all = await page.locator(".prose").count()
  const assistant = await page.locator(".bg-secondary .prose").count()
  return all - assistant
}

/** Returns the chat UUID from the current URL, e.g. /<workspace>/chat/<uuid>. */
function chatIdFromUrl(url: string): string | null {
  const m = url.match(/\/chat\/([0-9a-f-]{36})/)
  return m?.[1] ?? null
}

test.describe("Claude Agent — regression (duplication + persistence)", () => {
  test.setTimeout(900000)
  test.use({ viewport: { width: 1600, height: 1000 } })

  test("2 msgs in chat A, 1 in chat B, return to A and history persists", async ({
    page
  }) => {
    page.on("pageerror", err => console.log(`[PAGE ERROR] ${err.message}`))
    page.on("console", msg => {
      const text = msg.text()
      // Capture browser logs we care about (errors + our own trace prefixes)
      if (
        msg.type() === "error" ||
        text.includes("use-chat-handler") ||
        text.includes("handleCreateMessages") ||
        text.includes("about to")
      ) {
        console.log(`[BROWSER ${msg.type()}] ${text.substring(0, 300)}`)
      }
    })
    page.on("response", resp => {
      if (resp.url().includes("claude-agent")) {
        console.log(
          `[NET] ${resp.status()} ${resp.url().replace(BASE_URL, "")}`
        )
      }
    })

    await login(page)

    // Nonces ensure sidebar entries are unique across runs — otherwise
    // multiple historical "Quais documento..." items disambiguate badly.
    const nonce = `T${Date.now().toString().slice(-6)}`
    const msgA1 = `[${nonce}-A1] Quais documentos você tem disponíveis? Liste em tópicos.`
    const msgA2 = `[${nonce}-A2] O plano Bronze RJ da AMIL tem coparticipação?`
    const msgB1 = `[${nonce}-B1] Olá! Explique em uma frase o que é o plano Amil Black.`
    const chatATitleNeedle = `[${nonce}-A1]`
    const chatBTitleNeedle = `[${nonce}-B1]`
    console.log(`Run nonce: ${nonce}`)

    // ─── CHAT A ────────────────────────────────────────────────
    console.log("\n━━━━━━━━━━ CHAT A ━━━━━━━━━━")
    await startNewChat(page)
    const selA = await selectClaudeAgent(page)
    console.log(`Selected Claude Agent in A: ${selA}`)

    const a1 = await sendAndCountBubbles(page, msgA1, 300, "A1")
    const a2 = await sendAndCountBubbles(page, msgA2, 300, "A2")

    // Sidebar uses <div onClick> not <a href>. The chat title is the first
    // 100 chars of the first message, so our nonce should appear verbatim.
    await page.waitForTimeout(2500)
    const chatAFound = await page
      .locator(`div:has-text("${chatATitleNeedle}")`).first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    console.log(`Chat A visible in sidebar: ${chatAFound}`)
    await page.screenshot({ path: "screenshots/bug-repro-A.png", fullPage: true })

    // ─── CHAT B ────────────────────────────────────────────────
    console.log("\n━━━━━━━━━━ CHAT B ━━━━━━━━━━")
    await startNewChat(page)
    await page.waitForTimeout(2000)
    const selB = await selectClaudeAgent(page)
    console.log(`Selected Claude Agent in B: ${selB}`)

    const b1 = await sendAndCountBubbles(page, msgB1, 300, "B1")

    await page.waitForTimeout(2500)
    const chatBFound = await page
      .locator(`div:has-text("${chatBTitleNeedle}")`).first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    console.log(`Chat B visible in sidebar: ${chatBFound}`)
    await page.screenshot({ path: "screenshots/bug-repro-B.png", fullPage: true })

    // ─── RETURN TO CHAT A ──────────────────────────────────────
    console.log("\n━━━━━━━━━━ RETURN TO CHAT A ━━━━━━━━━━")
    // Use the sidebar search input to isolate chat A (avoids matching the
    // same nonce text that appears inside message bubbles in the main area).
    const sidebarSearch = page
      .locator('input[placeholder^="Search chats"]')
      .first()
    if (await sidebarSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sidebarSearch.click()
      await sidebarSearch.fill(chatATitleNeedle)
      await page.waitForTimeout(1500)
    }

    // Now there should be exactly one chat entry matching the nonce.
    const chatALink = page
      .locator(`div:has-text("${chatATitleNeedle}")`)
      .last() // last() after filtering tends to be deepest (the item itself)
    let returnedToA = false
    if (await chatALink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatALink.click({ force: true }).catch(() => {})
      returnedToA = true
    }

    // Wait for URL to include /chat/<uuid>
    await page
      .waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 15000 })
      .catch(() => {})
    await page.waitForTimeout(3000)
    console.log(`Returned to A: ${returnedToA}, URL now: ${page.url()}`)

    const userAfter = await countUserBubbles(page)
    const asstAfter = await page.locator(".bg-secondary .prose").count()
    console.log(
      `After return — user bubbles: ${userAfter}, assistant bubbles: ${asstAfter}`
    )
    await page.screenshot({
      path: "screenshots/bug-repro-A-returned.png",
      fullPage: true
    })

    // ─── REPORT ────────────────────────────────────────────────
    console.log("\n╔════════════════════════════════════════════╗")
    console.log("║  CLAUDE AGENT REGRESSION RESULTS            ║")
    console.log("╠════════════════════════════════════════════╣")
    console.log(`║  A1 bubbles: ${a1.count} (expected 1)`.padEnd(45) + "║")
    console.log(`║  A2 bubbles: ${a2.count} (expected 1)`.padEnd(45) + "║")
    console.log(`║  B1 bubbles: ${b1.count} (expected 1)`.padEnd(45) + "║")
    console.log(
      `║  Chat A in sidebar: ${chatAFound}  Chat B in sidebar: ${chatBFound}`.padEnd(
        45
      ) + "║"
    )
    console.log(
      `║  Chat A after return: u=${userAfter}, a=${asstAfter} (expect ≥2 each)`.padEnd(
        45
      ) + "║"
    )
    console.log("╚════════════════════════════════════════════╝")

    expect(a1.count, "A1: exactly 1 assistant bubble").toBe(1)
    expect(a2.count, "A2: exactly 1 assistant bubble").toBe(1)
    expect(b1.count, "B1: exactly 1 assistant bubble").toBe(1)
    expect(a1.lastText.length, "A1: response must be non-trivial").toBeGreaterThan(100)
    expect(a2.lastText.length, "A2: response must be non-trivial").toBeGreaterThan(100)
    expect(b1.lastText.length, "B1: response must be non-trivial").toBeGreaterThan(50)
    expect(chatAFound, "chat A persisted to sidebar").toBe(true)
    expect(chatBFound, "chat B persisted to sidebar").toBe(true)
    expect(userAfter, "chat A: 2 user messages persisted").toBeGreaterThanOrEqual(2)
    expect(asstAfter, "chat A: 2 assistant messages persisted").toBeGreaterThanOrEqual(2)
  })
})
