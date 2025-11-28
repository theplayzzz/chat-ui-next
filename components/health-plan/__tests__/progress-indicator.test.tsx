/**
 * Tests for ProgressIndicator component
 *
 * Task Master: Task #12.7
 */

import { render, screen } from "@testing-library/react"
import { axe } from "jest-axe"
import { ProgressIndicator } from "../progress-indicator"
import type { HealthPlanStep } from "../health-plan-context"

describe("ProgressIndicator", () => {
  describe("Rendering", () => {
    it("renders all 5 steps", () => {
      render(<ProgressIndicator currentStep={1} completedSteps={[]} />)

      // Each step appears twice (mobile + desktop view)
      expect(screen.getAllByText("Coleta").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Busca").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Análise").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Preços").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Recom.").length).toBeGreaterThanOrEqual(1)
    })

    it("renders current step with in-progress state", () => {
      render(<ProgressIndicator currentStep={2} completedSteps={[1]} />)

      // Step 1 should be completed (check icon visible)
      const step1Label = screen.getAllByText("Coleta")[0]
      expect(step1Label).toHaveClass("text-green-600")
    })

    it("renders completed steps with check icons", () => {
      render(<ProgressIndicator currentStep={3} completedSteps={[1, 2]} />)

      // Check that completed step labels have green color
      const step1Labels = screen.getAllByText("Coleta")
      const step2Labels = screen.getAllByText("Busca")

      expect(step1Labels[0]).toHaveClass("text-green-600")
      expect(step2Labels[0]).toHaveClass("text-green-600")
    })

    it("renders loading state with spinning indicator", () => {
      render(
        <ProgressIndicator
          currentStep={2}
          completedSteps={[1]}
          isLoading={true}
        />
      )

      // Should have sr-only text about processing
      expect(screen.getByText(/Processando etapa 2/i)).toBeInTheDocument()
    })

    it("shows progress percentage text on mobile", () => {
      render(<ProgressIndicator currentStep={3} completedSteps={[1, 2]} />)

      expect(screen.getByText("Etapa 3 de 5")).toBeInTheDocument()
    })
  })

  describe("Step status transitions", () => {
    it("marks step 1 as pending initially", () => {
      render(<ProgressIndicator currentStep={1} completedSteps={[]} />)

      // First step should be in-progress, others pending
      const step2Label = screen.getAllByText("Busca")[0]
      expect(step2Label).toHaveClass("text-muted-foreground")
    })

    it("transitions step from pending to in-progress", () => {
      const { rerender } = render(
        <ProgressIndicator currentStep={1} completedSteps={[]} />
      )

      rerender(<ProgressIndicator currentStep={2} completedSteps={[1]} />)

      const step2Label = screen.getAllByText("Busca")[0]
      expect(step2Label).toHaveClass("text-primary")
    })

    it("transitions step from in-progress to completed", () => {
      const { rerender } = render(
        <ProgressIndicator currentStep={2} completedSteps={[1]} />
      )

      rerender(<ProgressIndicator currentStep={3} completedSteps={[1, 2]} />)

      const step2Label = screen.getAllByText("Busca")[0]
      expect(step2Label).toHaveClass("text-green-600")
    })
  })

  describe("Accessibility", () => {
    it("has no accessibility violations", async () => {
      const { container } = render(
        <ProgressIndicator currentStep={2} completedSteps={[1]} />
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it("has navigation landmark", () => {
      render(<ProgressIndicator currentStep={1} completedSteps={[]} />)

      expect(
        screen.getByRole("navigation", { name: /progresso/i })
      ).toBeInTheDocument()
    })

    it("has progressbar with correct values", () => {
      render(<ProgressIndicator currentStep={3} completedSteps={[1, 2]} />)

      const progressbar = screen.getByRole("progressbar")
      expect(progressbar).toHaveAttribute("aria-valuenow", "2")
      expect(progressbar).toHaveAttribute("aria-valuemin", "0")
      expect(progressbar).toHaveAttribute("aria-valuemax", "5")
    })

    it("announces current step to screen readers", () => {
      render(<ProgressIndicator currentStep={2} completedSteps={[1]} />)

      const srText = screen.getByText(/Etapa atual: 2/i)
      expect(srText).toHaveClass("sr-only")
    })
  })

  describe("All steps completion", () => {
    it("marks all steps as completed when workflow is done", () => {
      render(
        <ProgressIndicator currentStep={5} completedSteps={[1, 2, 3, 4, 5]} />
      )

      // All labels should be green
      const labels = [
        screen.getAllByText("Coleta")[0],
        screen.getAllByText("Busca")[0],
        screen.getAllByText("Análise")[0],
        screen.getAllByText("Preços")[0],
        screen.getAllByText("Recom.")[0]
      ]

      labels.forEach(label => {
        expect(label).toHaveClass("text-green-600")
      })
    })
  })
})
