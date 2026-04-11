/**
 * Claude Agent Documentos — Full Conversation Test (Vercel Production)
 *
 * Uses the same login/select/send patterns as claude-agent-quick.spec.ts
 * (which is proven to work in ~42 seconds). Runs 10 turns about health plan docs.
 */

import { expect, test } from "@playwright/test"

const BASE_URL = "https://chat-ui-next.vercel.app"
const LOGIN_EMAIL = "play-felix@hotmail.com"

// ─── helpers (same pattern as claude-agent-quick.spec.ts) ─────────────────────

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
  // Click the assistant dropdown (top-left at ~x=120, y=27)
  await page.mouse.click(120, 27)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: "screenshots/ca-01-dropdown.png" })

  // Click Claude Agent Documentos
  const option = page.locator("text=Claude Agent Documentos").first()
  if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
    await option.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: "screenshots/ca-02-selected.png" })
    return true
  }
  await page.screenshot({ path: "screenshots/ca-01-no-option.png" })
  return false
}

async function sendAndWait(
  page: any,
  msg: string,
  timeoutSecs = 240,
  label = ""
): Promise<string> {
  // Assistant messages are wrapped in bg-secondary; user messages are not.
  // Use this to count only assistant messages before sending.
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
  console.log(
    `  [${label}] after send = "${afterValue.substring(0, 30)}" (empty = sent OK)`
  )

  await page.screenshot({ path: `screenshots/ca-${label}-sent.png` }).catch(() => {})

  // Wait for a new assistant message to appear (count > beforeCount)
  await page.waitForFunction(
    (count: number) =>
      document.querySelectorAll(".bg-secondary .prose").length > count,
    beforeCount,
    { timeout: timeoutSecs * 1000 }
  ).catch(() => {})

  // Also wait for spinner to disappear (streaming complete)
  await page
    .locator(".animate-spin")
    .waitFor({ state: "hidden", timeout: timeoutSecs * 1000 })
    .catch(() => {})

  await page.waitForTimeout(1000)

  // Read the last assistant message
  const assistants = await page.locator(assistantSelector).all()
  if (assistants.length > 0)
    return (await assistants[assistants.length - 1].textContent()) || ""
  return ""
}

// ─── 10-turn conversation ────────────────────────────────────────────────────

const TURNS = [
  {
    msg: "Olá! Quais documentos você tem disponíveis para consulta?",
    check: (r: string) => /amil|porto|einstein|básico|pdf|documento/i.test(r),
    desc: "Listar documentos disponíveis"
  },
  {
    msg: "O plano Bronze SP Mais da AMIL cobre a cidade de Campinas?",
    check: (r: string) => /campinas/i.test(r),
    desc: "Cobertura Campinas — Bronze SP Mais"
  },
  {
    msg: "Quais municípios exatamente esse plano cobre? Liste todos.",
    check: (r: string) =>
      /campinas|guarulhos|sorocaba|municípios/i.test(r) && /\d+/.test(r),
    desc: "Lista completa de municípios"
  },
  {
    msg: "Qual é a carência para parto nos planos AMIL? Pode ser reduzida?",
    check: (r: string) => /300/.test(r),
    desc: "Carência parto 300 dias"
  },
  {
    msg: "O plano Bronze RJ da AMIL tem coparticipação? Explique como funciona.",
    check: (r: string) => /coparticipação|copart/i.test(r),
    desc: "Coparticipação Bronze RJ"
  },
  {
    msg: "Qual a diferença entre plano Porte I e Porte II na AMIL empresarial?",
    check: (r: string) => /porte i|porte ii|2.*29|30.*99/i.test(r),
    desc: "PME Porte I vs II"
  },
  {
    msg: "Até que idade um filho pode ser dependente no plano empresarial?",
    check: (r: string) => /24/.test(r),
    desc: "Idade limite dependente (24 anos)"
  },
  {
    msg: "Quais são as operadoras disponíveis nos documentos que você consultou?",
    check: (r: string) => /amil/i.test(r),
    desc: "Operadoras nos documentos"
  },
  {
    msg: "A AMIL tem plano com acesso ao Hospital Albert Einstein? Em qual documento encontrou essa informação?",
    check: (r: string) => /einstein/i.test(r),
    desc: "Plano com Einstein + citação de fonte"
  },
  {
    msg: "Faça um resumo final: quais são os 3 pontos mais importantes que você encontrou nos documentos sobre os planos da AMIL?",
    check: (r: string) => r.length > 200 && /amil/i.test(r),
    desc: "Resumo final AMIL"
  }
]

