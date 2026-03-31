/**
 * QA Comprehensive Accuracy Test Suite
 *
 * 10 chat scenarios × 15+ interactions each
 * Tests agent accuracy against indexed documents:
 * - Manual de Vendas PME AMIL (31 chunks)
 * - PLANOS COM EINSTEIN (50 chunks)
 * - PLANOS BÁSICO / SulAmérica (19 chunks)
 * - Material Porto Saúde (15 chunks)
 *
 * Key facts from documents used for validation:
 *
 * AMIL PME:
 * - Bronze RJ: 5 municípios (RJ, Duque de Caxias, Niterói, Nova Iguaçu, São Gonçalo)
 * - Bronze RJ Mais: 31 municípios
 * - PME Porte I: 2-29 vidas, Porte II: 30-99 vidas
 * - Coparticipação: vários planos (Bronze tem copart, Selecionada tem reembolso)
 * - Carência PRC 607/608/609/617
 * - Dependentes: cônjuge, filhos até limite de idade
 * - Plano Referência: Prata
 * - Dental 100 Promo disponível
 *
 * EINSTEIN (comparativo):
 * - Exclusivo Mais+LE (Alice): faixa 29-33 = R$1.626,74
 * - S2500 R1 (Amil): faixa 29-33 = R$2.018,15
 * - Black R1 (Bradesco): faixa 29-33 = R$1.841,87
 * - Nacional Plus 4 (Porto): faixa 29-33 = R$2.234,99
 * - P520 (Porto): faixa 29-33 = R$1.528,85
 * - Executivo R1 (SulAmérica): faixa 29-33 = R$1.635,55
 * - Todos PME, apartamento, sem copart (exceto S2500 e Black = parcial)
 * - Faixa 24-28: Alice R$1.439,73, Amil R$1.681,79, Bradesco R$1.534,89
 */

import { test } from "@playwright/test"

const BASE_URL = "https://chat-ui-next.vercel.app"
const LOGIN_EMAIL = "play-felix@hotmail.com"

// Store all results for final analysis
const allResults: Array<{
  chat: number
  scenario: string
  turn: number
  question: string
  response: string
  expectedFacts: string[]
  timestamp: string
}> = []

async function login(page: any) {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 })
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

async function sendAndCapture(
  page: any,
  message: string
): Promise<string> {
  const textarea = page.locator("textarea").first()
  await textarea.click()
  await textarea.fill(message)
  await textarea.press("Enter")

  // Wait for response
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(2000)
    const spinning = await page
      .locator(".animate-spin")
      .isVisible()
      .catch(() => false)
    if (!spinning && i > 3) break
  }

  // Get the last assistant message
  const messages = await page.locator(".prose").all()
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    return (await lastMsg.textContent()) || ""
  }
  return ""
}

async function runChatScenario(
  page: any,
  chatNum: number,
  scenarioName: string,
  interactions: Array<{ q: string; expectedFacts: string[] }>
) {
  console.log(`\n========== CHAT ${chatNum}: ${scenarioName} ==========`)

  for (let i = 0; i < interactions.length; i++) {
    const { q, expectedFacts } = interactions[i]
    console.log(`  Turn ${i + 1}: "${q.substring(0, 60)}..."`)

    const response = await sendAndCapture(page, q)
    const preview = response.substring(0, 200).replace(/\n/g, " ")
    console.log(`  Response: "${preview}..."`)

    allResults.push({
      chat: chatNum,
      scenario: scenarioName,
      turn: i + 1,
      question: q,
      response,
      expectedFacts,
      timestamp: new Date().toISOString()
    })
  }

  await page.screenshot({
    path: `screenshots/accuracy-chat${chatNum}-${scenarioName.replace(/\s/g, "-")}.png`,
    fullPage: true
  })
}

// ===================================================================
// CHAT SCENARIOS
// ===================================================================

