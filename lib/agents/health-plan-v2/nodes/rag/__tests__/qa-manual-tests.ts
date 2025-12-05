/**
 * Testes QA Manuais - Task 32 (Grading & Rewriting)
 *
 * Execute com:
 *   source .env.local && npx tsx lib/agents/health-plan-v2/nodes/rag/__tests__/qa-manual-tests.ts
 *
 * IMPORTANTE: Requer OPENAI_API_KEY configurada no ambiente
 */

import { gradeDocuments } from "../grade-documents"
import {
  rewriteQuery,
  detectProblem,
  shouldRewrite,
  MAX_REWRITE_ATTEMPTS
} from "../rewrite-query"
import type { FusedDocument } from "../result-fusion"

// Cores para output
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"

function logSection(title: string) {
  console.log(`\n${CYAN}${"=".repeat(60)}${RESET}`)
  console.log(`${BOLD}${CYAN}${title}${RESET}`)
  console.log(`${CYAN}${"=".repeat(60)}${RESET}\n`)
}

function logTest(name: string) {
  console.log(`${YELLOW}▶ Teste: ${name}${RESET}`)
}

function logExpected(expected: string) {
  console.log(`${CYAN}  Esperado: ${expected}${RESET}`)
}

function logResult(label: string, value: unknown) {
  console.log(`${GREEN}  ${label}: ${JSON.stringify(value, null, 2)}${RESET}`)
}

// ============================================================
// DADOS DE TESTE
// ============================================================

const clienteJovemSP = {
  age: 35,
  city: "São Paulo",
  state: "SP",
  budget: 800,
  hasPreExistingConditions: false
}

// Documentos no formato FusedDocument (como vem do RRF)
const createFusedDoc = (
  id: string,
  content: string,
  metadata: Record<string, unknown> = {}
): FusedDocument => ({
  id,
  content,
  rrfScore: 0.8,
  appearances: 1,
  queryMatches: ["query1"],
  metadata: { ...metadata }
})

const documentosVariados: FusedDocument[] = [
  createFusedDoc(
    "doc1",
    "Plano Amil 400 - Cobertura nacional, ideal para adultos de 30-45 anos. Inclui consultas, exames e internação. Rede credenciada em São Paulo com mais de 500 hospitais. Preço médio: R$ 750/mês.",
    {
      operator: "Amil",
      region: "SP",
      ageRange: "30-45"
    }
  ),
  createFusedDoc(
    "doc2",
    "Plano Senior Gold 60+ - Especializado para idosos acima de 60 anos. Cobertura para doenças crônicas, home care e acompanhamento geriátrico. Disponível apenas no Rio de Janeiro.",
    {
      operator: "Bradesco",
      region: "RJ",
      ageRange: "60+"
    }
  ),
  createFusedDoc(
    "doc3",
    "Plano Empresarial PME - Voltado para pequenas e médias empresas. Mínimo de 3 vidas. Não disponível para pessoa física.",
    {
      operator: "SulAmérica",
      documentType: "empresarial"
    }
  ),
  createFusedDoc(
    "doc4",
    "Plano Básico Econômico - Cobertura ambulatorial básica. Preço acessível a partir de R$ 300/mês. Disponível em todo Brasil. Ideal para jovens saudáveis.",
    {
      operator: "NotreDame"
    }
  ),
  createFusedDoc(
    "doc5",
    "Plano Premium SP - Cobertura completa com quarto individual. Rede premium em São Paulo incluindo Einstein e Sírio-Libanês. Para todas as idades.",
    {
      operator: "Amil",
      region: "SP"
    }
  )
]

// ============================================================
// TESTE 1: Detecção de Problemas (sem LLM - instantâneo)
// ============================================================

function testeDeteccaoProblemas() {
  logSection("TESTE 1: Detecção de Problemas na Query (sem LLM)")

  // 1.1 - Query com 0 resultados
  logTest("QA-1.1: Query com 0 resultados")
  logExpected("problem = 'no_results'")

  // detectProblem(totalResults, relevantResults, avgSimilarity?)
  const problema1 = detectProblem(0, 0, 0)
  logResult("Problema detectado", problema1)
  console.log(
    problema1 === "no_results"
      ? `  ${GREEN}✅ PASSOU${RESET}`
      : `  ${RED}❌ FALHOU${RESET}`
  )

  // 1.2 - Query com baixa similaridade
  logTest(
    "\nQA-1.2: Query com baixa similaridade (5 docs, 1 relevante, sim=0.3)"
  )
  logExpected("problem = 'low_similarity'")

  const problema2 = detectProblem(5, 1, 0.3)
  logResult("Problema detectado", problema2)
  console.log(
    problema2 === "low_similarity"
      ? `  ${GREEN}✅ PASSOU${RESET}`
      : `  ${RED}❌ FALHOU${RESET}`
  )

  // 1.3 - Query com poucos relevantes (10 docs, 1 relevante, sim=0.6)
  logTest("\nQA-1.3: Muitos docs mas poucos relevantes")
  logExpected("problem = 'missing_context'")

  const problema3 = detectProblem(10, 1, 0.6)
  logResult("Problema detectado", problema3)
  console.log(
    problema3 === "missing_context"
      ? `  ${GREEN}✅ PASSOU${RESET}`
      : `  ${RED}❌ FALHOU${RESET}`
  )
}

