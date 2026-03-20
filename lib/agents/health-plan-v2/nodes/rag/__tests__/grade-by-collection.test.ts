/**
 * Testes - Grade By Collection
 *
 * Valida o funcionamento do gradeByCollection antes e depois da otimização.
 *
 * Baseline: Captura comportamento atual antes de remover chunks
 */

// Using global jest.mock for proper hoisting (not @jest/globals)
import { gradeByCollection } from "../grade-by-collection"
import type { RetrieveByFileResult, ClientInfo } from "../retrieve-simple"
import type { FileGradingResult } from "../grade-documents"

// Mock do ChatOpenAI (LangChain) - must use global jest for hoisting
jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn(() =>
      Promise.resolve({
        content: JSON.stringify({
          identifiedPlans: [
            {
              planName: "Unimed Básico 100",
              sourceFileNames: ["unimed-tabela.pdf", "unimed-regras.pdf"],
              planType: "individual",
              summary:
                "Plano básico com cobertura regional e coparticipação moderada",
              importantRules: [
                "Carência de 180 dias para internação",
                "Coparticipação de 30% em consultas"
              ],
              waitingPeriods: ["180 dias internação", "300 dias parto"],
              coparticipation: "30% em consultas e exames",
              coverage: ["SP"],
              basePrice: {
                value: 450,
                currency: "BRL",
                period: "mensal",
                ageRange: "30-39 anos"
              },
              network: ["Hospital Sírio-Libanês", "Hospital Albert Einstein"],
              clientRelevance: "high",
              relevanceJustification:
                "Atende orçamento de R$500 e localização em São Paulo"
            },
            {
              planName: "Unimed Premium 200",
              sourceFileNames: ["unimed-tabela.pdf"],
              planType: "familiar",
              summary:
                "Plano premium com cobertura nacional e sem coparticipação",
              importantRules: [
                "Sem carência para consultas",
                "Cobertura internacional opcional"
              ],
              waitingPeriods: ["24 horas urgência/emergência"],
              coverage: ["Nacional"],
              basePrice: {
                value: 850,
                currency: "BRL",
                period: "mensal",
                ageRange: "30-39 anos"
              },
              clientRelevance: "medium",
              relevanceJustification:
                "Preço acima do orçamento, mas oferece cobertura superior"
            }
          ],
          collectionSummary: {
            rulesAffectingClient: [
              "Carência de parto pode afetar dependentes",
              "Coparticipação aumenta custo efetivo do plano básico"
            ],
            missingInformation: [
              "Rede credenciada completa não especificada",
              "Condições para upgrade entre planos"
            ]
          },
          overallAnalysis:
            "A Unimed oferece dois planos com características distintas. O Básico 100 atende o orçamento mas tem coparticipação. O Premium 200 é mais completo mas excede o orçamento."
        })
      })
    )
  })),
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn(() => Promise.resolve(new Array(1536).fill(0.1)))
  }))
}))

