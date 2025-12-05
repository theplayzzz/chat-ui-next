/**
 * Simulação do Fluxo de Chat com RAG
 *
 * Este script simula exatamente o que aconteceria quando um usuário
 * interage com o chat e o agente busca planos de saúde.
 *
 * Execute com:
 *   source .env.local && npx tsx lib/agents/health-plan-v2/nodes/rag/__tests__/simulate-chat-flow.ts
 */

import { createClient } from "@supabase/supabase-js"
import { generateQueries, extractQueryStrings } from "../generate-queries"
import { reciprocalRankFusion, type QueryResult } from "../result-fusion"
import { gradeDocuments } from "../grade-documents"
import { rewriteQuery, detectProblem, shouldRewrite } from "../rewrite-query"

// Cores para output
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ============================================================
// SIMULAÇÃO DE CONVERSA
// ============================================================

interface ChatSimulation {
  userMessage: string
  clientInfo: {
    age?: number
    city?: string
    state?: string
    budget?: number
    hasPreExistingConditions?: boolean
    preExistingConditions?: string[]
    dependents?: number
  }
}

const SIMULATIONS: ChatSimulation[] = [
  {
    userMessage: "Quero um plano de saúde barato em São Paulo",
    clientInfo: {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 800
    }
  },
  {
    userMessage: "Preciso de um plano para minha família com 3 filhos",
    clientInfo: {
      age: 40,
      city: "Rio de Janeiro",
      state: "RJ",
      budget: 2000,
      dependents: 4 // cônjuge + 3 filhos
    }
  },
  {
    userMessage: "Tenho diabetes, qual plano me cobre?",
    clientInfo: {
      age: 55,
      state: "MG",
      hasPreExistingConditions: true,
      preExistingConditions: ["diabetes tipo 2"]
    }
  }
]

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function logStep(step: number, title: string) {
  console.log(`\n${CYAN}┌${"─".repeat(58)}┐${RESET}`)
  console.log(
    `${CYAN}│${RESET} ${BOLD}PASSO ${step}: ${title}${RESET}${" ".repeat(Math.max(0, 46 - title.length))}${CYAN}│${RESET}`
  )
  console.log(`${CYAN}└${"─".repeat(58)}┘${RESET}`)
}

function logSubStep(text: string) {
  console.log(`  ${DIM}→${RESET} ${text}`)
}

function logSuccess(text: string) {
  console.log(`  ${GREEN}✓${RESET} ${text}`)
}

function logWarning(text: string) {
  console.log(`  ${YELLOW}⚠${RESET} ${text}`)
}

function logError(text: string) {
  console.log(`  ${RED}✗${RESET} ${text}`)
}

async function searchSupabaseEmbeddings(
  supabase: ReturnType<typeof createClient>,
  query: string,
  limit: number = 10
): Promise<
  Array<{
    id: string
    content: string
    similarity: number
    metadata: Record<string, unknown>
  }>
> {
  // Simular busca de embeddings (em produção usaria match_documents)
  // Por enquanto, retorna dados mockados
  console.log(
    `  ${DIM}[Supabase] Buscando: "${query.substring(0, 40)}..."${RESET}`
  )

  // Em produção:
  // const { data } = await supabase.rpc('match_documents', {
  //   query_embedding: await generateEmbedding(query),
  //   match_threshold: 0.5,
  //   match_count: limit
  // })

  // Por agora, retornar dados mock
  return [
    {
      id: "plan-amil-400",
      content:
        "Plano Amil 400 - Cobertura nacional para adultos. Inclui consultas, exames e internação. Rede em São Paulo. R$ 650/mês.",
      similarity: 0.85,
      metadata: { operator: "Amil", region: "SP" }
    },
    {
      id: "plan-sulamerica-classico",
      content:
        "SulAmérica Clássico - Plano familiar com cobertura para dependentes. Pediatria e maternidade inclusos. R$ 1.800/mês.",
      similarity: 0.78,
      metadata: { operator: "SulAmérica", type: "familiar" }
    },
    {
      id: "plan-bradesco-senior",
      content:
        "Bradesco Saúde Senior - Especializado para 60+. Cobertura para doenças crônicas e home care.",
      similarity: 0.65,
      metadata: { operator: "Bradesco", ageRange: "60+" }
    },
    {
      id: "plan-unimed-basico",
      content:
        "Unimed Básico - Cobertura ambulatorial. Consultas e exames simples. A partir de R$ 300/mês.",
      similarity: 0.72,
      metadata: { operator: "Unimed", tier: "basic" }
    },
    {
      id: "plan-notredame-flex",
      content:
        "NotreDame Flex - Plano flexível com coparticipação. Bom custo-benefício para jovens. R$ 450/mês.",
      similarity: 0.8,
      metadata: { operator: "NotreDame", tier: "flex" }
    }
  ]
}

// ============================================================
// FLUXO PRINCIPAL
// ============================================================