// ─── TEST ─────────────────────────────────────────────────────────────────────

test.describe("Claude Agent Documentos — Conversação (Produção)", () => {
  test.setTimeout(1200000) // 20 min

  test("10 turnos sobre documentos de planos de saúde", async ({ page }) => {
    // Capture network requests to /api/chat/claude-agent
    const apiCalls: string[] = []
    page.on("request", req => {
      if (req.url().includes("claude-agent")) {
        apiCalls.push(
          `→ ${req.method()} ${req.url().replace(BASE_URL, "")}`
        )
      }
    })
    page.on("response", resp => {
      if (resp.url().includes("claude-agent")) {
        apiCalls.push(
          `← ${resp.status()} ${resp.url().replace(BASE_URL, "")}`
        )
      }
    })
    page.on("console", msg => {
      if (
        msg.type() === "error" ||
        msg.text().includes("claude-agent") ||
        msg.text().includes("Claude Agent")
      ) {
        console.log(
          `[BROWSER ${msg.type().toUpperCase()}] ${msg.text().substring(0, 200)}`
        )
      }
    })
    page.on("pageerror", err => console.log(`[PAGE ERROR] ${err.message}`))

    await login(page)

    const selected = await selectClaudeAgent(page)
    console.log(`Assistant selected: ${selected}`)

    const results: Array<{
      turn: number
      desc: string
      passed: boolean
      responseLen: number
    }> = []

    for (let i = 0; i < TURNS.length; i++) {
      const { msg, check, desc } = TURNS[i]
      console.log(`\n─── Turn ${i + 1} ───────────────────────────────`)
      console.log(`→ "${msg.substring(0, 100)}"`)

      let response = ""
      try {
        response = await sendAndWait(page, msg, 240, `t${i + 1}`)
      } catch (e: any) {
        console.error(`Turn ${i + 1} error: ${e.message}`)
        response = ""
      }

      const preview = response.replace(/\s+/g, " ").substring(0, 350)
      console.log(`← "${preview}"`)

      await page
        .screenshot({ path: `screenshots/ca-turn${String(i + 1).padStart(2, "0")}.png` })
        .catch(() => {})

      const passed = response.length > 20 && check(response)
      results.push({ turn: i + 1, desc, passed, responseLen: response.length })

      if (!passed) {
        console.log(
          `  ✗ FAIL — response (${response.length} chars): "${response.replace(/\s+/g, " ").substring(0, 200)}"`
        )
      } else {
        console.log(`  ✓ PASS (${response.length} chars)`)
      }
    }

    // Final summary
    const passed = results.filter(r => r.passed).length
    const total = results.length
    const pct = Math.round((passed / total) * 100)

    console.log("\n╔══════════════════════════════════════════╗")
    console.log("║   CLAUDE AGENT — RESULTADOS FINAIS        ║")
    console.log("╠══════════════════════════════════════════╣")
    for (const r of results) {
      console.log(
        `║ T${String(r.turn).padStart(2)} ${r.passed ? "✓" : "✗"} ${r.desc.substring(0, 35).padEnd(35)} ║`
      )
    }
    console.log("╠══════════════════════════════════════════╣")
    console.log(`║ Score: ${passed}/${total} = ${pct}%`.padEnd(43) + "║")
    console.log("╚══════════════════════════════════════════╝")

    console.log(
      `Network calls: ${apiCalls.length > 0 ? apiCalls.join(" | ") : "NONE"}`
    )

    await page
      .screenshot({ path: "screenshots/ca-final.png", fullPage: true })
      .catch(() => {})

    expect(
      passed,
      `Score ${pct}% (${passed}/${total}) — expected ≥70% (7/10).\n` +
        results
          .filter(r => !r.passed)
          .map(r => `  T${r.turn} FAIL: ${r.desc}`)
          .join("\n")
    ).toBeGreaterThanOrEqual(7)
  })
})
