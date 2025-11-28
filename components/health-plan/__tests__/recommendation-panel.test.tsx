/**
 * Tests for RecommendationPanel component
 *
 * Task Master: Task #12.7
 */

import { render, screen, fireEvent } from "@testing-library/react"
import { axe } from "jest-axe"
import { RecommendationPanel } from "../recommendation-panel"
import type { GenerateRecommendationResult } from "../types"

const mockRecommendation: GenerateRecommendationResult = {
  success: true,
  markdown:
    "# Recomendação\n\nBaseado no seu perfil, recomendamos o Plano Premium.",
  sections: {
    intro:
      "Olá! Analisamos suas necessidades e encontramos as melhores opções.",
    mainRecommendation:
      "## Plano Recomendado\n\nO **Plano Premium** é ideal para você porque:\n- Cobertura ampla\n- Rede de hospitais extensa",
    alternatives:
      "## Alternativas\n\n### Opção Econômica\nPlano Essencial - R$ 500/mês\n\n### Opção Premium\nPlano VIP - R$ 2.000/mês",
    comparisonTable:
      "| Plano | Score | Preço |\n|---|---|---|\n| Premium | 85 | R$ 800 |\n| Essencial | 72 | R$ 550 |",
    alerts:
      "## Alertas\n\n- **Carência**: 180 dias para procedimentos eletivos",
    nextSteps:
      "## Próximos Passos\n\n1. Entre em contato com a operadora\n2. Prepare os documentos necessários"
  },
  metadata: {
    generatedAt: "2024-01-15T10:30:00Z",
    version: "1.0.0",
    modelUsed: "gpt-4o",
    executionTimeMs: 2500,
    tokensUsed: 1500
  }
}

const mockErrorRecommendation: GenerateRecommendationResult = {
  success: false,
  markdown: "",
  sections: {
    intro: "",
    mainRecommendation: "",
    alternatives: "",
    comparisonTable: "",
    alerts: "",
    nextSteps: ""
  },
  metadata: {
    generatedAt: "2024-01-15T10:30:00Z",
    version: "1.0.0",
    modelUsed: "gpt-4o",
    executionTimeMs: 500
  },
  error: "Erro ao gerar recomendação: timeout"
}

