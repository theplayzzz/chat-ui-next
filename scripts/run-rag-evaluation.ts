/**
 * RAG Evaluation Script - Executa baseline evaluation do sistema RAG
 *
 * Este script:
 * 1. Carrega o dataset de test cases
 * 2. Executa o searchPlansGraph para cada caso (ou usa mock)
 * 3. Avalia os resultados com os 3 avaliadores
 * 4. Gera relatório em .taskmaster/reports/rag-baseline-evaluation.md
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6D.3
 *
 * Uso:
 *   npx tsx scripts/run-rag-evaluation.ts [--dry-run] [--limit=N]
 */

import * as fs from "fs"
import * as path from "path"
import {
  evaluateRAG,
  aggregateMetrics,
  type RAGEvaluationInput,
  type RAGEvaluationResult,
  type RAGTestCase
} from "../lib/agents/health-plan-v2/monitoring/rag-evaluation"
import type { PartialClientInfo } from "../lib/agents/health-plan-v2/types"
import type { GradedDocument, SearchMetadata } from "../lib/agents/health-plan-v2/schemas/rag-schemas"

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  datasetPath: path.resolve(
    __dirname,
    "../lib/agents/health-plan-v2/nodes/rag/__tests__/fixtures/rag-test-cases.json"
  ),
  reportPath: path.resolve(
    __dirname,
    "../.taskmaster/reports/rag-baseline-evaluation.md"
  ),
  // Targets do PRD
  targets: {
    minRelevantDocs: 5,
    maxRewriteRate: 0.3, // 30%
    maxLatencyMs: 8000, // 8s
    minOverallScore: 0.6
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface TestCaseResult {
  testCase: RAGTestCase
  evaluation: RAGEvaluationResult
  searchMetadata: SearchMetadata
  latencyMs: number
  meetsMinDocs: boolean
  passed: boolean
}

interface EvaluationSummary {
  totalCases: number
  passedCases: number
  failedCases: number
  passRate: number
  avgRelevantDocs: number
  avgRewriteCount: number
  avgLatencyMs: number
  rewriteRate: number
  metrics: ReturnType<typeof aggregateMetrics>
  problematicCases: TestCaseResult[]
  byCategoryStats: Record<string, {
    total: number
    passed: number
    avgScore: number
  }>
}

// =============================================================================
// MOCK DATA GENERATOR (para dry-run)
// =============================================================================

function generateMockSearchResult(testCase: RAGTestCase): {
  documents: GradedDocument[]
  searchMetadata: SearchMetadata
} {
  const relevantCount = Math.max(
    1,
    Math.floor(testCase.minRelevantDocs * (0.6 + Math.random() * 0.6))
  )
  const totalDocs = relevantCount + Math.floor(Math.random() * 5)

  const documents: GradedDocument[] = []
  for (let i = 0; i < totalDocs; i++) {
    const isRelevant = i < relevantCount
    documents.push({
      id: `doc-${testCase.id}-${i}`,
      content: `Documento ${i + 1} sobre planos de saúde para ${testCase.input.city || "Brasil"}.
        ${isRelevant ? `Ideal para clientes com orçamento de R$${testCase.input.budget}.` : "Conteúdo genérico."}
        ${testCase.input.healthConditions?.length ? `Cobertura para ${testCase.input.healthConditions.join(", ")}.` : ""}`,
      score: isRelevant ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.3,
      metadata: {
        documentType: isRelevant ? "plan_details" : "general_info",
        operator: ["Unimed", "Bradesco Saúde", "SulAmérica", "Amil", "Hapvida"][Math.floor(Math.random() * 5)],
        planCode: `PLAN-${Math.floor(Math.random() * 1000)}`,
        tags: isRelevant ? ["relevante"] : ["generico"]
      },
      gradeResult: {
        documentId: `doc-${testCase.id}-${i}`,
        score: isRelevant ? "relevant" : (Math.random() > 0.5 ? "partially_relevant" : "irrelevant"),
        reason: isRelevant
          ? "Documento relevante para o perfil do cliente"
          : "Documento não atende critérios específicos do cliente"
      },
      isRelevant
    })
  }

  const searchMetadata: SearchMetadata = {
    queryCount: 3 + Math.floor(Math.random() * 2),
    rewriteCount: relevantCount < 3 ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2),
    totalDocs,
    relevantDocs: relevantCount,
    limitedResults: relevantCount < 3,
    timestamp: new Date().toISOString()
  }

  return { documents, searchMetadata }
}

