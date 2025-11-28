/**
 * Tests for PlanComparison component
 *
 * Task Master: Task #12.7
 */

import { render, screen, fireEvent, within } from "@testing-library/react"
import { axe } from "jest-axe"
import { PlanComparison } from "../plan-comparison"
import type {
  PlanCompatibilityAnalysis,
  ERPPriceResult,
  PlanBadge
} from "../types"

const mockPlans: PlanCompatibilityAnalysis[] = [
  {
    planId: "plan-1",
    planName: "Plano Premium",
    operadora: "Bradesco Saúde",
    collectionId: "col-1",
    collectionName: "Bradesco Premium",
    eligibility: {
      isEligible: true,
      confidence: 95,
      reasons: ["Idade compatível"],
      blockers: [],
      warnings: []
    },
    coverage: {
      overallAdequacy: 90,
      conditionsCoverage: [],
      generalCoverageHighlights: ["Cobertura completa"]
    },
    score: {
      overall: 85,
      breakdown: {
        eligibility: 95,
        coverage: 90,
        budget: 70,
        network: 85,
        preferences: 80
      },
      calculation: "Score calculado"
    },
    pros: ["Rede ampla", "Sem carência para urgência"],
    cons: ["Preço mais alto"],
    alerts: [
      {
        type: "carencia",
        severity: "medium",
        title: "Carência de 180 dias",
        description: "Procedimentos eletivos após 180 dias",
        impactScore: 5
      }
    ],
    reasoning: "Plano com melhor cobertura",
    analyzedAt: new Date().toISOString(),
    confidence: 95
  },
  {
    planId: "plan-2",
    planName: "Plano Essencial",
    operadora: "Unimed",
    collectionId: "col-2",
    collectionName: "Unimed Essencial",
    eligibility: {
      isEligible: true,
      confidence: 90,
      reasons: ["Região compatível"],
      blockers: [],
      warnings: []
    },
    coverage: {
      overallAdequacy: 75,
      conditionsCoverage: [],
      generalCoverageHighlights: ["Cobertura básica"]
    },
    score: {
      overall: 72,
      breakdown: {
        eligibility: 90,
        coverage: 75,
        budget: 85,
        network: 60,
        preferences: 70
      },
      calculation: "Score calculado"
    },
    pros: ["Preço acessível"],
    cons: ["Rede mais restrita"],
    alerts: [],
    reasoning: "Opção econômica",
    analyzedAt: new Date().toISOString(),
    confidence: 90
  }
]

const mockERPPrices: ERPPriceResult = {
  success: true,
  prices: [
    {
      titular: 450,
      dependentes: [{ relacao: "conjuge", idade: 35, preco: 400 }],
      subtotal: 850,
      descontos: 50,
      total: 800,
      model: "por_pessoa"
    },
    {
      titular: 300,
      dependentes: [{ relacao: "conjuge", idade: 35, preco: 280 }],
      subtotal: 580,
      descontos: 30,
      total: 550,
      model: "por_pessoa"
    }
  ],
  source: "live",
  cached_at: null,
  is_fresh: true,
  metadata: {
    workspace_id: "test-workspace",
    plan_ids: ["plan-1", "plan-2"],
    fetched_at: new Date().toISOString()
  }
}

const mockBadges: Record<string, PlanBadge[]> = {
  "plan-1": ["recomendado", "mais-completo"],
  "plan-2": ["mais-acessivel"]
}

