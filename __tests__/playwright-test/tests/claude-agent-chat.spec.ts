/**
 * Claude Agent Documentos — Full Conversation Test (Vercel Production)
 *
 * Selects the "Claude Agent Documentos" assistant via the top-left dropdown,
 * then runs a 10-turn conversation about health plan documents.
 */

import { expect, test } from "@playwright/test"

const BASE_URL = "https://chat-ui-next.vercel.app"
const LOGIN_EMAIL = "play-felix@hotmail.com"
const ASSISTANT_NAME = "Claude Agent Documentos"

// ─── helpers ─────────────────────────────────────────────────────────────────

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

async function selectAssistant(page: any): Promise<boolean> {
  await page.screenshot({ path: "screenshots/ca-00-initial.png" })

  // The assistant selector is the dropdown button at top-left (shows current assistant name)
  // Click it to open the dropdown
  const dropdownBtn = page.locator("button").filter({ hasText: /health plan|claude agent|assistants/i }).first()
  const topBarBtn = page.locator("header button, [class*='header'] button, nav button").first()

  // Try clicking the assistant name dropdown (top-left corner, ~x=120, y=27)
  await page.mouse.click(120, 27)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: "screenshots/ca-01-after-dropdown-click.png" })

  // Look for the assistant name in the opened dropdown
  const agentOption = page.locator(`text="${ASSISTANT_NAME}"`).first()
  if (await agentOption.isVisible({ timeout: 3000 }).catch(() => false)) {
    await agentOption.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: "screenshots/ca-02-assistant-selected.png" })
    console.log(`[✓] Selected "${ASSISTANT_NAME}"`)
    return true
  }

  // Try partial match
  const partialMatch = page.locator("text=Claude Agent").first()
  if (await partialMatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await partialMatch.click()
    await page.waitForTimeout(1500)
    console.log(`[✓] Selected via partial match`)
    return true
  }

  // Screenshot the opened dropdown for debugging
  await page.screenshot({ path: "screenshots/ca-01-dropdown-content.png" })
  console.warn(`[✗] Could not find "${ASSISTANT_NAME}" in dropdown`)
  return false
}

async function waitForResponse(page: any, timeoutSecs = 180): Promise<string> {
  // Poll every 2 seconds, waiting for the spinner to appear and then stop
  let spinnerSeen = false
  let stableCount = 0
  const maxIter = timeoutSecs / 2

  for (let i = 0; i < maxIter; i++) {
    await page.waitForTimeout(2000)

    const spinning = await page
      .locator(".animate-spin")
      .isVisible()
      .catch(() => false)

    if (spinning) {
      spinnerSeen = true
      stableCount = 0
    } else {
      stableCount++
      // If spinner was seen and is now gone for 2 consecutive checks → done
      if (spinnerSeen && stableCount >= 2) break
      // If spinner was never seen after 8s → response probably already there
      if (!spinnerSeen && i >= 4) break
    }
  }

  await page.waitForTimeout(800)

  // Extract last assistant message
  const byRole = await page.locator('[data-message-role="assistant"]').all()
  if (byRole.length > 0) {
    return (await byRole[byRole.length - 1].textContent()) || ""
  }
  const prose = await page.locator(".prose").all()
  if (prose.length > 0) {
    return (await prose[prose.length - 1].textContent()) || ""
  }
  return ""
}

async function sendTurn(
  page: any,
  msg: string,
  idx: number
): Promise<string> {
  console.log(`\n─── Turn ${idx} ───────────────────────────────`)
  console.log(`→ "${msg.substring(0, 100)}"`)

  const textarea = page.locator("textarea").first()
  await textarea.click()
  await textarea.fill(msg)
  await textarea.press("Enter")

  const response = await waitForResponse(page)
  const preview = response.replace(/\s+/g, " ").substring(0, 350)
  console.log(`← "${preview}"`)

  await page.screenshot({
    path: `screenshots/ca-turn${String(idx).padStart(2, "0")}.png`
  })

  return response
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
    check: (r: string) => /campinas/i.test(r) && /sim|cobre|abrange/i.test(r),
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
    await login(page)

    // Select the Claude Agent assistant
    const selected = await selectAssistant(page)

    // Verify it's the right assistant (top-left should now show Claude Agent)
    const topText = await page.locator("header, nav, [class*='header']").first().textContent().catch(() => "")
    console.log(`Top bar text: "${topText?.substring(0, 80)}"`)
    console.log(`Assistant selected: ${selected}`)

    if (!selected) {
      // Last resort: try to navigate to the assistant directly via sidebar
      await page.screenshot({ path: "screenshots/ca-NOTSELECTED.png", fullPage: true })
    }

    const results: Array<{
      turn: number
      desc: string
      passed: boolean
      responseLen: number
    }> = []

    for (let i = 0; i < TURNS.length; i++) {
      const { msg, check, desc } = TURNS[i]
      let response = ""
      try {
        response = await sendTurn(page, msg, i + 1)
      } catch (e: any) {
        console.error(`Turn ${i + 1} error: ${e.message}`)
        response = ""
      }

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

    await page.screenshot({ path: "screenshots/ca-final.png", fullPage: true })

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