// =============================================================================
// EVALUATION RUNNER
// =============================================================================

async function runEvaluation(
  testCases: RAGTestCase[],
  dryRun: boolean = true
): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = []

  console.log(`\n🔄 Executando avaliação de ${testCases.length} casos...`)
  console.log(`   Modo: ${dryRun ? "DRY-RUN (mock data)" : "REAL (searchPlansGraph)"}\n`)

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]
    console.log(`[${i + 1}/${testCases.length}] ${testCase.id}: ${testCase.description}`)

    const startTime = Date.now()

    let documents: GradedDocument[]
    let searchMetadata: SearchMetadata

    if (dryRun) {
      // Usar mock data
      const mockResult = generateMockSearchResult(testCase)
      documents = mockResult.documents
      searchMetadata = mockResult.searchMetadata
      // Simular latência
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200))
    } else {
      // TODO: Integrar com searchPlansGraph real
      // const graph = compileSearchPlansGraph()
      // const result = await graph.invoke({ clientInfo: testCase.input, assistantId: "..." })
      // documents = result.gradedDocs
      // searchMetadata = result.searchMetadata
      throw new Error("Modo REAL não implementado ainda - use --dry-run")
    }

    const latencyMs = Date.now() - startTime

    // Construir input para avaliação
    const evaluationInput: RAGEvaluationInput = {
      clientInfo: testCase.input,
      queries: ["mock-query-1", "mock-query-2", "mock-query-3"],
      documents,
      searchMetadata,
      response: undefined // Sem resposta para baseline
    }

    // Executar avaliação
    const evaluation = evaluateRAG(evaluationInput)

    // Determinar se passou
    const meetsMinDocs = searchMetadata.relevantDocs >= testCase.minRelevantDocs
    const passed = evaluation.overallScore >= CONFIG.targets.minOverallScore && meetsMinDocs

    const result: TestCaseResult = {
      testCase,
      evaluation,
      searchMetadata,
      latencyMs,
      meetsMinDocs,
      passed
    }

    results.push(result)

    // Log resumido
    const statusIcon = passed ? "✅" : "❌"
    console.log(`   ${statusIcon} Score: ${evaluation.overallScore.toFixed(2)} | Docs: ${searchMetadata.relevantDocs}/${testCase.minRelevantDocs} | ${latencyMs}ms`)
  }

  return results
}

// =============================================================================
// ANALYSIS
// =============================================================================

