/**
 * Tests for ClientInfoCard component
 *
 * Task Master: Task #12.7
 */

import { render, screen, fireEvent } from "@testing-library/react"
import { axe } from "jest-axe"
import { ClientInfoCard } from "../client-info-card"
import type { PartialClientInfo } from "../types"

const mockFullClientInfo: PartialClientInfo = {
  age: 35,
  city: "São Paulo",
  state: "SP",
  budget: 1500,
  dependents: [
    { relationship: "spouse", age: 33 },
    { relationship: "child", age: 5 }
  ],
  preExistingConditions: ["Diabetes", "Hipertensão"],
  medications: ["Metformina", "Losartana"],
  preferences: {
    networkType: "broad",
    coParticipation: false,
    specificHospitals: ["Hospital Albert Einstein"]
  }
}

const mockPartialClientInfo: PartialClientInfo = {
  age: 35,
  city: "São Paulo",
  state: "SP"
}

describe("ClientInfoCard", () => {
  describe("Rendering with full info", () => {
    it("renders titular information correctly", () => {
      render(<ClientInfoCard clientInfo={mockFullClientInfo} />)

      expect(screen.getByText("35 anos")).toBeInTheDocument()
    })

    it("renders location correctly", () => {
      render(<ClientInfoCard clientInfo={mockFullClientInfo} />)

      expect(screen.getByText("São Paulo/SP")).toBeInTheDocument()
    })

    it("renders budget correctly formatted", () => {
      render(<ClientInfoCard clientInfo={mockFullClientInfo} />)

      expect(screen.getByText(/R\$\s*1\.500,00/)).toBeInTheDocument()
    })

    it("renders dependents with correct labels", () => {
      render(<ClientInfoCard clientInfo={mockFullClientInfo} />)

      expect(screen.getByText("Cônjuge, 33 anos")).toBeInTheDocument()
      expect(screen.getByText("Filho(a), 5 anos")).toBeInTheDocument()
    })

    it("renders pre-existing conditions as badges", () => {
      render(<ClientInfoCard clientInfo={mockFullClientInfo} />)

      expect(screen.getByText("Diabetes")).toBeInTheDocument()
      expect(screen.getByText("Hipertensão")).toBeInTheDocument()
    })

    it("renders medications as badges", () => {
      render(<ClientInfoCard clientInfo={mockFullClientInfo} />)

      expect(screen.getByText("Metformina")).toBeInTheDocument()
      expect(screen.getByText("Losartana")).toBeInTheDocument()
    })

    it("renders preferences correctly", () => {
      render(<ClientInfoCard clientInfo={mockFullClientInfo} />)

      expect(screen.getByText("Rede Ampla")).toBeInTheDocument()
      expect(screen.getByText("Sem Coparticipação")).toBeInTheDocument()
      expect(screen.getByText("Hospital Albert Einstein")).toBeInTheDocument()
    })
  })

  describe("Rendering with partial info", () => {
    it("shows placeholder text for missing dependents", () => {
      render(<ClientInfoCard clientInfo={mockPartialClientInfo} />)

      expect(screen.getByText("Nenhum dependente")).toBeInTheDocument()
    })

    it("shows placeholder for missing conditions", () => {
      render(<ClientInfoCard clientInfo={mockPartialClientInfo} />)

      expect(screen.getByText("Nenhuma informada")).toBeInTheDocument()
    })

    it("shows placeholder for missing medications", () => {
      render(<ClientInfoCard clientInfo={mockPartialClientInfo} />)

      expect(screen.getByText("Nenhum informado")).toBeInTheDocument()
    })

    it("shows placeholder for missing preferences", () => {
      render(<ClientInfoCard clientInfo={mockPartialClientInfo} />)

      expect(screen.getByText("Nenhuma preferência")).toBeInTheDocument()
    })
  })

  describe("Rendering with null info", () => {
    it("renders with null clientInfo showing skeletons", () => {
      render(<ClientInfoCard clientInfo={null} />)

      // Should still render the card structure
      expect(screen.getByText("Seu Perfil")).toBeInTheDocument()
    })
  })

  describe("Completeness percentage", () => {
    it("shows 100% for full info", () => {
      render(<ClientInfoCard clientInfo={mockFullClientInfo} />)

      expect(screen.getByText("100% completo")).toBeInTheDocument()
    })

    it("shows partial percentage for incomplete info", () => {
      render(<ClientInfoCard clientInfo={mockPartialClientInfo} />)

      // With age, city, state but no budget - should be less than 100%
      const badge = screen.getByText(/\d+% completo/)
      expect(badge).toBeInTheDocument()
    })

    it("shows 0% for null info", () => {
      render(<ClientInfoCard clientInfo={null} />)

      expect(screen.getByText("0% completo")).toBeInTheDocument()
    })
  })

  describe("Collapsible behavior", () => {
    it("renders expanded by default", () => {
      render(
        <ClientInfoCard
          clientInfo={mockFullClientInfo}
          onToggleCollapse={() => {}}
        />
      )

      // Content should be visible
      expect(screen.getByText("35 anos")).toBeInTheDocument()
    })

    it("calls onToggleCollapse when collapse button clicked", () => {
      const handleToggle = jest.fn()

      render(
        <ClientInfoCard
          clientInfo={mockFullClientInfo}
          isCollapsed={false}
          onToggleCollapse={handleToggle}
        />
      )

      const toggleButton = screen.getByRole("button", {
        name: /recolher perfil/i
      })
      fireEvent.click(toggleButton)

      expect(handleToggle).toHaveBeenCalled()
    })

    it("shows correct icon when collapsed", () => {
      render(
        <ClientInfoCard
          clientInfo={mockFullClientInfo}
          isCollapsed={true}
          onToggleCollapse={() => {}}
        />
      )

      expect(
        screen.getByRole("button", { name: /expandir perfil/i })
      ).toBeInTheDocument()
    })
  })

  describe("Field highlighting", () => {
    it("highlights specified fields", () => {
      const { container } = render(
        <ClientInfoCard
          clientInfo={mockFullClientInfo}
          highlightFields={["age"]}
        />
      )

      // The section with age should have highlight classes
      const sections = container.querySelectorAll(".ring-2")
      expect(sections.length).toBeGreaterThan(0)
    })
  })

  describe("Accessibility", () => {
    it("has no accessibility violations", async () => {
      const { container } = render(
        <ClientInfoCard clientInfo={mockFullClientInfo} />
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it("has accessible collapse button", () => {
      render(
        <ClientInfoCard
          clientInfo={mockFullClientInfo}
          onToggleCollapse={() => {}}
        />
      )

      const button = screen.getByRole("button", {
        name: /recolher perfil/i
      })
      expect(button).toBeInTheDocument()
    })

    it("has no violations when collapsed", async () => {
      const { container } = render(
        <ClientInfoCard
          clientInfo={mockFullClientInfo}
          isCollapsed={true}
          onToggleCollapse={() => {}}
        />
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