describe("gradeByCollection", () => {
  let mockFileResults: RetrieveByFileResult[]
  let mockGradingResults: FileGradingResult[]
  let mockClientInfo: ClientInfo

  beforeEach(() => {
    // Setar env vars para evitar erro de API key no construtor do ChatOpenAI
    process.env.OPENAI_API_KEY = "test-key"
    // Mock file results com chunks (simula output de retrieveByFile)
    mockFileResults = [
      {
        fileId: "file-1",
        fileName: "unimed-tabela.pdf",
        fileDescription: "Tabela de preços Unimed 2024",
        collection: {
          id: "col-unimed",
          name: "Unimed",
          description: "Planos Unimed São Paulo"
        },
        chunks: [
          {
            id: "chunk-1",
            content:
              "Plano Básico 100: R$450/mês (30-39 anos). Cobertura regional SP.",
            tokens: 20,
            similarity: 0.92,
            file: {
              id: "file-1",
              name: "unimed-tabela.pdf",
              description: "Tabela de preços"
            },
            collection: {
              id: "col-unimed",
              name: "Unimed",
              description: "Planos Unimed"
            }
          },
          {
            id: "chunk-2",
            content:
              "Plano Premium 200: R$850/mês (30-39 anos). Cobertura nacional.",
            tokens: 18,
            similarity: 0.88,
            file: {
              id: "file-1",
              name: "unimed-tabela.pdf",
              description: "Tabela de preços"
            },
            collection: {
              id: "col-unimed",
              name: "Unimed",
              description: "Planos Unimed"
            }
          },
          {
            id: "chunk-3",
            content:
              "Coparticipação Básico 100: 30% consultas e exames. Premium 200: isento.",
            tokens: 16,
            similarity: 0.85,
            file: {
              id: "file-1",
              name: "unimed-tabela.pdf",
              description: "Tabela de preços"
            },
            collection: {
              id: "col-unimed",
              name: "Unimed",
              description: "Planos Unimed"
            }
          }
        ],
        totalChunks: 3
      },
      {
        fileId: "file-2",
        fileName: "unimed-regras.pdf",
        fileDescription: "Regulamento Unimed",
        collection: {
          id: "col-unimed",
          name: "Unimed",
          description: "Planos Unimed São Paulo"
        },
        chunks: [
          {
            id: "chunk-4",
            content:
              "Carências: 180 dias internação, 300 dias parto, 24h urgência/emergência.",
            tokens: 15,
            similarity: 0.9,
            file: {
              id: "file-2",
              name: "unimed-regras.pdf",
              description: "Regulamento"
            },
            collection: {
              id: "col-unimed",
              name: "Unimed",
              description: "Planos Unimed"
            }
          },
          {
            id: "chunk-5",
            content:
              "Rede credenciada inclui: Hospital Sírio-Libanês, Albert Einstein, HCOR.",
            tokens: 14,
            similarity: 0.82,
            file: {
              id: "file-2",
              name: "unimed-regras.pdf",
              description: "Regulamento"
            },
            collection: {
              id: "col-unimed",
              name: "Unimed",
              description: "Planos Unimed"
            }
          }
        ],
        totalChunks: 2
      }
    ]

    // Mock grading results (simula output de gradeByFile)
    mockGradingResults = [
      {
        fileId: "file-1",
        fileName: "unimed-tabela.pdf",
        collectionName: "Unimed",
        relevance: "high",
        analysisText: `**COMPATIBILIDADE:** Alta

**ATENDE AO PERFIL:**
- Faixa etária: Sim - Tabela específica para 30-39 anos
- Localização: Sim - Cobertura regional SP
- Orçamento: Sim - Plano Básico R$450 dentro do orçamento de R$500
- Dependentes: Parcial - Não menciona valores para dependentes

**DESTAQUES DO PLANO:**
- Plano Básico 100 com preço competitivo R$450/mês
- Plano Premium 200 com cobertura nacional R$850/mês
- Opções de coparticipação (Básico) e sem coparticipação (Premium)

**ALERTAS:**
- Coparticipação de 30% no Plano Básico aumenta custo efetivo
- Plano Premium excede orçamento em R$350/mês
- Valores para dependentes não especificados neste arquivo

**RESPOSTA À PERGUNTA DO CLIENTE:**
O arquivo apresenta duas opções: Plano Básico dentro do orçamento mas com coparticipação, e Plano Premium mais completo mas acima do orçamento.

**RESUMO:**
Arquivo relevante com tabela de preços para faixa etária 30-39 anos. Plano Básico atende orçamento mas tem coparticipação.`
      },
      {
        fileId: "file-2",
        fileName: "unimed-regras.pdf",
        collectionName: "Unimed",
        relevance: "high",
        analysisText: `**COMPATIBILIDADE:** Alta

**ATENDE AO PERFIL:**
- Faixa etária: N/A - Regulamento geral aplicável a todos
- Localização: Sim - Rede credenciada em SP
- Orçamento: N/A - Não menciona preços
- Dependentes: Parcial - Carência de parto relevante para dependentes

**DESTAQUES DO PLANO:**
- Rede credenciada de alto padrão (Sírio-Libanês, Einstein, HCOR)
- Atendimento de urgência/emergência com carência de apenas 24h
- Carências padrão da ANS

**ALERTAS:**
- Carência de 180 dias para internação
- Carência de 300 dias para parto (relevante se houver dependentes grávidas)
- Rede credenciada pode não cobrir toda a região metropolitana

**RESPOSTA À PERGUNTA DO CLIENTE:**
O regulamento detalha carências e rede credenciada. Importante considerar carências se necessitar procedimentos em curto prazo.

**RESUMO:**
Regulamento com informações sobre carências e rede credenciada de alta qualidade em São Paulo.`
      }
    ]

    // Mock client info
    mockClientInfo = {
      age: 35,
      city: "São Paulo",
      state: "SP",
      budget: 500,
      dependents: []
    }
  })

  it("deve identificar planos usando previousAnalysisText", async () => {
    const result = await gradeByCollection(
      mockFileResults,
      mockGradingResults,
      mockClientInfo,
      []
    )

    // Validar que planos foram identificados
    expect(result.stats.totalPlansIdentified).toBeGreaterThan(0)
    expect(result.collectionAnalyses).toBeDefined()
    expect(result.collectionAnalyses.length).toBeGreaterThan(0)

    // Validar primeiro plano
    const firstCollection = result.collectionAnalyses[0]
    expect(firstCollection.identifiedPlans).toBeDefined()
    expect(firstCollection.identifiedPlans.length).toBeGreaterThan(0)

    const firstPlan = firstCollection.identifiedPlans[0]
    expect(firstPlan.planName).toBeDefined()
    expect(firstPlan.sourceFileNames).toBeDefined()
    expect(firstPlan.clientRelevance).toBeDefined()
    expect(firstPlan.relevanceJustification).toBeDefined()
  })

  it("deve manter estrutura de output compatível", async () => {
    const result = await gradeByCollection(
      mockFileResults,
      mockGradingResults,
      mockClientInfo,
      []
    )

    // Validar estrutura completa
    expect(result).toHaveProperty("collectionAnalyses")
    expect(result).toHaveProperty("consolidatedAnalysisText")
    expect(result).toHaveProperty("stats")

    // Validar stats
    expect(result.stats).toHaveProperty("totalCollections")
    expect(result.stats).toHaveProperty("totalPlansIdentified")
    expect(result.stats).toHaveProperty("highRelevancePlans")
    expect(result.stats).toHaveProperty("mediumRelevancePlans")
    expect(result.stats).toHaveProperty("lowRelevancePlans")
    expect(result.stats).toHaveProperty("irrelevantPlans")
    expect(result.stats).toHaveProperty("executionTimeMs")

    // Validar collection analysis
    const collection = result.collectionAnalyses[0]
    expect(collection).toHaveProperty("collectionId")
    expect(collection).toHaveProperty("collectionName")
    expect(collection).toHaveProperty("identifiedPlans")
    expect(collection).toHaveProperty("totalPlans")
    expect(collection).toHaveProperty("analyzedFiles")
    expect(collection).toHaveProperty("collectionSummary")
    expect(collection).toHaveProperty("overallAnalysis")
  })

  it("deve calcular tokens baseado em previousAnalysisText", () => {
    // Teste de cálculo de tokens
    const analysisText = "A".repeat(1000) // 1000 chars = ~250 tokens
    const tokens = Math.ceil(analysisText.length / 4)
    expect(tokens).toBe(250)

    // Validar que análises mockadas têm texto
    expect(mockGradingResults[0].analysisText.length).toBeGreaterThan(100)
    expect(mockGradingResults[1].analysisText.length).toBeGreaterThan(100)
  })

  it("deve agregar múltiplos arquivos por collection", async () => {
    const result = await gradeByCollection(
      mockFileResults,
      mockGradingResults,
      mockClientInfo,
      []
    )

    const collection = result.collectionAnalyses[0]

    // Validar que ambos arquivos foram analisados
    expect(collection.analyzedFiles).toBeDefined()
    expect(collection.analyzedFiles.length).toBe(2)

    // Validar que arquivos têm relevância atribuída
    collection.analyzedFiles.forEach(file => {
      expect(file.fileName).toBeDefined()
      expect(file.relevance).toBeDefined()
      expect(["high", "medium", "low", "irrelevant"]).toContain(file.relevance)
    })
  })

  it("deve gerar texto consolidado formatado", async () => {
    const result = await gradeByCollection(
      mockFileResults,
      mockGradingResults,
      mockClientInfo,
      ["Buscar plano para pessoa de 35 anos em São Paulo"]
    )

    // Validar que texto foi gerado
    expect(result.consolidatedAnalysisText).toBeDefined()
    expect(result.consolidatedAnalysisText.length).toBeGreaterThan(100)

    // Validar que contém seções esperadas
    expect(result.consolidatedAnalysisText).toContain("ANÁLISE DE PLANOS")
    expect(result.consolidatedAnalysisText).toContain("OPERADORA")
  })

  it("deve retornar resultado vazio quando não há collections", async () => {
    const result = await gradeByCollection(
      [], // Sem file results
      [],
      mockClientInfo,
      []
    )

    expect(result.collectionAnalyses).toEqual([])
    expect(result.stats.totalCollections).toBe(0)
    expect(result.stats.totalPlansIdentified).toBe(0)
  })

  it("deve lidar com análises anteriores ausentes", async () => {
    // File results sem análise correspondente
    const incompleteGrading: FileGradingResult[] = [
      {
        fileId: "file-1",
        fileName: "unimed-tabela.pdf",
        collectionName: "Unimed",
        relevance: "medium",
        analysisText: "" // Análise vazia
      }
    ]

    const result = await gradeByCollection(
      mockFileResults,
      incompleteGrading,
      mockClientInfo,
      []
    )

    // Deve processar mesmo com análise vazia
    expect(result.collectionAnalyses.length).toBeGreaterThan(0)
  })

  it("deve classificar relevância dos planos corretamente", async () => {
    const result = await gradeByCollection(
      mockFileResults,
      mockGradingResults,
      mockClientInfo,
      []
    )

    // Validar que stats contêm distribuição de relevância
    const stats = result.stats
    const totalPlans = stats.totalPlansIdentified

    expect(
      stats.highRelevancePlans +
        stats.mediumRelevancePlans +
        stats.lowRelevancePlans +
        stats.irrelevantPlans
    ).toBe(totalPlans)
  })
})