async function simulateChatFlow(simulation: ChatSimulation) {
  console.log(
    `\n${BOLD}${CYAN}╔════════════════════════════════════════════════════════════╗${RESET}`
  )
  console.log(
    `${BOLD}${CYAN}║          SIMULAÇÃO DE FLUXO DE CHAT COM RAG               ║${RESET}`
  )
  console.log(
    `${BOLD}${CYAN}╚════════════════════════════════════════════════════════════╝${RESET}`
  )

  console.log(`\n${YELLOW}👤 Usuário:${RESET} "${simulation.userMessage}"`)
  console.log(
    `${DIM}   Perfil: ${JSON.stringify(simulation.clientInfo)}${RESET}`
  )

  // Verificar conexão Supabase
  if (!supabaseUrl || !supabaseKey) {
    console.log(
      `\n${YELLOW}⚠ Supabase não configurado - usando dados mockados${RESET}`
    )
  }

  const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

  // ========================================
  // PASSO 1: Gerar Queries
  // ========================================
  logStep(1, "Gerar Queries de Busca")

  const queriesResult = await generateQueries(simulation.clientInfo, {
    model: "gpt-4o-mini"
  })

  const queryStrings = extractQueryStrings(queriesResult.queries)
  logSuccess(`${queriesResult.queries.length} queries geradas`)

  queriesResult.queries.forEach((q, i) => {
    logSubStep(`Q${i + 1} [${q.focus}]: "${q.query.substring(0, 50)}..."`)
  })

  // ========================================
  // PASSO 2: Buscar Documentos (Embeddings)
  // ========================================
  logStep(2, "Buscar Documentos no Supabase")

  const allQueryResults: QueryResult[] = []

  for (const query of queryStrings) {
    const results = await searchSupabaseEmbeddings(supabase!, query, 5)
    allQueryResults.push({
      query,
      results: results.map(r => ({
        id: r.id,
        content: r.content,
        score: r.similarity,
        metadata: r.metadata
      }))
    })
  }

  const totalDocs = allQueryResults.reduce(
    (sum, qr) => sum + qr.results.length,
    0
  )
  logSuccess(
    `${totalDocs} documentos recuperados de ${queryStrings.length} queries`
  )

  // ========================================
  // PASSO 3: RRF Fusion
  // ========================================
  logStep(3, "Reciprocal Rank Fusion (RRF)")

  const fusedDocs = reciprocalRankFusion(allQueryResults, { topK: 10 })
  logSuccess(`${fusedDocs.length} documentos únicos após fusão`)

  fusedDocs.slice(0, 5).forEach((doc, i) => {
    logSubStep(`#${i + 1} [RRF: ${doc.rrfScore.toFixed(3)}] ${doc.id}`)
  })

  // ========================================
  // PASSO 4: Grading de Documentos
  // ========================================
  logStep(4, "Grading de Documentos (GPT-4o-mini)")

  const gradingResult = await gradeDocuments(fusedDocs, simulation.clientInfo, {
    model: "gpt-4o-mini",
    batchSize: 5
  })

  logSuccess(
    `Grading completo: ${gradingResult.stats.relevant} relevant, ${gradingResult.stats.partiallyRelevant} partial, ${gradingResult.stats.irrelevant} irrelevant`
  )

  gradingResult.documents.forEach(doc => {
    const icon =
      doc.gradeResult?.score === "relevant"
        ? "✅"
        : doc.gradeResult?.score === "partially_relevant"
          ? "⚠️"
          : "❌"
    logSubStep(`${icon} ${doc.id}: ${doc.gradeResult?.score}`)
  })

  // ========================================
  // PASSO 5: Verificar Necessidade de Rewrite
  // ========================================
  logStep(5, "Verificar Necessidade de Rewrite")

  const relevantCount =
    gradingResult.stats.relevant + gradingResult.stats.partiallyRelevant
  const needsRewrite = shouldRewrite(relevantCount, 0)

  if (needsRewrite) {
    logWarning(
      `Poucos documentos relevantes (${relevantCount}) - reescrevendo query`
    )

    const problem = detectProblem(fusedDocs.length, relevantCount, 0.5)
    logSubStep(`Problema detectado: ${problem}`)

    const rewriteResult = await rewriteQuery(
      {
        originalQuery: queryStrings[0],
        problem,
        attemptCount: 1,
        clientInfo: simulation.clientInfo
      },
      {
        model: "gpt-4o-mini"
      }
    )

    logSuccess(
      `Query reescrita: "${rewriteResult.rewrittenQuery.substring(0, 50)}..."`
    )

    // Em produção, faria nova busca com a query reescrita
  } else {
    logSuccess(
      `Documentos suficientes (${relevantCount}) - não precisa rewrite`
    )
  }

  // ========================================
  // PASSO 6: Resultado Final
  // ========================================
  logStep(6, "Resultado Final para o Chat")

  const finalDocs = gradingResult.relevantDocuments.slice(0, 5)

  console.log(`\n${GREEN}${BOLD}📋 Planos Recomendados:${RESET}\n`)

  if (finalDocs.length === 0) {
    logWarning("Nenhum plano relevante encontrado")
  } else {
    finalDocs.forEach((doc, i) => {
      console.log(`  ${BOLD}${i + 1}. ${doc.id}${RESET}`)
      console.log(`     ${DIM}${doc.content.substring(0, 80)}...${RESET}`)
      console.log(`     ${CYAN}Relevância: ${doc.gradeResult?.score}${RESET}`)
      console.log(`     ${DIM}Razão: ${doc.gradeResult?.reason}${RESET}\n`)
    })
  }

  console.log(`${CYAN}${"─".repeat(60)}${RESET}`)
  console.log(`${GREEN}✅ Fluxo completo executado com sucesso!${RESET}`)
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  // Verificar API key
  if (!process.env.OPENAI_API_KEY) {
    console.log(`\n${RED}❌ ERRO: OPENAI_API_KEY não configurada!${RESET}`)
    console.log(`${YELLOW}Execute primeiro: source .env.local${RESET}\n`)
    process.exit(1)
  }

  // Executar primeira simulação
  await simulateChatFlow(SIMULATIONS[0])

  console.log(
    `\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`
  )
  console.log(
    `${CYAN}Para testar outros cenários, edite SIMULATIONS no arquivo:${RESET}`
  )
  console.log(
    `${DIM}lib/agents/health-plan-v2/nodes/rag/__tests__/simulate-chat-flow.ts${RESET}`
  )
}

main().catch(console.error)