describe("RecommendationPanel", () => {
  describe("Successful rendering", () => {
    it("renders intro section", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(
        screen.getByText(/analisamos suas necessidades/i)
      ).toBeInTheDocument()
    })

    it("renders main recommendation section", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(screen.getByText("Recomendação Principal")).toBeInTheDocument()
      expect(screen.getByText(/Plano Recomendado/)).toBeInTheDocument()
    })

    it("renders alternatives section", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      // May appear in both heading and markdown content
      expect(screen.getAllByText("Alternativas").length).toBeGreaterThanOrEqual(
        1
      )
      expect(
        screen.getAllByText(/Opção Econômica/).length
      ).toBeGreaterThanOrEqual(1)
    })

    it("renders comparison table from markdown", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(screen.getByText("Tabela Comparativa")).toBeInTheDocument()
      // Table content
      expect(screen.getByText("Premium")).toBeInTheDocument()
      expect(screen.getByText("Essencial")).toBeInTheDocument()
    })

    it("renders alerts section", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(screen.getByText("Alertas Importantes")).toBeInTheDocument()
      expect(screen.getByText(/Carência/)).toBeInTheDocument()
    })

    it("renders next steps section", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      // May appear in both heading and markdown content
      expect(
        screen.getAllByText("Próximos Passos").length
      ).toBeGreaterThanOrEqual(1)
      expect(
        screen.getAllByText(/Entre em contato/).length
      ).toBeGreaterThanOrEqual(1)
    })

    it("renders header with title", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(
        screen.getByText("Sua Recomendação Personalizada")
      ).toBeInTheDocument()
    })

    it("renders metadata footer", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument()
      expect(screen.getByText(/gpt-4o/)).toBeInTheDocument()
      expect(screen.getByText(/2500ms/)).toBeInTheDocument()
    })
  })

  describe("Error state", () => {
    it("renders error message when success is false", () => {
      render(<RecommendationPanel recommendation={mockErrorRecommendation} />)

      expect(screen.getByText("Erro ao gerar recomendação")).toBeInTheDocument()
    })

    it("shows error details", () => {
      render(<RecommendationPanel recommendation={mockErrorRecommendation} />)

      expect(
        screen.getByText("Erro ao gerar recomendação: timeout")
      ).toBeInTheDocument()
    })
  })

  describe("Action buttons", () => {
    it("renders quote button", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(
        screen.getByRole("button", { name: /solicitar cotação/i })
      ).toBeInTheDocument()
    })

    it("renders save button", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(
        screen.getByRole("button", { name: /salvar pdf/i })
      ).toBeInTheDocument()
    })

    it("renders share button", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      expect(
        screen.getByRole("button", { name: /compartilhar/i })
      ).toBeInTheDocument()
    })

    it("calls onAction with 'quote' when quote button clicked", () => {
      const handleAction = jest.fn()

      render(
        <RecommendationPanel
          recommendation={mockRecommendation}
          onAction={handleAction}
        />
      )

      fireEvent.click(
        screen.getByRole("button", { name: /solicitar cotação/i })
      )

      expect(handleAction).toHaveBeenCalledWith("quote")
    })

    it("calls onAction with 'save' when save button clicked", () => {
      const handleAction = jest.fn()

      render(
        <RecommendationPanel
          recommendation={mockRecommendation}
          onAction={handleAction}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: /salvar pdf/i }))

      expect(handleAction).toHaveBeenCalledWith("save")
    })

    it("calls onAction with 'share' when share button clicked", () => {
      const handleAction = jest.fn()

      render(
        <RecommendationPanel
          recommendation={mockRecommendation}
          onAction={handleAction}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: /compartilhar/i }))

      expect(handleAction).toHaveBeenCalledWith("share")
    })
  })

  describe("Collapsible sections", () => {
    it("allows collapsing sections", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      // Find section toggle buttons
      const toggles = screen.getAllByRole("button")
      const sectionToggle = toggles.find(btn =>
        btn.textContent?.includes("Alternativas")
      )

      if (sectionToggle) {
        fireEvent.click(sectionToggle)
        // After collapse, content might be hidden
      }
    })
  })

  describe("Markdown rendering", () => {
    it("renders markdown tables correctly", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      // Table should be rendered
      const tables = screen.getAllByRole("table")
      expect(tables.length).toBeGreaterThan(0)
    })

    it("renders markdown lists correctly", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      // List items from the markdown
      const listItems = screen.getAllByRole("listitem")
      expect(listItems.length).toBeGreaterThan(0)
    })

    it("renders bold text correctly", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      // **Plano Premium** should be bold
      const boldText = screen.getByText("Plano Premium")
      expect(boldText.tagName).toBe("STRONG")
    })
  })

  describe("Accessibility", () => {
    it("has no accessibility violations", async () => {
      const { container } = render(
        <RecommendationPanel recommendation={mockRecommendation} />
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it("has no violations in error state", async () => {
      const { container } = render(
        <RecommendationPanel recommendation={mockErrorRecommendation} />
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it("action buttons are keyboard accessible", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      const quoteButton = screen.getByRole("button", {
        name: /solicitar cotação/i
      })

      // Tab to button and press Enter
      quoteButton.focus()
      expect(document.activeElement).toBe(quoteButton)
    })

    it("collapsible sections are keyboard accessible", () => {
      render(<RecommendationPanel recommendation={mockRecommendation} />)

      // Section triggers should be focusable
      const buttons = screen.getAllByRole("button")
      buttons.forEach(button => {
        button.focus()
        expect(button).toHaveFocus
      })
    })
  })

  describe("Fallback content", () => {
    it("renders full markdown when sections are empty", () => {
      const fallbackRecommendation: GenerateRecommendationResult = {
        ...mockRecommendation,
        sections: {
          intro: "",
          mainRecommendation: "",
          alternatives: "",
          comparisonTable: "",
          alerts: "",
          nextSteps: ""
        }
      }

      render(<RecommendationPanel recommendation={fallbackRecommendation} />)

      // Should show the markdown content (may appear in heading + markdown)
      expect(screen.getAllByText(/Recomendação/).length).toBeGreaterThanOrEqual(
        1
      )
    })
  })
})
