/**
 * Claude Agent Accuracy Test Suite
 *
 * Tests the Claude Agent Docker service directly (no UI needed).
 * Calls the local Docker service at http://localhost:3011/message
 * with 5 targeted questions that previously scored 0% in the RAG pipeline.
 *
 * Expected: Claude Code reads PDFs directly → 80-100% accuracy with source citations
 */

import { expect, test } from "@playwright/test"

const SERVICE_URL = "http://localhost:3011"

const ACCURACY_QUESTIONS = [
  {
    id: "Q1",
    question:
      "Campinas é coberta pelo plano Bronze SP Mais da AMIL? Quais municípios esse plano cobre?",
    expectedContains: ["Campinas"],
    expectedPatterns: [/campinas/i, /bronze.*sp.*mais|sp.*mais.*bronze/i],
    description: "Geographic coverage — AMIL Bronze SP Mais municipalities"
  },
  {
    id: "Q2",
    question:
      "Qual o valor exato do plano Nacional Plus 4 da Porto Saúde para a faixa etária 34-38 anos?",
    // From PLANOS COM EINSTEIN.pdf price table
    expectedContains: ["2.547"],
    expectedPatterns: [/2[.,]547/i],
    description: "Price table — Nacional Plus 4, faixa 34-38"
  },
  {
    id: "Q3",
    question: "Qual é a carência para parto nos planos da AMIL? Quantos dias?",
    expectedContains: ["300"],
    expectedPatterns: [/300/],
    description: "Benefit detail — childbirth waiting period (300 days)"
  },
  {
    id: "Q4",
    question:
      "Até que idade um filho pode ser dependente nos planos de saúde empresariais da AMIL?",
    expectedContains: ["24"],
    expectedPatterns: [/24/],
    description: "Benefit detail — dependent child age limit (24 years)"
  },
  {
    id: "Q5",
    question: "Liste todos os municípios cobertos pelo plano Bronze SP Mais da AMIL.",
    expectedContains: [],
    expectedPatterns: [/campinas|guarulhos|sorocaba|santos|municípios|cidades/i],
    description: "Geographic list — AMIL Bronze SP Mais full municipality list"
  }
]

test.describe("Claude Agent Documentos — Accuracy (Docker Service)", () => {
  test.setTimeout(600000) // 10 min total

  test("health check — Docker service is running", async ({ request }) => {
    const resp = await request.get(`${SERVICE_URL}/health`)
    expect(resp.ok()).toBeTruthy()

    const body = await resp.json()
    console.log("[health]", JSON.stringify(body, null, 2))

    expect(body.status).toBe("ok")
    expect(body.documents.length).toBeGreaterThan(0)
    console.log(`Documents available: ${body.documents.join(", ")}`)
  })

  test("5 targeted accuracy questions (PDFs via Claude Code CLI)", async ({
    request
  }) => {
    const results: Array<{
      id: string
      description: string
      passed: boolean
      response: string
      matchedPatterns: string[]
    }> = []

    for (const q of ACCURACY_QUESTIONS) {
      console.log(`\n[${q.id}] ${q.description}`)
      console.log(`Question: "${q.question}"`)

      // Send message to Docker service directly
      const chatId = `playwright-accuracy-${q.id}-${Date.now()}`
      const resp = await request.post(`${SERVICE_URL}/message`, {
        data: { chatId, message: q.question },
        timeout: 300000 // 5 min per question (Claude Code reads PDFs)
      })

      expect(resp.ok(), `Service returned ${resp.status()} for ${q.id}`).toBeTruthy()

      const response = await resp.text()
      const preview = response.substring(0, 400).replace(/\n/g, " ")
      console.log(`Response: "${preview}..."`)

      const matchedPatterns = q.expectedPatterns
        .filter(pattern => pattern.test(response))
        .map(p => p.toString())

      const containsAll = q.expectedContains.every(expected =>
        response.toLowerCase().includes(expected.toLowerCase())
      )

      const passed = containsAll || matchedPatterns.length > 0

      console.log(
        `Result: ${passed ? "✓ PASS" : "✗ FAIL"} | patterns matched: ${matchedPatterns.length}/${q.expectedPatterns.length}`
      )
      if (!passed) {
        console.log(`  Expected to contain: ${q.expectedContains.join(", ")}`)
        console.log(`  Expected patterns: ${q.expectedPatterns.map(p => p.toString()).join(", ")}`)
        console.log(`  Full response: "${response}"`)
      }

      results.push({ id: q.id, description: q.description, passed, response, matchedPatterns })
    }

    // Final summary
    const passed = results.filter(r => r.passed).length
    const total = results.length
    const accuracy = Math.round((passed / total) * 100)

    console.log("\n========== CLAUDE AGENT ACCURACY RESULTS ==========")
    for (const r of results) {
      console.log(`  [${r.id}] ${r.passed ? "✓ PASS" : "✗ FAIL"} — ${r.description}`)
    }
    console.log(`\nFinal Accuracy: ${passed}/${total} = ${accuracy}%`)
    console.log("====================================================")

    // Expect at least 4/5 (80%) to pass
    expect(
      passed,
      `Claude Agent accuracy ${accuracy}% (${passed}/${total}) — expected ≥80% (4/5)\n${
        results
          .filter(r => !r.passed)
          .map(r => `  FAIL [${r.id}]: ${r.description}\n    Response: "${r.response.substring(0, 200)}"`)
          .join("\n")
      }`
    ).toBeGreaterThanOrEqual(4)
  })
})
