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

async function sendMessage(page: any, message: string) {
  const textarea = page.locator("textarea").first()
  await textarea.click()
  await textarea.fill(message)
  await textarea.press("Enter")

  // Wait for response (up to 90s)
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(2000)
    const spinning = await page
      .locator(".animate-spin")
      .isVisible()
      .catch(() => false)
    if (!spinning && i > 3) break
  }
}

async function getLastAssistantMessage(page: any): Promise<string> {
  // Get all message containers and return the last assistant message
  const messages = await page.locator('[data-message-role="assistant"]').all()
  if (messages.length === 0) {
    // Fallback: try to get text from message containers
    const allText = await page.locator(".prose").last().textContent()
    return allText || ""
  }
  const lastMsg = messages[messages.length - 1]
  return (await lastMsg.textContent()) || ""
}

test.describe("Health Plan Agent v2 - Bug Fixes Validation", () => {
  test("Scenario 1: Family - should NOT re-ask age after confirmation", async ({
    page
  }) => {
    test.setTimeout(300000) // 5 min

    await login(page)
    await page.screenshot({
      path: "screenshots/fix-01-logged-in.png",
      fullPage: true
    })

    // Send initial message with all data
    await sendMessage(
      page,
      "Tenho 29 anos, moro em Nova Iguaçu RJ, orçamento de R$900/mês. " +
        "Minha esposa tem 25 anos e nosso filho tem 3 anos."
    )
    await page.screenshot({
      path: "screenshots/fix-01-after-data.png",
      fullPage: true
    })

    const firstResponse = await getLastAssistantMessage(page)
    console.log(
      "FIRST RESPONSE (first 300 chars):",
      firstResponse.substring(0, 300)
    )

    // Confirm data
    await sendMessage(page, "Sim, os dados estão corretos. Busque planos.")
    await page.screenshot({
      path: "screenshots/fix-01-after-confirm.png",
      fullPage: true
    })

    const secondResponse = await getLastAssistantMessage(page)
    console.log(
      "SECOND RESPONSE (first 300 chars):",
      secondResponse.substring(0, 300)
    )

    // The agent should NOT ask for age again
    const reAskedAge =
      secondResponse.toLowerCase().includes("quantos anos") ||
      secondResponse.toLowerCase().includes("qual sua idade") ||
      secondResponse.toLowerCase().includes("sua idade")

    // The agent should NOT show a generic greeting
    const showedGreeting =
      secondResponse.includes("Informações necessárias") &&
      secondResponse.includes("Sua **idade**")

    console.log("Re-asked age?", reAskedAge)
    console.log("Showed greeting?", showedGreeting)

    expect(reAskedAge).toBe(false)
    expect(showedGreeting).toBe(false)
  })

  test("Scenario 2: Empresarial - should NOT ask personal age", async ({
    page
  }) => {
    test.setTimeout(300000)

    await login(page)

    // Send empresarial request
    await sendMessage(
      page,
      "Preciso de um plano empresarial para minha empresa com 10 funcionários em São Paulo SP, orçamento de R$500 por vida."
    )
    await page.screenshot({
      path: "screenshots/fix-02-empresarial.png",
      fullPage: true
    })

    const response = await getLastAssistantMessage(page)
    console.log(
      "EMPRESARIAL RESPONSE (first 400 chars):",
      response.substring(0, 400)
    )

    // Should NOT ask "quantos anos você tem" for an empresarial flow
    const askedPersonalAge =
      response.toLowerCase().includes("quantos anos você tem") ||
      response.toLowerCase().includes("qual sua idade")

    console.log("Asked personal age for empresa?", askedPersonalAge)
    expect(askedPersonalAge).toBe(false)
  })

  test("Scenario 3: Messages should NOT contain __DEBUG__ in DB", async ({
    page
  }) => {
    test.setTimeout(300000)

    await login(page)

    // Send a simple message
    await sendMessage(
      page,
      "Olá, preciso de um plano de saúde individual em Belo Horizonte MG."
    )
    await page.screenshot({
      path: "screenshots/fix-03-debug-check.png",
      fullPage: true
    })

    const response = await getLastAssistantMessage(page)
    console.log("DEBUG CHECK RESPONSE (first 200 chars):", response.substring(0, 200))

    // The visible response should NOT contain __DEBUG__ markers
    const hasDebugMarkers = response.includes("__DEBUG__")
    console.log("Has __DEBUG__ in visible response?", hasDebugMarkers)
    expect(hasDebugMarkers).toBe(false)
  })
})
