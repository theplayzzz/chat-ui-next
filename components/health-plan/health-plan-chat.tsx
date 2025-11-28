"use client"

/**
 * Health Plan Chat
 *
 * Main wrapper component for the Health Plan Agent workflow.
 * Orchestrates the 5-step process with visual feedback.
 *
 * Task Master: Task #12.1
 */

import { useEffect, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  HealthPlanProvider,
  useHealthPlan,
  type HealthPlanStep
} from "./health-plan-context"
import { ProgressIndicator } from "./progress-indicator"
import { ClientInfoCard } from "./client-info-card"
import { PlanComparison } from "./plan-comparison"
import { RecommendationPanel } from "./recommendation-panel"
import type {
  PartialClientInfo,
  SearchHealthPlansResponse,
  RankedAnalysis,
  ERPPriceResult,
  GenerateRecommendationResult
} from "./types"

// =============================================================================
// TYPES
// =============================================================================

export interface HealthPlanChatProps {
  className?: string
  initialClientInfo?: PartialClientInfo
  onStepChange?: (step: HealthPlanStep) => void
  onComplete?: (recommendation: GenerateRecommendationResult) => void
  onError?: (error: string) => void
  onSelectPlan?: (planId: string) => void
  onAction?: (action: "quote" | "save" | "share") => void
  onEditClientInfo?: () => void
}

/**
 * Tool result from the orchestrator
 */
export interface ToolResult {
  step: HealthPlanStep
  type:
    | "clientInfo"
    | "searchResults"
    | "compatibilityAnalysis"
    | "erpPrices"
    | "recommendation"
  data: unknown
}

// =============================================================================
// INNER COMPONENT
// =============================================================================

interface HealthPlanChatInnerProps extends HealthPlanChatProps {}