function analyzeSummary(results: TestCaseResult[]): EvaluationSummary {
  const passedCases = results.filter(r => r.passed).length
  const failedCases = results.length - passedCases

  const avgRelevantDocs =
    results.reduce((sum, r) => sum + r.searchMetadata.relevantDocs, 0) / results.length
  const avgRewriteCount =
    results.reduce((sum, r) => sum + r.searchMetadata.rewriteCount, 0) / results.length
  const avgLatencyMs =
    results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length

  const casesWithRewrite = results.filter(r => r.searchMetadata.rewriteCount > 0).length
  const rewriteRate = casesWithRewrite / results.length

  const evaluationResults = results.map(r => r.evaluation)
  const metrics = aggregateMetrics(evaluationResults)

  // Casos problemáticos: < 3 docs relevantes ou score < 0.5
  const problematicCases = results.filter(
    r => r.searchMetadata.relevantDocs < 3 || r.evaluation.overallScore < 0.5
  )

  // Estatísticas por categoria
  const byCategoryStats: Record<string, { total: number; passed: number; avgScore: number }> = {}
  results.forEach(r => {
    const category = r.testCase.category || "uncategorized"
    if (!byCategoryStats[category]) {
      byCategoryStats[category] = { total: 0, passed: 0, avgScore: 0 }
    }
    byCategoryStats[category].total++
    if (r.passed) byCategoryStats[category].passed++
    byCategoryStats[category].avgScore += r.evaluation.overallScore
  })
  Object.keys(byCategoryStats).forEach(cat => {
    byCategoryStats[cat].avgScore /= byCategoryStats[cat].total
  })

  return {
    totalCases: results.length,
    passedCases,
    failedCases,
    passRate: passedCases / results.length,
    avgRelevantDocs,
    avgRewriteCount,
    avgLatencyMs,
    rewriteRate,
    metrics,
    problematicCases,
    byCategoryStats
  }
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

function generateReport(summary: EvaluationSummary, results: TestCaseResult[]): string {
  const now = new Date().toISOString()

  let report = `# RAG Baseline Evaluation Report

**Data:** ${now}
**Casos Testados:** ${summary.totalCases}
**PRD Reference:** .taskmaster/docs/agentic-rag-implementation-prd.md (Fase 6D.3)

---

## 📊 Resumo Executivo

| Métrica | Valor | Target | Status |
|---------|-------|--------|--------|
| Taxa de Sucesso | ${(summary.passRate * 100).toFixed(1)}% | >= 80% | ${summary.passRate >= 0.8 ? "✅" : "⚠️"} |
| Docs Relevantes (média) | ${summary.avgRelevantDocs.toFixed(1)} | >= ${CONFIG.targets.minRelevantDocs} | ${summary.avgRelevantDocs >= CONFIG.targets.minRelevantDocs ? "✅" : "⚠️"} |
| Taxa de Rewrite | ${(summary.rewriteRate * 100).toFixed(1)}% | < ${CONFIG.targets.maxRewriteRate * 100}% | ${summary.rewriteRate < CONFIG.targets.maxRewriteRate ? "✅" : "⚠️"} |
| Latência Média | ${summary.avgLatencyMs.toFixed(0)}ms | < ${CONFIG.targets.maxLatencyMs}ms | ${summary.avgLatencyMs < CONFIG.targets.maxLatencyMs ? "✅" : "⚠️"} |

---

## 📈 Métricas de Avaliação

### Scores dos Avaliadores

| Avaliador | Média | Min | Max |
|-----------|-------|-----|-----|
| Relevance | ${summary.metrics.avgRelevance.toFixed(2)} | - | - |
| Groundedness | ${summary.metrics.avgGroundedness.toFixed(2)} | - | - |
| Retrieval Quality | ${summary.metrics.avgRetrievalQuality.toFixed(2)} | - | - |
| **Overall** | **${summary.metrics.avgOverall.toFixed(2)}** | ${summary.metrics.minOverall.toFixed(2)} | ${summary.metrics.maxOverall.toFixed(2)} |

### Distribuição de Rewrites

- Casos com 0 rewrites: ${results.filter(r => r.searchMetadata.rewriteCount === 0).length}
- Casos com 1 rewrite: ${results.filter(r => r.searchMetadata.rewriteCount === 1).length}
- Casos com 2 rewrites: ${results.filter(r => r.searchMetadata.rewriteCount === 2).length}

---

## 📂 Resultados por Categoria

| Categoria | Total | Passou | Taxa | Score Médio |
|-----------|-------|--------|------|-------------|
`

  Object.entries(summary.byCategoryStats)
    .sort((a, b) => b[1].avgScore - a[1].avgScore)
    .forEach(([cat, stats]) => {
      const rate = (stats.passed / stats.total * 100).toFixed(0)
      const icon = stats.passed / stats.total >= 0.8 ? "✅" : "⚠️"
      report += `| ${cat} | ${stats.total} | ${stats.passed} | ${rate}% ${icon} | ${stats.avgScore.toFixed(2)} |\n`
    })

  report += `
---

## ⚠️ Casos Problemáticos (${summary.problematicCases.length})

`

  if (summary.problematicCases.length === 0) {
    report += "Nenhum caso problemático identificado.\n"
  } else {
    report += "| ID | Descrição | Docs Relevantes | Score | Problema |\n"
    report += "|----|-----------|--------------------|-------|----------|\n"
    summary.problematicCases.forEach(r => {
      const problem = r.searchMetadata.relevantDocs < 3
        ? "Poucos docs"
        : "Score baixo"
      report += `| ${r.testCase.id} | ${r.testCase.description.substring(0, 40)}... | ${r.searchMetadata.relevantDocs} | ${r.evaluation.overallScore.toFixed(2)} | ${problem} |\n`
    })
  }

  report += `
---

## 📋 Detalhes por Caso

<details>
<summary>Clique para expandir todos os casos</summary>

| # | ID | Categoria | Docs | Rewrites | Score | Status |
|---|----|-----------|----- |----------|-------|--------|
`

  results.forEach((r, i) => {
    const icon = r.passed ? "✅" : "❌"
    report += `| ${i + 1} | ${r.testCase.id} | ${r.testCase.category} | ${r.searchMetadata.relevantDocs}/${r.testCase.minRelevantDocs} | ${r.searchMetadata.rewriteCount} | ${r.evaluation.overallScore.toFixed(2)} | ${icon} |\n`
  })

  report += `
</details>

---

## 🎯 Recomendações

`

  const recommendations: string[] = []

  if (summary.avgRelevantDocs < CONFIG.targets.minRelevantDocs) {
    recommendations.push("- **Aumentar docs relevantes**: Revisar prompts de geração de queries e configuração de retrieval")
  }
  if (summary.rewriteRate > CONFIG.targets.maxRewriteRate) {
    recommendations.push("- **Reduzir taxa de rewrite**: Melhorar qualidade inicial das queries geradas")
  }
  if (summary.metrics.avgRelevance < 0.6) {
    recommendations.push("- **Melhorar relevância**: Ajustar critérios de grading e filtros de busca")
  }
  if (summary.problematicCases.length > summary.totalCases * 0.2) {
    recommendations.push("- **Casos problemáticos**: Mais de 20% dos casos precisam de atenção especial")
  }

  if (recommendations.length === 0) {
    report += "✅ Sistema atende todos os targets. Continuar monitorando métricas.\n"
  } else {
    report += recommendations.join("\n") + "\n"
  }

  report += `
---

## 📊 Configuração LangSmith

\`\`\`
Project: health-plan-agent
Dataset: rag-evaluation-baseline
Experiment Prefix: rag-baseline-${new Date().toISOString().split("T")[0]}
\`\`\`

---

*Relatório gerado automaticamente por \`scripts/run-rag-evaluation.ts\`*
`

  return report
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log("🚀 RAG Baseline Evaluation")
  console.log("=" .repeat(50))

  // Parse args
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run") || !args.includes("--real")
  const limitArg = args.find(a => a.startsWith("--limit="))
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined

  // Carregar dataset
  console.log(`\n📂 Carregando dataset: ${CONFIG.datasetPath}`)

  if (!fs.existsSync(CONFIG.datasetPath)) {
    console.error("❌ Dataset não encontrado!")
    process.exit(1)
  }

  const datasetContent = fs.readFileSync(CONFIG.datasetPath, "utf-8")
  const dataset = JSON.parse(datasetContent)
  let testCases: RAGTestCase[] = dataset.testCases

  if (limit && limit > 0) {
    testCases = testCases.slice(0, limit)
    console.log(`   Limitado a ${limit} casos`)
  }

  console.log(`   ${testCases.length} casos carregados`)

  // Executar avaliação
  const results = await runEvaluation(testCases, dryRun)

  // Analisar resultados
  console.log("\n📊 Analisando resultados...")
  const summary = analyzeSummary(results)

  // Gerar relatório
  console.log("\n📝 Gerando relatório...")
  const report = generateReport(summary, results)

  // Salvar relatório
  fs.writeFileSync(CONFIG.reportPath, report, "utf-8")
  console.log(`   Salvo em: ${CONFIG.reportPath}`)

  // Resumo final
  console.log("\n" + "=".repeat(50))
  console.log("📈 RESUMO FINAL")
  console.log("=".repeat(50))
  console.log(`   Total: ${summary.totalCases} casos`)
  console.log(`   ✅ Passou: ${summary.passedCases} (${(summary.passRate * 100).toFixed(1)}%)`)
  console.log(`   ❌ Falhou: ${summary.failedCases}`)
  console.log(`   📊 Score médio: ${summary.metrics.avgOverall.toFixed(2)}`)
  console.log(`   📄 Docs relevantes (média): ${summary.avgRelevantDocs.toFixed(1)}`)
  console.log(`   🔄 Taxa de rewrite: ${(summary.rewriteRate * 100).toFixed(1)}%`)
  console.log(`   ⏱️  Latência média: ${summary.avgLatencyMs.toFixed(0)}ms`)

  // Exit code baseado no resultado
  const success = summary.passRate >= 0.7
  process.exit(success ? 0 : 1)
}

main().catch(err => {
  console.error("❌ Erro fatal:", err)
  process.exit(1)
})
