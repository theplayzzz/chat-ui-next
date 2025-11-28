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
  onAction
}: HealthPlanChatInnerProps) {
  const {
    state,
    setStep,
    completeStep,
    setLoading,
    setError,
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
   * Process a tool result from the orchestrator
   */
  const processToolResult = useCallback(
    (result: ToolResult) => {
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
          setLoading(false)
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

  // Expose processToolResult to parent via ref or callback
  // For now, we expose it via a data attribute
  useEffect(() => {
    if (containerRef.current) {
      ;(containerRef.current as any).__processToolResult = processToolResult
    }
  }, [processToolResult])

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
 * Hook to get the processToolResult function from a HealthPlanChat component
 */
export function useHealthPlanChatRef(
  ref: React.RefObject<HTMLDivElement>
): ((result: ToolResult) => void) | null {
  if (!ref.current) return null
  return (ref.current as any).__processToolResult || null
}

export { HealthPlanProvider, useHealthPlan }