function HealthPlanChatInner({
  className,
  onStepChange,
  onComplete,
  onError,
  onSelectPlan,
  onAction,
  onEditClientInfo
}: HealthPlanChatInnerProps) {
  const {
    state,
    setStep,
    completeStep,
    setLoading,
    setError,
    resetToStep,
    setClientInfo,
    setSearchResults,
    setCompatibilityAnalysis,
    setERPPrices,
    setRecommendation,
    toggleClientInfoCollapsed,
    setSelectedPlan
  } = useHealthPlan()

  const containerRef = useRef<HTMLDivElement>(null)

  // Notify parent of step changes
  useEffect(() => {
    onStepChange?.(state.currentStep)
  }, [state.currentStep, onStepChange])

  // Notify parent of errors
  useEffect(() => {
    if (state.error) {
      onError?.(state.error)
    }
  }, [state.error, onError])

  // Notify parent of completion
  useEffect(() => {
    if (state.recommendation) {
      onComplete?.(state.recommendation)
    }
  }, [state.recommendation, onComplete])

  /**
   * Start processing a step (sets loading state)
   */
  const startStepProcessing = useCallback(
    (step: HealthPlanStep) => {
      setStep(step)
      setLoading(true)
      setError(null)
    },
    [setStep, setLoading, setError]
  )

  /**
   * Process a tool result from the orchestrator
   */
  const processToolResult = useCallback(
    (result: ToolResult) => {
      setLoading(false)

      switch (result.type) {
        case "clientInfo":
          setClientInfo(result.data as PartialClientInfo)
          completeStep(1)
          if (result.step === 1) {
            setStep(2)
          }
          break

        case "searchResults":
          setSearchResults(result.data as SearchHealthPlansResponse)
          completeStep(2)
          setStep(3)
          break

        case "compatibilityAnalysis":
          setCompatibilityAnalysis(result.data as RankedAnalysis)
          completeStep(3)
          setStep(4)
          break

        case "erpPrices":
          setERPPrices(result.data as ERPPriceResult)
          completeStep(4)
          setStep(5)
          break

        case "recommendation":
          setRecommendation(result.data as GenerateRecommendationResult)
          completeStep(5)
          break
      }
    },
    [
      setClientInfo,
      setSearchResults,
      setCompatibilityAnalysis,
      setERPPrices,
      setRecommendation,
      completeStep,
      setStep,
      setLoading
    ]
  )

  /**
   * Handle plan selection
   */
  const handleSelectPlan = useCallback(
    (planId: string) => {
      setSelectedPlan(planId)
      onSelectPlan?.(planId)
    },
    [setSelectedPlan, onSelectPlan]
  )

  /**
   * Handle action buttons
   */
  const handleAction = useCallback(
    (action: "quote" | "save" | "share") => {
      onAction?.(action)
    },
    [onAction]
  )

  /**
   * Go back to a previous step (clears data from that step onwards)
   */
  const goToStep = useCallback(
    (step: HealthPlanStep) => {
      if (step < state.currentStep) {
        // Going back - reset and clear data
        resetToStep(step)
      } else if (step > state.currentStep) {
        // Going forward - only if allowed
        setStep(step)
        setLoading(true)
      }
    },
    [state.currentStep, resetToStep, setStep, setLoading]
  )

  // Expose functions to parent via ref or callback
  useEffect(() => {
    if (containerRef.current) {
      ;(containerRef.current as any).__processToolResult = processToolResult
      ;(containerRef.current as any).__startStepProcessing = startStepProcessing
      ;(containerRef.current as any).__goToStep = goToStep
      ;(containerRef.current as any).__resetToStep = resetToStep
    }
  }, [processToolResult, startStepProcessing, goToStep, resetToStep])

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col gap-4 transition-colors", className)}
      data-health-plan-chat
    >
      {/* Progress Indicator */}
      <ProgressIndicator
        currentStep={state.currentStep}
        completedSteps={state.completedSteps}
        isLoading={state.isLoading}
        className="mb-2"
      />

      {/* Error Display */}
      {state.error && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive border-destructive/20 rounded-lg border p-4"
        >
          <p className="text-sm font-medium">{state.error}</p>
        </div>
      )}

      {/* Client Info Card - Always visible after step 1 starts */}
      {(state.currentStep >= 1 || state.clientInfo) && (
        <ClientInfoCard
          clientInfo={state.clientInfo}
          isCollapsed={state.isClientInfoCollapsed}
          onToggleCollapse={toggleClientInfoCollapsed}
          onEdit={onEditClientInfo}
          className={cn(state.currentStep > 1 && "opacity-90")}
        />
      )}

      {/* Plan Comparison - Visible after analysis */}
      {state.compatibilityAnalysis && (
        <PlanComparison
          plans={state.compatibilityAnalysis.rankedPlans}
          erpPrices={state.erpPrices || undefined}
          badges={state.compatibilityAnalysis.badges}
          recommendedPlanId={
            state.compatibilityAnalysis.recommended.main.planId
          }
          selectedPlanId={state.selectedPlanId || undefined}
          onSelectPlan={handleSelectPlan}
          className={cn(state.currentStep < 5 && "opacity-90")}
        />
      )}

      {/* Recommendation Panel - Final step */}
      {state.recommendation && (
        <RecommendationPanel
          recommendation={state.recommendation}
          onAction={handleAction}
        />
      )}

      {/* Loading indicator for current step */}
      {state.isLoading && !state.error && (
        <div
          className="flex items-center justify-center py-8"
          role="status"
          aria-label="Carregando"
        >
          <div className="border-primary size-8 animate-spin rounded-full border-4 border-t-transparent" />
          <span className="text-muted-foreground ml-3 text-sm">
            Processando...
          </span>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function HealthPlanChat({
  initialClientInfo,
  ...props
}: HealthPlanChatProps) {
  return (
    <HealthPlanProvider initialClientInfo={initialClientInfo}>
      <HealthPlanChatInner {...props} initialClientInfo={initialClientInfo} />
    </HealthPlanProvider>
  )
}

// =============================================================================
// UTILITY HOOK
// =============================================================================

/**
 * Functions exposed by HealthPlanChat for orchestrator integration
 */
export interface HealthPlanChatHandlers {
  /** Process a completed tool result and advance workflow */
  processToolResult: (result: ToolResult) => void
  /** Start processing a step (activates loading state) */
  startStepProcessing: (step: HealthPlanStep) => void
  /** Navigate to a step (going back clears data from that step onwards) */
  goToStep: (step: HealthPlanStep) => void
  /** Reset workflow to a specific step, clearing subsequent data */
  resetToStep: (step: HealthPlanStep) => void
}

/**
 * Hook to get the handler functions from a HealthPlanChat component
 */
export function useHealthPlanChatRef(
  ref: React.RefObject<HTMLDivElement>
): HealthPlanChatHandlers | null {
  if (!ref.current) return null
  const processToolResult = (ref.current as any).__processToolResult
  const startStepProcessing = (ref.current as any).__startStepProcessing
  const goToStep = (ref.current as any).__goToStep
  const resetToStep = (ref.current as any).__resetToStep
  if (!processToolResult || !startStepProcessing || !goToStep || !resetToStep) {
    return null
  }
  return { processToolResult, startStepProcessing, goToStep, resetToStep }
}

export { HealthPlanProvider, useHealthPlan }