const scenarios: Array<{
  name: string
  interactions: Array<{ q: string; expectedFacts: string[] }>
}> = [
  // CHAT 1: Família jovem Nova Iguaçu - preços e cobertura
  {
    name: "familia-nova-iguacu",
    interactions: [
      {
        q: "Olá, quero um plano de saúde familiar. Tenho 29 anos, moro em Nova Iguaçu RJ, orçamento de R$900/mês. Esposa 25 anos e filho de 3 anos.",
        expectedFacts: ["coleta dados", "idade 29", "Nova Iguaçu", "dependentes"]
      },
      {
        q: "Sim, pode buscar planos.",
        expectedFacts: ["busca planos", "resultados"]
      },
      {
        q: "Qual é o plano mais barato que cobre Nova Iguaçu?",
        expectedFacts: [
          "Bronze RJ cobre Nova Iguaçu",
          "AMIL Bronze RJ"
        ]
      },
      {
        q: "O Bronze RJ da AMIL tem coparticipação? Como funciona?",
        expectedFacts: ["coparticipação", "Bronze tem copart"]
      },
      {
        q: "Qual a carência desse plano para consultas?",
        expectedFacts: ["carência", "PRC", "consultas"]
      },
      {
        q: "E para internação, qual a carência?",
        expectedFacts: ["internação", "carência", "180 dias"]
      },
      {
        q: "Meu filho de 3 anos pode ser dependente? Tem limite de idade?",
        expectedFacts: ["dependente", "filho", "limite idade"]
      },
      {
        q: "E se minha sogra de 65 anos quiser entrar no plano, pode?",
        expectedFacts: ["dependente", "sogra", "agregado", "idade"]
      },
      {
        q: "Qual a diferença entre o Bronze RJ e o Bronze RJ Mais?",
        expectedFacts: [
          "Bronze RJ: 5 municípios",
          "Bronze RJ Mais: 31 municípios",
          "abrangência"
        ]
      },
      {
        q: "O Bronze RJ cobre Duque de Caxias?",
        expectedFacts: ["sim", "Duque de Caxias", "5 municípios"]
      },
      {
        q: "Quais municípios o Bronze RJ cobre exatamente?",
        expectedFacts: [
          "Rio de Janeiro",
          "Duque de Caxias",
          "Niterói",
          "Nova Iguaçu",
          "São Gonçalo"
        ]
      },
      {
        q: "Existe algum plano com reembolso nessa faixa de preço?",
        expectedFacts: ["reembolso", "Selecionada", "Prata ou superior"]
      },
      {
        q: "O valor de R$900 é por pessoa ou para a família toda?",
        expectedFacts: ["por pessoa", "faixa etária", "cada beneficiário"]
      },
      {
        q: "Então para 3 pessoas (eu 29, esposa 25, filho 3), quanto ficaria o Bronze RJ?",
        expectedFacts: ["valor", "faixa etária", "soma"]
      },
      {
        q: "Pode me dar um resumo final com os 3 melhores planos para minha família?",
        expectedFacts: ["resumo", "comparativo", "recomendação"]
      }
    ]
  },

  // CHAT 2: Empresarial PME 10 funcionários SP
  {
    name: "empresarial-10-func-sp",
    interactions: [
      {
        q: "Preciso de plano empresarial para minha empresa em São Paulo SP, 10 funcionários, orçamento de R$500 por vida.",
        expectedFacts: ["empresarial", "PME", "10 funcionários", "São Paulo"]
      },
      {
        q: "Sim, busque planos empresariais.",
        expectedFacts: ["busca", "PME"]
      },
      {
        q: "Qual a diferença entre Porte I e Porte II na AMIL?",
        expectedFacts: [
          "Porte I: 2 a 29 vidas",
          "Porte II: 30 a 99 vidas"
        ]
      },
      {
        q: "Minha empresa é MEI, posso contratar PME?",
        expectedFacts: ["MEI", "empresário individual", "pode contratar"]
      },
      {
        q: "Quais documentos preciso para contratar um plano PME?",
        expectedFacts: ["CNPJ", "documentação", "contrato social"]
      },
      {
        q: "O plano Bronze SP da AMIL cobre quais municípios?",
        expectedFacts: [
          "23 municípios",
          "São Paulo",
          "Guarulhos",
          "Santo André"
        ]
      },
      {
        q: "Qual plano tem a melhor rede credenciada em São Paulo com Einstein?",
        expectedFacts: ["Einstein", "rede credenciada", "São Paulo"]
      },
      {
        q: "O plano Nacional Plus 4 da Porto Seguro, quanto custa para faixa 29-33?",
        expectedFacts: ["R$2.234,99", "Nacional Plus 4", "Porto Seguro"]
      },
      {
        q: "E o P520 da Porto Seguro, quanto custa na mesma faixa?",
        expectedFacts: ["R$1.528,85", "P520", "Porto Seguro"]
      },
      {
        q: "Qual desses planos tem coparticipação parcial?",
        expectedFacts: ["S2500 R1", "Black R1", "parcial"]
      },
      {
        q: "O Executivo R1 da SulAmérica tem coparticipação?",
        expectedFacts: ["sem coparticipação", "SulAmérica"]
      },
      {
        q: "Posso incluir dependentes dos funcionários no plano PME?",
        expectedFacts: ["dependentes", "cônjuge", "filhos", "PME"]
      },
      {
        q: "Qual o prazo de implantação do contrato PME na AMIL?",
        expectedFacts: ["prazo", "implantação"]
      },
      {
        q: "Existe plano dental que posso adicionar?",
        expectedFacts: ["dental", "Dental 100", "AMIL"]
      },
      {
        q: "Faça um ranking dos 5 melhores planos para minha empresa.",
        expectedFacts: ["ranking", "comparativo", "PME"]
      }
    ]
  },

  // CHAT 3: Pessoa idosa 58 anos com condições pré-existentes
  {
    name: "idoso-58-condicoes",
    interactions: [
      {
        q: "Tenho 58 anos, moro no Rio de Janeiro RJ, orçamento de R$2000/mês. Tenho diabetes e hipertensão.",
        expectedFacts: ["58 anos", "Rio de Janeiro", "diabetes", "hipertensão"]
      },
      {
        q: "Busque planos para mim.",
        expectedFacts: ["busca", "faixa 54-58"]
      },
      {
        q: "Quanto custa o plano Exclusivo Mais da Alice para minha faixa etária (54-58)?",
        expectedFacts: ["R$3.791,77", "Alice", "54 a 58"]
      },
      {
        q: "E o P520 da Porto Seguro na faixa 54-58?",
        expectedFacts: ["R$2.718,21", "Porto Seguro", "P520"]
      },
      {
        q: "O que é Cobertura Parcial Temporária (CPT)? Se aplica ao meu caso?",
        expectedFacts: ["CPT", "condições pré-existentes", "24 meses"]
      },
      {
        q: "Com diabetes, tenho alguma restrição de carência?",
        expectedFacts: ["CPT", "pré-existente", "carência"]
      },
      {
        q: "Qual plano cobre melhor tratamento para diabetes?",
        expectedFacts: ["cobertura", "diabetes"]
      },
      {
        q: "O S2500 R1 da AMIL tem reembolso? Como funciona?",
        expectedFacts: ["reembolso", "S2500", "AMIL", "Selecionada"]
      },
      {
        q: "Quero incluir minha esposa de 55 anos. Quanto fica para nós dois?",
        expectedFacts: ["dependente", "cônjuge", "faixa 54-58", "soma"]
      },
      {
        q: "Qual o hospital Sírio Libanês está na rede de quais planos?",
        expectedFacts: ["Sírio Libanês", "rede credenciada"]
      },
      {
        q: "O Hospital Samaritano está na rede do plano Black R1?",
        expectedFacts: ["Samaritano", "Black R1", "rede"]
      },
      {
        q: "Qual plano tem a rede mais ampla de hospitais em São Paulo?",
        expectedFacts: ["rede credenciada", "São Paulo", "hospitais"]
      },
      {
        q: "Posso fazer portabilidade de outro plano para reduzir carência?",
        expectedFacts: ["portabilidade", "carência", "congênere"]
      },
      {
        q: "Se eu tiver plano há mais de 12 meses, qual PRC se aplica?",
        expectedFacts: ["PRC 609", "12 meses", "não congênere"]
      },
      {
        q: "Resuma as 3 melhores opções para mim considerando minhas condições de saúde.",
        expectedFacts: ["resumo", "recomendação", "condições pré-existentes"]
      }
    ]
  },

  // CHAT 4: Jovem solteiro 24 anos BH orçamento baixo
  {
    name: "jovem-24-bh-baixo-orcamento",
    interactions: [
      {
        q: "Tenho 24 anos, moro em Belo Horizonte MG, orçamento de R$400/mês. Sou solteiro sem dependentes.",
        expectedFacts: ["24 anos", "Belo Horizonte", "MG", "R$400"]
      },
      {
        q: "Sim, busque planos.",
        expectedFacts: ["busca"]
      },
      {
        q: "Existe algum plano AMIL que cubra BH nessa faixa de preço?",
        expectedFacts: ["AMIL", "Belo Horizonte", "MG"]
      },
      {
        q: "Qual a diferença entre plano com quarto coletivo (QC) e quarto privativo (QP)?",
        expectedFacts: ["QC", "QP", "coletivo", "privativo", "acomodação"]
      },
      {
        q: "Planos com coparticipação são mais baratos?",
        expectedFacts: ["coparticipação", "mais barato", "desconto"]
      },
      {
        q: "Como funciona a coparticipação na AMIL? Tem tabela?",
        expectedFacts: ["coparticipação", "tabela", "AMIL"]
      },
      {
        q: "O que são exames básicos vs exames especiais na coparticipação?",
        expectedFacts: ["exames básicos", "exames especiais"]
      },
      {
        q: "Se eu precisar de uma consulta de emergência, qual a carência?",
        expectedFacts: ["urgência", "emergência", "24 horas"]
      },
      {
        q: "E para uma consulta eletiva, qual a carência?",
        expectedFacts: ["eletiva", "carência", "30 dias"]
      },
      {
        q: "Posso contratar plano individual (PF) ou precisa ser PME?",
        expectedFacts: ["individual", "PME", "PF"]
      },
      {
        q: "Qual plano da SulAmérica Básico seria bom para mim?",
        expectedFacts: ["SulAmérica", "básico"]
      },
      {
        q: "O Executivo R1 da SulAmérica, quanto custa para faixa 24-28?",
        expectedFacts: ["R$1.473,47", "Executivo R1", "24 a 28"]
      },
      {
        q: "Isso está muito acima do meu orçamento. Tem algo mais em conta?",
        expectedFacts: ["orçamento", "alternativa", "mais barato"]
      },
      {
        q: "Qual o plano mais barato disponível para minha faixa etária?",
        expectedFacts: ["mais barato", "faixa 24-28"]
      },
      {
        q: "Faça um comparativo final dos planos que cabem no meu orçamento.",
        expectedFacts: ["comparativo", "orçamento R$400"]
      }
    ]
  },

  // CHAT 5: Empresa 30 funcionários (Porte II)
  {
    name: "empresa-30-func-porte2",
    interactions: [
      {
        q: "Tenho uma empresa com 30 funcionários em São Paulo SP. Preciso de plano empresarial com orçamento de R$800 por vida.",
        expectedFacts: ["30 funcionários", "São Paulo", "empresarial"]
      },
      {
        q: "Busque planos para minha empresa.",
        expectedFacts: ["busca", "PME", "Porte II"]
      },
      {
        q: "Com 30 funcionários, minha empresa é Porte I ou Porte II?",
        expectedFacts: ["Porte II", "30 a 99 vidas"]
      },
      {
        q: "Qual a diferença de regras entre Porte I e Porte II?",
        expectedFacts: ["Porte I", "Porte II", "regras", "vidas"]
      },
      {
        q: "Preciso incluir todos os funcionários ou posso escolher?",
        expectedFacts: ["elegibilidade", "titulares", "CLT"]
      },
      {
        q: "Funcionários temporários podem entrar?",
        expectedFacts: ["temporário", "CLT", "vínculo"]
      },
      {
        q: "Qual plano nacional da AMIL é mais indicado para empresa?",
        expectedFacts: ["nacional", "AMIL", "Prata", "PME"]
      },
      {
        q: "O plano Prata da AMIL tem reembolso?",
        expectedFacts: ["Prata", "reembolso", "nacional"]
      },
      {
        q: "Qual a tabela de reembolso da AMIL?",
        expectedFacts: ["reembolso", "tabela", "valores"]
      },
      {
        q: "Posso adicionar plano dental para todos os funcionários?",
        expectedFacts: ["dental", "Dental 100", "PME"]
      },
      {
        q: "Qual o custo do plano dental?",
        expectedFacts: ["dental", "preço"]
      },
      {
        q: "Se um funcionário sair da empresa, como funciona o cancelamento?",
        expectedFacts: ["cancelamento", "rescisão", "funcionário"]
      },
      {
        q: "Qual a vigência do contrato PME?",
        expectedFacts: ["vigência", "12 meses", "renovação"]
      },
      {
        q: "Existe reajuste anual? Como é calculado?",
        expectedFacts: ["reajuste", "anual", "faixa etária"]
      },
      {
        q: "Resuma a melhor proposta para minha empresa de 30 funcionários.",
        expectedFacts: ["resumo", "recomendação", "30 vidas"]
      }
    ]
  },

  // CHAT 6: Família com idosos (sogros)
  {
    name: "familia-com-idosos",
    interactions: [
      {
        q: "Tenho 42 anos, esposa 40, filhos de 14, 10 e 7 anos. Moro em São Paulo SP, orçamento R$2200/mês. Quero incluir meu sogro de 68 e sogra de 65.",
        expectedFacts: ["42 anos", "7 dependentes", "São Paulo", "idosos"]
      },
      {
        q: "Sim, busque planos.",
        expectedFacts: ["busca"]
      },
      {
        q: "Os sogros podem ser incluídos como dependentes no plano?",
        expectedFacts: ["dependente", "sogro", "agregado", "parentesco"]
      },
      {
        q: "Qual a faixa etária dos meus sogros e quanto custa por pessoa?",
        expectedFacts: ["faixa etária", "65", "68", "59+"]
      },
      {
        q: "Para sogro de 68 anos, existe restrição de carência na AMIL?",
        expectedFacts: ["carência", "69 anos", "PRC", "idade limite"]
      },
      {
        q: "O plano P520 da Porto Seguro custa quanto para faixa 44-48?",
        expectedFacts: ["R$2.043,54", "P520", "44 a 48"]
      },
      {
        q: "E o mesmo P520 para faixa 49-53?",
        expectedFacts: ["R$2.199,96", "P520", "49 a 53"]
      },
      {
        q: "Quanto custaria o Nacional Plus 4 para toda minha família (7 pessoas)?",
        expectedFacts: ["Nacional Plus 4", "soma", "7 pessoas", "faixas"]
      },
      {
        q: "Qual plano oferece melhor custo-benefício para uma família grande?",
        expectedFacts: ["custo-benefício", "família", "comparativo"]
      },
      {
        q: "Os planos da Einstein cobrem pediatria para crianças de 7 a 14 anos?",
        expectedFacts: ["pediatria", "crianças", "cobertura"]
      },
      {
        q: "Hospital Sabará está na rede credenciada de quais planos?",
        expectedFacts: ["Sabará", "infantil", "rede credenciada"]
      },
      {
        q: "O plano Exclusivo Mais da Alice, quanto custa para faixa 34-38?",
        expectedFacts: ["R$1.867,29", "Alice", "34 a 38"]
      },
      {
        q: "E para faixa 44-48?",
        expectedFacts: ["R$2.414,62", "Alice", "44 a 48"]
      },
      {
        q: "Com coparticipação ficaria mais barato para minha família?",
        expectedFacts: ["coparticipação", "economia", "família"]
      },
      {
        q: "Dê uma recomendação final considerando os 7 membros e o orçamento de R$2200.",
        expectedFacts: ["recomendação", "7 pessoas", "R$2200"]
      }
    ]
  },

  // CHAT 7: MEI sem funcionários
  {
    name: "mei-sem-funcionarios",
    interactions: [
      {
        q: "Sou MEI, não tenho funcionários, moro em Curitiba PR. Orçamento de R$600/mês. Tenho 35 anos.",
        expectedFacts: ["MEI", "Curitiba", "PR", "35 anos"]
      },
      {
        q: "Sim, busque planos.",
        expectedFacts: ["busca"]
      },
      {
        q: "Como MEI posso contratar plano PME?",
        expectedFacts: ["MEI", "empresário individual", "PME"]
      },
      {
        q: "Qual o mínimo de vidas para contratar PME?",
        expectedFacts: ["2 vidas", "mínimo", "PME"]
      },
      {
        q: "A AMIL tem plano Bronze para Curitiba?",
        expectedFacts: [
          "Bronze PR",
          "Curitiba",
          "14 municípios"
        ]
      },
      {
        q: "Quais municípios o Bronze PR cobre?",
        expectedFacts: [
          "Curitiba",
          "São José dos Pinhais",
          "Araucária",
          "Campo Largo"
        ]
      },
      {
        q: "Qual plano nacional estaria disponível para mim?",
        expectedFacts: ["nacional", "Prata", "Ouro", "AMIL"]
      },
      {
        q: "Qual a diferença entre Prata e Ouro da AMIL?",
        expectedFacts: ["Prata", "Ouro", "reembolso", "nacional"]
      },
      {
        q: "Posso fazer upgrade de Bronze PR para Prata depois?",
        expectedFacts: ["upgrade", "migração", "plano"]
      },
      {
        q: "A carência recomeça se eu mudar de plano?",
        expectedFacts: ["carência", "portabilidade", "mudar plano"]
      },
      {
        q: "Quanto tempo demora para implantar o contrato?",
        expectedFacts: ["implantação", "prazo"]
      },
      {
        q: "Preciso de CNPJ ativo há quanto tempo?",
        expectedFacts: ["CNPJ", "ativo", "tempo"]
      },
      {
        q: "Se eu cancelar, tem multa?",
        expectedFacts: ["cancelamento", "multa", "contrato"]
      },
      {
        q: "Existe opção de telemedicina nos planos?",
        expectedFacts: ["telemedicina", "teleconsulta"]
      },
      {
        q: "Resumo final: qual o melhor plano para um MEI em Curitiba com R$600?",
        expectedFacts: ["resumo", "MEI", "Curitiba", "R$600"]
      }
    ]
  },

  // CHAT 8: Comparativo de preços detalhado
  {
    name: "comparativo-precos",
    interactions: [
      {
        q: "Quero comparar preços de planos de saúde. Tenho 30 anos, São Paulo SP, orçamento de R$2000.",
        expectedFacts: ["30 anos", "São Paulo", "R$2000"]
      },
      {
        q: "Busque todos os planos disponíveis.",
        expectedFacts: ["busca"]
      },
      {
        q: "Quanto custa cada plano do comparativo Einstein para faixa 29-33?",
        expectedFacts: [
          "Alice R$1.626,74",
          "Amil R$2.018,15",
          "Bradesco R$1.841,87",
          "Porto R$2.234,99",
          "SulAmérica R$1.635,55"
        ]
      },
      {
        q: "Qual o plano mais caro e mais barato nessa faixa?",
        expectedFacts: [
          "mais caro: Nacional Plus 4 R$2.234,99",
          "mais barato: P520 R$1.528,85"
        ]
      },
      {
        q: "Agora me diga para a faixa 24-28, quanto custa cada um?",
        expectedFacts: [
          "Alice R$1.439,73",
          "Amil R$1.681,79",
          "Bradesco R$1.534,89"
        ]
      },
      {
        q: "O plano S2500 R1 da AMIL, quais são as modalidades de acomodação?",
        expectedFacts: ["apartamento", "S2500", "AMIL"]
      },
      {
        q: "O Black R1 da Bradesco tem reembolso?",
        expectedFacts: ["Black R1", "Bradesco"]
      },
      {
        q: "Qual plano tem a maior rede credenciada em SP capital?",
        expectedFacts: ["rede credenciada", "São Paulo", "hospitais"]
      },
      {
        q: "O Hospital Albert Einstein está em quais planos?",
        expectedFacts: ["Einstein", "planos", "rede"]
      },
      {
        q: "A diferença de preço entre Amil S2500 e Alice Exclusivo compensa?",
        expectedFacts: ["comparativo", "preço", "custo-benefício"]
      },
      {
        q: "Qual plano oferece melhor cobertura para exames de imagem (tomografia, ressonância)?",
        expectedFacts: ["exames", "tomografia", "ressonância", "cobertura"]
      },
      {
        q: "O plano P520 da Porto é o mais barato. Qual a desvantagem dele?",
        expectedFacts: ["P520", "Porto", "desvantagem"]
      },
      {
        q: "Se eu adicionar esposa de 28 anos, quanto ficaria o P520 para nós dois?",
        expectedFacts: ["P520", "faixa", "soma", "casal"]
      },
      {
        q: "E o Alice Exclusivo Mais para nós dois?",
        expectedFacts: ["Alice", "soma", "casal"]
      },
      {
        q: "Tabela final comparativa com preço individual e casal para os 6 planos.",
        expectedFacts: ["tabela", "comparativo", "6 planos"]
      }
    ]
  },

  // CHAT 9: Regras de carência e portabilidade
  {
    name: "carencia-portabilidade",
    interactions: [
      {
        q: "Tenho 45 anos, moro em São Paulo SP, R$1500/mês. Tenho plano da Unimed há 3 anos e quero trocar.",
        expectedFacts: ["45 anos", "São Paulo", "R$1500", "Unimed", "3 anos"]
      },
      {
        q: "Sim, busque planos.",
        expectedFacts: ["busca"]
      },
      {
        q: "Tendo plano há mais de 12 meses em operadora não congênere, qual PRC se aplica?",
        expectedFacts: ["PRC 609", "não congênere", "12 meses"]
      },
      {
        q: "O que é uma operadora congênere?",
        expectedFacts: ["congênere", "mesmo grupo", "operadora"]
      },
      {
        q: "A Unimed é congênere da AMIL?",
        expectedFacts: ["Unimed", "AMIL", "congênere"]
      },
      {
        q: "Com PRC 609, qual a carência para consultas eletivas?",
        expectedFacts: ["PRC 609", "consulta eletiva", "1 dia"]
      },
      {
        q: "E para internação com PRC 609?",
        expectedFacts: ["PRC 609", "internação"]
      },
      {
        q: "Preciso cumprir intervalo máximo entre a rescisão e a nova contratação?",
        expectedFacts: ["60 dias", "intervalo", "rescisão"]
      },
      {
        q: "E se eu ficar mais de 60 dias sem plano, o que acontece?",
        expectedFacts: ["perde", "PRC", "carência completa"]
      },
      {
        q: "O que é PRC 607?",
        expectedFacts: ["PRC 607", "sem vínculo anterior", "primeira vez"]
      },
      {
        q: "Qual a carência completa para parto?",
        expectedFacts: ["parto", "300 dias", "carência"]
      },
      {
        q: "E para urgência e emergência?",
        expectedFacts: ["urgência", "emergência", "24 horas"]
      },
      {
        q: "O que é compra de carência? Posso fazer?",
        expectedFacts: ["compra de carência", "processo"]
      },
      {
        q: "Quais documentos preciso para comprovar meu plano anterior?",
        expectedFacts: ["documentos", "comprovante", "plano anterior"]
      },
      {
        q: "Resumo: com meu histórico de 3 anos na Unimed, quais carências eu teria?",
        expectedFacts: ["resumo", "PRC 609", "carências reduzidas"]
      }
    ]
  },

  // CHAT 10: Plano para família grande com múltiplos perfis
  {
    name: "familia-grande-multiplos",
    interactions: [
      {
        q: "Família com 5 pessoas: eu (38 anos), esposa (36), filho (15), filha (12), bebê (1 ano). Moramos em Campinas SP. Orçamento R$3000 total.",
        expectedFacts: ["38 anos", "5 pessoas", "Campinas", "SP", "R$3000"]
      },
      {
        q: "Sim, busque planos.",
        expectedFacts: ["busca"]
      },
      {
        q: "Campinas é coberta pelo Bronze SP da AMIL?",
        expectedFacts: ["Bronze SP", "23 municípios"]
      },
      {
        q: "E pelo Bronze SP Mais?",
        expectedFacts: ["Bronze SP Mais", "53 municípios", "Campinas"]
      },
      {
        q: "Para meu bebê de 1 ano, qual a faixa etária e preço?",
        expectedFacts: ["faixa 0-18", "bebê", "preço"]
      },
      {
        q: "Meu filho de 15 anos pode ficar como dependente até que idade?",
        expectedFacts: ["dependente", "limite idade", "filho"]
      },
      {
        q: "Qual plano cobre pediatria e maternidade caso tenhamos outro filho?",
        expectedFacts: ["pediatria", "maternidade", "parto", "cobertura"]
      },
      {
        q: "A carência de parto é de quantos dias?",
        expectedFacts: ["300 dias", "parto", "carência"]
      },
      {
        q: "Qual o valor do Nacional Plus 4 para faixa 34-38?",
        expectedFacts: ["R$2.547,87", "Nacional Plus 4", "34 a 38"]
      },
      {
        q: "Para 5 pessoas com as faixas etárias que tenho, quanto ficaria o P520 da Porto?",
        expectedFacts: ["P520", "5 pessoas", "faixas", "soma"]
      },
      {
        q: "Existem descontos para famílias grandes?",
        expectedFacts: ["desconto", "família"]
      },
      {
        q: "O plano Ouro da AMIL, qual a diferença para o Platinum?",
        expectedFacts: ["Ouro", "Platinum", "diferença", "AMIL"]
      },
      {
        q: "Posso contratar planos diferentes para cada membro da família?",
        expectedFacts: ["planos diferentes", "contrato"]
      },
      {
        q: "Qual a cobertura para ortodontia no plano dental?",
        expectedFacts: ["ortodontia", "dental", "cobertura"]
      },
      {
        q: "Recomendação final: melhor plano para minha família de 5 em Campinas dentro de R$3000.",
        expectedFacts: ["recomendação", "5 pessoas", "R$3000", "Campinas"]
      }
    ]
  }
]

// ===================================================================
// TEST EXECUTION
// ===================================================================

test.describe("Comprehensive Accuracy Test - 10 Chats", () => {
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]

    test(`Chat ${i + 1}: ${scenario.name}`, async ({ page }) => {
      test.setTimeout(600000) // 10 min per chat

      await login(page)

      await runChatScenario(
        page,
        i + 1,
        scenario.name,
        scenario.interactions
      )

      // Log results for this chat
      const chatResults = allResults.filter(r => r.chat === i + 1)
      console.log(`\n--- Chat ${i + 1} Summary ---`)
      console.log(`Scenario: ${scenario.name}`)
      console.log(`Turns completed: ${chatResults.length}`)
    })
  }
})