// ============================================================
// TESTE 2: Decisão de Rewrite (sem LLM - instantâneo)
// ============================================================

function testeDecisaoRewrite() {
  logSection("TESTE 2: Decisão de Rewrite (shouldRewrite)")

  // shouldRewrite(relevantCount, attemptCount)

  // 2.1 - Deve reescrever com poucos resultados
  logTest("QA-2.1: Poucos documentos relevantes (1 relevante, 0 tentativas)")
  logExpected("shouldRewrite = true")

  const deveReescrever1 = shouldRewrite(1, 0)
  logResult("Deve reescrever?", deveReescrever1)
  console.log(
    deveReescrever1 === true
      ? `  ${GREEN}✅ PASSOU${RESET}`
      : `  ${RED}❌ FALHOU${RESET}`
  )

  // 2.2 - Não deve reescrever com bons resultados
  logTest("\nQA-2.2: Bons resultados (4 relevantes)")
  logExpected("shouldRewrite = false")

  const deveReescrever2 = shouldRewrite(4, 0)
  logResult("Deve reescrever?", deveReescrever2)
  console.log(
    deveReescrever2 === false
      ? `  ${GREEN}✅ PASSOU${RESET}`
      : `  ${RED}❌ FALHOU${RESET}`
  )

  // 2.3 - Não deve reescrever após limite
  logTest("\nQA-2.3: Limite de tentativas atingido (1 relevante, 2 tentativas)")
  logExpected("shouldRewrite = false (mesmo com poucos resultados)")

  const deveReescrever3 = shouldRewrite(1, MAX_REWRITE_ATTEMPTS)
  logResult("Deve reescrever?", deveReescrever3)
  console.log(
    deveReescrever3 === false
      ? `  ${GREEN}✅ PASSOU${RESET}`
      : `  ${RED}❌ FALHOU${RESET}`
  )
}

// ============================================================
// TESTE 3: Grading de Documentos (COM LLM)
// ============================================================

async function testeGradingDocumentos() {
  logSection("TESTE 3: Grading de Documentos (COM LLM)")

  logTest("QA-3.1: Grading para cliente jovem em SP")
  logExpected(
    "doc1 e doc5 = relevant (SP, adulto), doc2 = irrelevant (idoso RJ), doc3 = irrelevant (empresarial)"
  )

  console.log(
    `\n  ${CYAN}Chamando API OpenAI... (pode demorar 5-10 segundos)${RESET}`
  )

  try {
    const resultado = await gradeDocuments(documentosVariados, clienteJovemSP, {
      model: "gpt-4o-mini", // Usar gpt-4o-mini para testes (mais barato)
      batchSize: 5
    })

    console.log("\n  Resultados do Grading:")
    resultado.documents.forEach(doc => {
      const score = doc.gradeResult?.score || "unknown"
      const icon =
        score === "relevant"
          ? "✅"
          : score === "partially_relevant"
            ? "⚠️"
            : "❌"
      console.log(`    ${icon} ${doc.id}: ${score}`)
      console.log(`       Razão: ${doc.gradeResult?.reason || "N/A"}`)
    })

    console.log(`\n  Estatísticas:`)
    console.log(`    - Total: ${resultado.stats.total}`)
    console.log(`    - Relevantes: ${GREEN}${resultado.stats.relevant}${RESET}`)
    console.log(
      `    - Parcialmente relevantes: ${YELLOW}${resultado.stats.partiallyRelevant}${RESET}`
    )
    console.log(
      `    - Irrelevantes: ${RED}${resultado.stats.irrelevant}${RESET}`
    )

    console.log(
      `\n  Documentos filtrados (relevantes + parciais): ${resultado.relevantDocuments.length}`
    )
    resultado.relevantDocuments.forEach(doc => {
      console.log(`    - ${doc.id}`)
    })

    // Verificação básica
    const temRelevante =
      resultado.stats.relevant > 0 || resultado.stats.partiallyRelevant > 0
    console.log(
      temRelevante
        ? `\n  ${GREEN}✅ PASSOU - Encontrou documentos relevantes${RESET}`
        : `\n  ${RED}❌ FALHOU${RESET}`
    )
  } catch (error) {
    console.log(`  ${RED}Erro: ${error}${RESET}`)
  }
}

// ============================================================
// TESTE 4: Rewrite de Query (COM LLM)
// ============================================================

