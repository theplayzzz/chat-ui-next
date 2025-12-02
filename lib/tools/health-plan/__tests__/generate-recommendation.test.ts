/**
 * Tests for Generate Recommendation Tool
 *
 * Testes unitários e de integração para geração de recomendações
 *
 * Task Master: Task #9
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  generateRecommendation,
  generateMainRecommendation,
  generateAlternatives,
  generateComparisonTable,
  generateAlertsSection,
  generateNextSteps,
  generateIntro,
  type GenerateRecommendationParams
} from "../generate-recommendation"
import type {
  RankedAnalysis,
  PlanCompatibilityAnalysis,
  CategorizedAlert
} from "../analyze-compatibility"
import type { ClientInfo } from "../schemas/client-info-schema"
import {
  formatCurrency,
  formatDate,
  formatPercentage,
  formatScoreBar,
  getScoreIcon,
  formatBadge,
  getAlertIcon,
  formatWaitingPeriod,
  truncateText,
  addTermExplanation,
  addAllTermExplanations,
  HEALTH_PLAN_GLOSSARY,
  renderComparisonTableMarkdown,
  renderAlertsMarkdown,
  type AlertsSection
} from "../templates/recommendation-template"

// =============================================================================
// MOCKS
// =============================================================================

vi.mock("@/lib/monitoring/langsmith-setup", () => ({
  traceable: vi.fn((fn: any) => fn),
  createTracedOpenAI: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  })),
  createSimpleTracedOpenAI: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  })),
  addRunMetadata: vi.fn(),
  addRunTags: vi.fn(),
  setSessionId: vi.fn(),
  checkLangSmithConfig: vi.fn(() => ({
    isEnabled: false,
    hasApiKey: false,
    hasProject: false
  })),
  validateAndLogConfig: vi.fn(() => false),
  createStepTraceOptions: vi.fn(() => ({})),
  WORKFLOW_STEP_NAMES: {
    EXTRACT_CLIENT_INFO: "extract_client_info",
    SEARCH_HEALTH_PLANS: "search_health_plans",
    ANALYZE_COMPATIBILITY: "analyze_compatibility",
    FETCH_ERP_PRICES: "fetch_erp_prices",
    GENERATE_RECOMMENDATION: "generate_recommendation"
  },
  STEP_RUN_TYPES: {
    extract_client_info: "chain",
    search_health_plans: "retriever",
    analyze_compatibility: "chain",
    fetch_erp_prices: "tool",
    generate_recommendation: "chain"
  },
  LANGSMITH_DEFAULTS: {
    projectName: "health-plan-agent",
    tracingEnabled: false
  }
}))

// =============================================================================
// MOCK DATA
// =============================================================================

const mockClientInfo: ClientInfo = {
  age: 35,
  dependents: [
    { relationship: "spouse", age: 32 },
    { relationship: "child", age: 5 }
  ],
  preExistingConditions: ["diabetes tipo 2"],
  medications: ["metformina"],
  city: "São Paulo",
  state: "SP",
  budget: 2000,
  preferences: {
    networkType: "broad",
    coParticipation: false
  }
}

const mockPlanAnalysis: PlanCompatibilityAnalysis = {
  planId: "plan-001",
  planName: "Plano Vida+ Família",
  operadora: "Amil",
  collectionId: "col-001",
  collectionName: "Amil Plans",
  eligibility: {
    isEligible: true,
    confidence: 90,
    reasons: ["Atende todos os requisitos de elegibilidade"]
  },
  coverage: {
    overallAdequacy: 85,
    conditionsCoverage: [
      {
        condition: "diabetes tipo 2",
        isCovered: true,
        coverageLevel: "full",
        details: "Cobertura completa para tratamento de diabetes"
      }
    ],
    generalCoverageHighlights: ["Ampla rede de hospitais", "Cobertura nacional"]
  },
  score: {
    overall: 85,
    breakdown: {
      eligibility: 90,
      coverage: 85,
      budget: 80,
      network: 85,
      preferences: 75
    },
    calculation: "Score calculado..."
  },
  pros: [
    "Excelente cobertura para diabetes",
    "Ampla rede credenciada em SP",
    "Sem restrições de elegibilidade"
  ],
  cons: ["Preço ligeiramente acima do orçamento"],
  alerts: [],
  reasoning: "Este plano oferece excelente cobertura para seu perfil.",
  analyzedAt: new Date().toISOString(),
  confidence: 85
}

const mockBudgetPlan: PlanCompatibilityAnalysis = {
  ...mockPlanAnalysis,
  planId: "plan-002",
  planName: "Plano Essencial",
  score: {
    overall: 72,
    breakdown: {
      eligibility: 85,
      coverage: 65,
      budget: 95,
      network: 70,
      preferences: 60
    },
    calculation: "Score calculado..."
  },
  pros: ["Preço acessível", "Boa relação custo-benefício"],
  cons: ["Cobertura mais limitada", "Rede regional"]
}

const mockPremiumPlan: PlanCompatibilityAnalysis = {
  ...mockPlanAnalysis,
  planId: "plan-003",
  planName: "Plano Premium Gold",
  score: {
    overall: 92,
    breakdown: {
      eligibility: 95,
      coverage: 98,
      budget: 60,
      network: 95,
      preferences: 90
    },
    calculation: "Score calculado..."
  },
  pros: [
    "Cobertura mais completa do mercado",
    "Rede premium",
    "Reembolso integral"
  ],
  cons: ["Preço elevado"]
}

const mockRankedAnalysis: RankedAnalysis = {
  clientProfile: mockClientInfo,
  rankedPlans: [mockPlanAnalysis, mockBudgetPlan, mockPremiumPlan],
  recommended: {
    main: mockPlanAnalysis,
    alternatives: [mockBudgetPlan, mockPremiumPlan]
  },
  badges: {
    "plan-001": ["recomendado"],
    "plan-002": ["mais-acessivel"],
    "plan-003": ["mais-completo"]
  },
  criticalAlerts: {
    all: [],
    byUrgency: {
      critico: [],
      importante: [],
      informativo: []
    },
    byPlan: {}
  },
  executiveSummary: {
    topPlan: {
      name: "Plano Vida+ Família",
      score: 85,
      mainReason: "Melhor equilíbrio entre cobertura e preço"
    },
    alternatives: [],
    criticalAlerts: 0,
    averageScore: 83
  },
  budget: mockBudgetPlan,
  premium: mockPremiumPlan,
  executionTimeMs: 5000,
  metadata: {
    totalPlansAnalyzed: 3,
    analysisVersion: "1.0.0",
    modelUsed: "gpt-4o"
  }
}

const mockCategorizedAlert: CategorizedAlert = {
  planId: "plan-001",
  planName: "Plano Vida+ Família",
  alert: {
    type: "carencia",
    severity: "medium",
    title: "Carência de 180 dias",
    description: "Procedimentos complexos têm carência de 180 dias",
    impactScore: 5
  },
  urgency: "importante",
  category: "Carência"
}

// =============================================================================
// UNIT TESTS - Template Formatters
// =============================================================================

describe("Template Formatters", () => {
  describe("formatCurrency", () => {
    it("formats positive values correctly", () => {
      // Intl.NumberFormat uses non-breaking space (NBSP \u00A0) between R$ and number
      expect(formatCurrency(1234.56)).toBe("R$\u00A01.234,56")
      expect(formatCurrency(999.99)).toBe("R$\u00A0999,99")
      expect(formatCurrency(0)).toBe("R$\u00A00,00")
    })

    it("handles null/undefined values", () => {
      expect(formatCurrency(null)).toBe("Sob consulta")
      expect(formatCurrency(undefined)).toBe("Sob consulta")
    })

    it("handles NaN", () => {
      expect(formatCurrency(NaN)).toBe("Sob consulta")
    })
  })

  describe("formatDate", () => {
    it("formats ISO string correctly", () => {
      const result = formatDate("2025-11-24T10:30:00Z")
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })

    it("formats Date object correctly", () => {
      const result = formatDate(new Date(2025, 10, 24))
      expect(result).toBe("24/11/2025")
    })
  })

  describe("formatPercentage", () => {
    it("formats integer values", () => {
      expect(formatPercentage(85)).toBe("85%")
      expect(formatPercentage(100)).toBe("100%")
    })

    it("formats decimal values (0-1)", () => {
      expect(formatPercentage(0.85)).toBe("85%")
      expect(formatPercentage(0.5)).toBe("50%")
    })

    it("supports decimal places", () => {
      expect(formatPercentage(85.567, 1)).toBe("85.6%")
      expect(formatPercentage(0.8567, 2)).toBe("85.67%")
    })
  })

  describe("formatScoreBar", () => {
    it("creates visual bar for high scores", () => {
      const result = formatScoreBar(100)
      expect(result).toContain("█")
      expect(result).toContain("100/100")
    })

    it("creates visual bar for low scores", () => {
      const result = formatScoreBar(30)
      expect(result).toContain("░")
      expect(result).toContain("30/100")
    })
  })

  describe("getScoreIcon", () => {
    it("returns correct icons for score ranges", () => {
      expect(getScoreIcon(90)).toBe("✅")
      expect(getScoreIcon(70)).toBe("🟢")
      expect(getScoreIcon(50)).toBe("🟡")
      expect(getScoreIcon(30)).toBe("🔴")
    })
  })

  describe("formatBadge", () => {
    it("formats known badges correctly", () => {
      expect(formatBadge("recomendado")).toEqual({
        icon: "⭐",
        text: "Recomendado",
        full: "⭐ Recomendado"
      })
      expect(formatBadge("mais-completo")).toEqual({
        icon: "💎",
        text: "Mais Completo",
        full: "💎 Mais Completo"
      })
    })

    it("handles unknown badges", () => {
      const result = formatBadge("unknown")
      expect(result.icon).toBe("📋")
      expect(result.text).toBe("unknown")
    })
  })

  describe("getAlertIcon", () => {
    it("returns correct icons for urgency levels", () => {
      expect(getAlertIcon("critico")).toBe("🚨")
      expect(getAlertIcon("importante")).toBe("⚠️")
      expect(getAlertIcon("informativo")).toBe("ℹ️")
    })
  })

  describe("formatWaitingPeriod", () => {
    it("formats days correctly", () => {
      expect(formatWaitingPeriod(0)).toBe("Sem carência")
      expect(formatWaitingPeriod(15)).toBe("15 dias")
      expect(formatWaitingPeriod(30)).toBe("1 mês")
      expect(formatWaitingPeriod(180)).toBe("6 meses")
      expect(formatWaitingPeriod(365)).toBe("1 ano")
      expect(formatWaitingPeriod(730)).toBe("2 anos")
    })
  })

  describe("truncateText", () => {
    it("truncates long text", () => {
      const longText = "This is a very long text that should be truncated"
      const result = truncateText(longText, 20)
      expect(result.length).toBe(20)
      expect(result).toContain("...")
    })

    it("keeps short text unchanged", () => {
      const shortText = "Short"
      expect(truncateText(shortText, 20)).toBe(shortText)
    })
  })
})

// =============================================================================
// UNIT TESTS - Glossary
// =============================================================================

describe("Health Plan Glossary", () => {
  it("contains essential terms", () => {
    expect(HEALTH_PLAN_GLOSSARY.carencia).toBeDefined()
    expect(HEALTH_PLAN_GLOSSARY.coparticipacao).toBeDefined()
    expect(HEALTH_PLAN_GLOSSARY.cobertura).toBeDefined()
    expect(HEALTH_PLAN_GLOSSARY.rede_credenciada).toBeDefined()
  })

  describe("addTermExplanation", () => {
    it("adds explanation to known term", () => {
      const text = "O plano tem carência de 30 dias."
      const result = addTermExplanation(text, "carencia")
      expect(result).toContain("período de espera")
    })

    it("keeps unknown terms unchanged", () => {
      const text = "Texto sem termos conhecidos"
      const result = addTermExplanation(text, "unknown")
      expect(result).toBe(text)
    })
  })

  describe("addAllTermExplanations", () => {
    it("adds explanations to multiple terms", () => {
      const text = "O plano tem carência e coparticipação."
      const result = addAllTermExplanations(text)
      expect(result).toContain("período de espera")
      expect(result).toContain("valor que você paga")
    })
  })
})

// =============================================================================
// UNIT TESTS - Comparison Table
// =============================================================================

describe("generateComparisonTable", () => {
  it("generates table with top 3 plans", () => {
    const result = generateComparisonTable(
      mockRankedAnalysis.rankedPlans,
      mockRankedAnalysis.badges
    )

    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].planName).toBe("Plano Vida+ Família")
    expect(result.rows[0].badge).toBe("⭐")
    expect(result.rows[0].score).toBe(85)
  })

  it("handles empty plans array", () => {
    const result = generateComparisonTable([], {})
    expect(result.rows).toHaveLength(0)
  })

  it("adds footnotes when no prices", () => {
    const result = generateComparisonTable(
      mockRankedAnalysis.rankedPlans,
      mockRankedAnalysis.badges
    )
    expect(result.footnotes).toContain(
      "Preços sujeitos a confirmação com a operadora"
    )
  })
})

describe("renderComparisonTableMarkdown", () => {
  it("renders markdown table correctly", () => {
    const table = generateComparisonTable(
      mockRankedAnalysis.rankedPlans,
      mockRankedAnalysis.badges
    )
    const markdown = renderComparisonTableMarkdown(table)

    expect(markdown).toContain("## 📊 Comparativo")
    expect(markdown).toContain("| Plano |")
    expect(markdown).toContain("Plano Vida+ Família")
    expect(markdown).toContain("85/100")
  })

  it("returns empty string for empty table", () => {
    const result = renderComparisonTableMarkdown({ rows: [] })
    expect(result).toBe("")
  })
})

// =============================================================================
// UNIT TESTS - Alternatives
// =============================================================================

describe("generateAlternatives (without OpenAI)", () => {
  it("generates alternatives using fallback", async () => {
    const result = await generateAlternatives(
      mockClientInfo,
      mockPlanAnalysis,
      mockBudgetPlan,
      mockPremiumPlan,
      { recommended: 1500, budget: 1200, premium: 2200 }
      // No OpenAI client - uses fallback
    )

    expect(result.hasAlternatives).toBe(true)
    expect(result.budget).toBeDefined()
    expect(result.budget?.planName).toBe("Plano Essencial")
    expect(result.budget?.savingsVsRecommended).toBe(300)
    expect(result.premium).toBeDefined()
    expect(result.premium?.planName).toBe("Plano Premium Gold")
    expect(result.premium?.extraCostVsRecommended).toBe(700)
  })

  it("returns no alternatives when all same plan", async () => {
    const result = await generateAlternatives(
      mockClientInfo,
      mockPlanAnalysis,
      mockPlanAnalysis, // Same as recommended
      mockPlanAnalysis // Same as recommended
    )

    expect(result.hasAlternatives).toBe(false)
    expect(result.noAlternativesReason).toBeDefined()
  })
})

// =============================================================================
// UNIT TESTS - Alerts Section
// =============================================================================

describe("generateAlertsSection (without OpenAI)", () => {
  it("generates empty alerts when no alerts", async () => {
    const result = await generateAlertsSection(mockClientInfo, [], "Plano Test")

    expect(result.hasCriticalAlerts).toBe(false)
    expect(result.critical).toHaveLength(0)
    expect(result.important).toHaveLength(0)
    expect(result.informative).toHaveLength(0)
  })

  it("categorizes alerts correctly using fallback", async () => {
    const alerts: CategorizedAlert[] = [
      { ...mockCategorizedAlert, urgency: "critico" },
      { ...mockCategorizedAlert, urgency: "importante" },
      { ...mockCategorizedAlert, urgency: "informativo" }
    ]

    const result = await generateAlertsSection(
      mockClientInfo,
      alerts,
      "Plano Test"
    )

    expect(result.hasCriticalAlerts).toBe(true)
    expect(result.critical).toHaveLength(1)
    expect(result.important).toHaveLength(1)
    expect(result.informative).toHaveLength(1)
  })
})

describe("renderAlertsMarkdown", () => {
  it("renders no alerts message", () => {
    const alerts: AlertsSection = {
      hasCriticalAlerts: false,
      critical: [],
      important: [],
      informative: []
    }

    const markdown = renderAlertsMarkdown(alerts)
    expect(markdown).toContain("Ótimas notícias")
    expect(markdown).not.toContain("Atenção Imediata")
  })

  it("renders critical alerts prominently", () => {
    const alerts: AlertsSection = {
      hasCriticalAlerts: true,
      critical: [
        {
          icon: "🚨",
          title: "Alerta Crítico",
          description: "Descrição do alerta",
          impact: "Impacto significativo"
        }
      ],
      important: [],
      informative: []
    }

    const markdown = renderAlertsMarkdown(alerts)
    expect(markdown).toContain("Atenção Imediata")
    expect(markdown).toContain("Alerta Crítico")
    expect(markdown).toContain("Impacto:")
  })
})

// =============================================================================
// UNIT TESTS - Next Steps
// =============================================================================

describe("generateNextSteps (without OpenAI)", () => {
  it("generates steps for client with dependents and conditions", async () => {
    const result = await generateNextSteps(
      mockClientInfo,
      "Plano Test",
      "Operadora Test"
    )

    expect(result.steps.length).toBeGreaterThanOrEqual(3)
    expect(result.requiredDocuments).toContain("RG ou CNH do titular")
    expect(result.requiredDocuments.some(d => d.includes("dependentes"))).toBe(
      true
    )
    expect(
      result.requiredDocuments.some(d => d.includes("Declaração de saúde"))
    ).toBe(true)
    expect(result.estimatedTimeline).toBeDefined()
  })

  it("generates steps for single client without conditions", async () => {
    const simpleClient: ClientInfo = {
      age: 25,
      city: "Rio de Janeiro",
      state: "RJ",
      budget: 500
    }

    const result = await generateNextSteps(
      simpleClient,
      "Plano Básico",
      "Operadora"
    )

    expect(result.steps.length).toBeGreaterThanOrEqual(3)
    expect(result.requiredDocuments).toContain("RG ou CNH do titular")
    // Should NOT include dependent docs
    expect(result.requiredDocuments.some(d => d.includes("dependentes"))).toBe(
      false
    )
  })
})

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe("generateRecommendation Integration", () => {
  // Mock OpenAI to avoid actual API calls
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key")
  })

  it("returns error when no OPENAI_API_KEY", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")

    const params: GenerateRecommendationParams = {
      rankedAnalysis: mockRankedAnalysis
    }

    const result = await generateRecommendation(params)

    expect(result.success).toBe(false)
    expect(result.error).toContain("OPENAI_API_KEY")
  })

  // Note: Full integration tests would require mocking OpenAI responses
  // or running against a test environment
})

// =============================================================================
// SCHEMA VALIDATION TESTS
// =============================================================================

describe("Recommendation Schemas", () => {
  it("validates GenerateRecommendationParams", async () => {
    const { GenerateRecommendationParamsSchema } = await import(
      "../schemas/recommendation-schemas"
    )

    const params = {
      rankedAnalysis: {
        clientProfile: mockClientInfo,
        rankedPlans: [mockPlanAnalysis],
        recommended: {
          main: mockPlanAnalysis,
          alternatives: []
        },
        badges: {},
        criticalAlerts: {
          all: [],
          byUrgency: { critico: [], importante: [], informativo: [] },
          byPlan: {}
        },
        budget: null,
        premium: null
      }
    }

    expect(() => GenerateRecommendationParamsSchema.parse(params)).not.toThrow()
  })

  it("validates MainRecommendationResponseSchema", async () => {
    const { MainRecommendationResponseSchema } = await import(
      "../schemas/recommendation-schemas"
    )

    const response = {
      planName: "Plano Test",
      operadora: "Operadora Test",
      justification:
        "Esta é uma justificativa com mais de 50 caracteres para validar o schema corretamente.",
      keyBenefits: ["Benefício 1", "Benefício 2"],
      personalizedNote: "Nota personalizada"
    }

    const result = MainRecommendationResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
  })

  it("rejects invalid MainRecommendationResponse", async () => {
    const { MainRecommendationResponseSchema } = await import(
      "../schemas/recommendation-schemas"
    )

    const invalidResponse = {
      planName: "Test",
      justification: "curto", // Too short
      keyBenefits: ["only one"] // Should have at least 2
    }

    const result = MainRecommendationResponseSchema.safeParse(invalidResponse)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// PROFILE-SPECIFIC TESTS
// =============================================================================

describe("Profile-specific recommendations", () => {
  it("handles young single profile", async () => {
    const youngSingle: ClientInfo = {
      age: 25,
      city: "São Paulo",
      state: "SP",
      budget: 500,
      dependents: [],
      preExistingConditions: [],
      medications: []
    }

    const result = await generateNextSteps(youngSingle, "Plano Básico")

    // Should have minimal document requirements
    expect(result.requiredDocuments.length).toBeLessThan(5)
    expect(result.requiredDocuments.some(d => d.includes("dependentes"))).toBe(
      false
    )
  })

  it("handles family with children profile", async () => {
    const familyWithChildren: ClientInfo = {
      age: 40,
      dependents: [
        { relationship: "spouse", age: 38 },
        { relationship: "child", age: 10 },
        { relationship: "child", age: 5 }
      ],
      city: "Campinas",
      state: "SP",
      budget: 3000,
      preExistingConditions: [],
      medications: []
    }

    const result = await generateNextSteps(familyWithChildren, "Plano Família")

    // Should require dependent documents
    expect(result.requiredDocuments.some(d => d.includes("dependentes"))).toBe(
      true
    )
    expect(result.requiredDocuments.some(d => d.includes("certidão"))).toBe(
      true
    )
  })

  it("handles elderly profile", async () => {
    const elderly: ClientInfo = {
      age: 65,
      preExistingConditions: ["hipertensão", "artrose"],
      medications: ["losartana", "anti-inflamatório"],
      city: "Belo Horizonte",
      state: "MG",
      budget: 2500,
      dependents: []
    }

    const result = await generateNextSteps(elderly, "Plano Senior")

    // Should require health declaration
    expect(
      result.requiredDocuments.some(d => d.includes("Declaração de saúde"))
    ).toBe(true)
    expect(result.requiredDocuments.some(d => d.includes("Laudos"))).toBe(true)
  })
})

// =============================================================================
// EDGE CASES
// =============================================================================

describe("Edge cases", () => {
  it("handles empty ranked plans", () => {
    const result = generateComparisonTable([], {})
    expect(result.rows).toHaveLength(0)
  })

  it("handles single plan", () => {
    const result = generateComparisonTable([mockPlanAnalysis], {
      "plan-001": ["recomendado"]
    })
    expect(result.rows).toHaveLength(1)
  })

  it("handles plans without badges", () => {
    const result = generateComparisonTable(
      mockRankedAnalysis.rankedPlans,
      {} // No badges
    )
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].badge).toBe("#1")
  })

  it("handles undefined prices gracefully", () => {
    const result = generateComparisonTable(
      mockRankedAnalysis.rankedPlans,
      mockRankedAnalysis.badges,
      undefined // No prices
    )

    expect(result.rows.every(r => r.monthlyPrice === undefined)).toBe(true)
    expect(result.footnotes?.length).toBeGreaterThan(0)
  })
})