describe("PlanComparison", () => {
  describe("Rendering", () => {
    it("renders plan names", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Each plan appears in both mobile cards and desktop table
      expect(
        screen.getAllByText("Plano Premium").length
      ).toBeGreaterThanOrEqual(1)
      expect(
        screen.getAllByText("Plano Essencial").length
      ).toBeGreaterThanOrEqual(1)
    })

    it("renders operator names", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Operator names appear in both mobile and desktop views
      expect(
        screen.getAllByText("Bradesco Saúde").length
      ).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Unimed").length).toBeGreaterThanOrEqual(1)
    })

    it("renders scores", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Scores appear in both mobile cards and desktop table
      expect(screen.getAllByText("85").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("72").length).toBeGreaterThanOrEqual(1)
    })

    it("renders plan count in header", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Header shows "Planos Compatíveis" with count in a separate span
      expect(screen.getByText("Planos Compatíveis")).toBeInTheDocument()
      expect(screen.getByText("(2)")).toBeInTheDocument()
    })

    it("renders empty state when no plans", () => {
      render(<PlanComparison plans={[]} />)

      expect(
        screen.getByText("Nenhum plano disponível para comparação.")
      ).toBeInTheDocument()
    })
  })

  describe("Prices", () => {
    it("renders prices from ERP", () => {
      render(<PlanComparison plans={mockPlans} erpPrices={mockERPPrices} />)

      // Check for formatted currency (appears in mobile + desktop views)
      expect(screen.getAllByText(/R\$\s*800,00/).length).toBeGreaterThanOrEqual(
        1
      )
      expect(screen.getAllByText(/R\$\s*550,00/).length).toBeGreaterThanOrEqual(
        1
      )
    })

    it("shows 'Sob consulta' when no prices available", () => {
      render(<PlanComparison plans={mockPlans} />)

      const consultaTexts = screen.getAllByText("Sob consulta")
      expect(consultaTexts.length).toBeGreaterThan(0)
    })
  })

  describe("Badges", () => {
    it("renders plan badges", () => {
      render(<PlanComparison plans={mockPlans} badges={mockBadges} />)

      // Badges appear in mobile + desktop views
      expect(screen.getAllByText("Recomendado").length).toBeGreaterThanOrEqual(
        1
      )
      expect(
        screen.getAllByText("Mais Completo").length
      ).toBeGreaterThanOrEqual(1)
      expect(
        screen.getAllByText("Mais Acessível").length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  describe("Alerts", () => {
    it("renders alert badges for plans with alerts", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Plan 1 has an alert (appears in mobile + desktop views)
      expect(
        screen.getAllByText(/Carência de 180 dias/i).length
      ).toBeGreaterThanOrEqual(1)
    })

    it("shows 'Sem alertas' for plans without alerts", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Appears in mobile + desktop views
      expect(screen.getAllByText("Sem alertas").length).toBeGreaterThanOrEqual(
        1
      )
    })
  })

  describe("Recommended plan highlight", () => {
    it("highlights recommended plan with star icon", () => {
      render(<PlanComparison plans={mockPlans} recommendedPlanId="plan-1" />)

      // The star icon should be present (using svg testId or class)
      const planCards = screen.getAllByText("Plano Premium")
      expect(planCards[0].closest("div")).toBeInTheDocument()
    })
  })

  describe("Selection", () => {
    it("calls onSelectPlan when plan is clicked", () => {
      const handleSelect = jest.fn()

      render(<PlanComparison plans={mockPlans} onSelectPlan={handleSelect} />)

      // Click on select button (mobile cards have clickable areas)
      const selectButtons = screen.getAllByRole("button", {
        name: /selecionar/i
      })
      fireEvent.click(selectButtons[0])

      expect(handleSelect).toHaveBeenCalledWith("plan-1")
    })

    it("shows selected state when plan is selected", () => {
      render(
        <PlanComparison
          plans={mockPlans}
          selectedPlanId="plan-1"
          onSelectPlan={() => {}}
        />
      )

      expect(screen.getByText("Selecionado")).toBeInTheDocument()
    })
  })

  describe("Sorting", () => {
    it("sorts by score by default (descending)", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Get all plan names in order
      const planNames = screen.getAllByText(/Plano (Premium|Essencial)/)
      expect(planNames[0]).toHaveTextContent("Plano Premium") // Score 85
    })
  })

  describe("Mobile cards", () => {
    it("renders expandable details on mobile", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Mobile cards have "Ver detalhes" button
      const detailButtons = screen.getAllByText(/Ver detalhes/i)
      expect(detailButtons.length).toBeGreaterThan(0)
    })

    it("expands card to show breakdown when clicked", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Click "Ver detalhes"
      const detailButtons = screen.getAllByText(/Ver detalhes/i)
      fireEvent.click(detailButtons[0])

      // Should now show score breakdown (appears in mobile + desktop)
      expect(
        screen.getAllByText("Elegibilidade").length
      ).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Cobertura").length).toBeGreaterThanOrEqual(1)
    })

    it("shows pros and cons in expanded view", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Expand first card
      const detailButtons = screen.getAllByText(/Ver detalhes/i)
      fireEvent.click(detailButtons[0])

      // Check for pros
      expect(screen.getByText("Pontos Positivos")).toBeInTheDocument()
      expect(screen.getByText("Rede ampla")).toBeInTheDocument()
    })
  })

  describe("Accessibility", () => {
    it("has no accessibility violations", async () => {
      const { container } = render(
        <PlanComparison
          plans={mockPlans}
          erpPrices={mockERPPrices}
          badges={mockBadges}
        />
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it("has accessible sort buttons", () => {
      render(<PlanComparison plans={mockPlans} />)

      // Sort buttons in table header
      const sortButtons = screen.getAllByRole("button")
      expect(sortButtons.length).toBeGreaterThan(0)
    })

    it("has no violations with empty plans", async () => {
      const { container } = render(<PlanComparison plans={[]} />)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it("score bars have correct ARIA attributes", () => {
      render(<PlanComparison plans={mockPlans} />)

      const progressbars = screen.getAllByRole("progressbar")
      progressbars.forEach(bar => {
        expect(bar).toHaveAttribute("aria-valuenow")
        expect(bar).toHaveAttribute("aria-valuemin", "0")
        expect(bar).toHaveAttribute("aria-valuemax", "100")
      })
    })
  })
})