async function testeRewriteQuery() {
  logSection("TESTE 4: Rewrite de Query (COM LLM)")

  // 4.1 - Rewrite para query sem resultados
  logTest("QA-4.1: Rewrite de query muito específica")
  logExpected("Query reescrita mais genérica, attemptCount = 1")

  console.log(
    `\n  ${CYAN}Chamando API OpenAI... (pode demorar 3-5 segundos)${RESET}`
  )

  try {
    const resultado = await rewriteQuery(
      {
        originalQuery:
          "plano ANS código 456789123 região metropolitana SP zona norte",
        problem: "too_specific",
        attemptCount: 1,
        clientInfo: clienteJovemSP
      },
      {
        model: "gpt-4o-mini"
      }
    )

    console.log("\n  Resultado do Rewrite:")
    console.log(`    Query original:  "${resultado.originalQuery}"`)
    console.log(`    Query reescrita: "${resultado.rewrittenQuery}"`)
    console.log(`    Problema:        ${resultado.problem}`)
    console.log(`    Tentativa #:     ${resultado.attemptCount}`)
    console.log(`    Limite atingido: ${resultado.limitedResults}`)

    // Verificação
    const queryMudou = resultado.rewrittenQuery !== resultado.originalQuery
    console.log(
      queryMudou
        ? `\n  ${GREEN}✅ PASSOU - Query foi modificada${RESET}`
        : `\n  ${RED}❌ FALHOU - Query não mudou${RESET}`
    )
  } catch (error) {
    console.log(`  ${RED}Erro: ${error}${RESET}`)
  }

  // 4.2 - Limite atingido
  logTest("\nQA-4.2: Limite de tentativas (3ª tentativa)")
  logExpected("limitedResults = true, query original retornada")

  try {
    const resultado = await rewriteQuery(
      {
        originalQuery: "plano xyz",
        problem: "no_results",
        attemptCount: 3, // Acima do limite (2)
        clientInfo: clienteJovemSP
      },
      {
        model: "gpt-4o-mini"
      }
    )

    console.log("\n  Resultado do Rewrite:")
    console.log(`    Query retornada: "${resultado.rewrittenQuery}"`)
    console.log(`    Limite atingido: ${resultado.limitedResults}`)

    console.log(
      resultado.limitedResults === true
        ? `\n  ${GREEN}✅ PASSOU - Limite respeitado${RESET}`
        : `\n  ${RED}❌ FALHOU${RESET}`
    )
  } catch (error) {
    console.log(`  ${RED}Erro: ${error}${RESET}`)
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(
    `\n${BOLD}${CYAN}╔════════════════════════════════════════════════════════════╗${RESET}`
  )
  console.log(
    `${BOLD}${CYAN}║     TESTES QA MANUAIS - TASK 32 (GRADING & REWRITING)      ║${RESET}`
  )
  console.log(
    `${BOLD}${CYAN}╚════════════════════════════════════════════════════════════╝${RESET}`
  )

  // Verificar API key
  if (!process.env.OPENAI_API_KEY) {
    console.log(`\n${RED}❌ ERRO: OPENAI_API_KEY não configurada!${RESET}`)
    console.log(`${YELLOW}Execute primeiro: source .env.local${RESET}`)
    console.log(
      `${YELLOW}Depois: npx tsx lib/agents/health-plan-v2/nodes/rag/__tests__/qa-manual-tests.ts${RESET}\n`
    )
    process.exit(1)
  }

  console.log(`\n${GREEN}✓ OPENAI_API_KEY configurada${RESET}`)
  console.log(`${CYAN}Iniciando testes...${RESET}`)

  // ==========================================
  // TESTES SEM API (instantâneos)
  // ==========================================
  console.log(`\n${BOLD}━━━━ TESTES SEM API (instantâneos) ━━━━${RESET}`)

  testeDeteccaoProblemas()
  testeDecisaoRewrite()

  // ==========================================
  // TESTES COM API (podem demorar)
  // ==========================================
  console.log(
    `\n${BOLD}━━━━ TESTES COM API OpenAI (podem demorar ~20s) ━━━━${RESET}`
  )

  await testeGradingDocumentos()
  await testeRewriteQuery()

  // ==========================================
  // RESUMO
  // ==========================================
  console.log(`\n${CYAN}${"=".repeat(60)}${RESET}`)
  console.log(`${BOLD}${GREEN}✅ TESTES QA CONCLUÍDOS!${RESET}`)
  console.log(`${CYAN}${"=".repeat(60)}${RESET}`)

  console.log(`
${CYAN}O que verificar:${RESET}
  1. Testes 1 e 2 (sem API): Todos devem mostrar "✅ PASSOU"
  2. Teste 3 (Grading):
     - doc1 e doc5 devem ser "relevant" (SP, adulto)
     - doc2 deve ser "irrelevant" (plano para idosos do RJ)
     - doc3 deve ser "irrelevant" (empresarial)
  3. Teste 4 (Rewrite):
     - Query deve ser simplificada (sem código ANS)
     - Limite de tentativas deve ser respeitado

${YELLOW}Se tudo estiver correto, marque a task como done:${RESET}
  task-master set-status --id=32 --status=done
`)
}

main().catch(console.error)
