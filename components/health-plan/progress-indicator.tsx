"use client"

/**
 * Progress Indicator
 *
 * Visual indicator for the 5-step Health Plan workflow.
 * Responsive design: horizontal on desktop, vertical on mobile.
 *
 * Task Master: Task #12.2
 */

import { cn } from "@/lib/utils"
import {
  User,
  Search,
  BarChart3,
  DollarSign,
  FileText,
  Check,
  Loader2
} from "lucide-react"
import type { HealthPlanStep } from "./health-plan-context"
import { STEP_CONFIGS } from "./types"

// =============================================================================
// TYPES
// =============================================================================

export interface ProgressIndicatorProps {
  currentStep: HealthPlanStep
  completedSteps: HealthPlanStep[]
  isLoading?: boolean
  className?: string
}

type StepStatus = "pending" | "in-progress" | "completed"

interface StepIconProps {
  step: HealthPlanStep
  status: StepStatus
  isLoading?: boolean
}

// =============================================================================
// STEP ICONS
// =============================================================================

const stepIcons: Record<
  HealthPlanStep,
  React.ComponentType<{ className?: string }>
> = {
  1: User,
  2: Search,
  3: BarChart3,
  4: DollarSign,
  5: FileText
}

function StepIcon({ step, status, isLoading }: StepIconProps) {
  const Icon = stepIcons[step]

  if (status === "completed") {
    return (
      <Check className="size-4 text-white" strokeWidth={3} aria-hidden="true" />
    )
  }

  if (status === "in-progress" && isLoading) {
    return (
      <Loader2
        className="text-primary size-4 animate-spin"
        aria-hidden="true"
      />
    )
  }

  return (
    <Icon
      className={cn(
        "size-4",
        status === "in-progress" ? "text-primary" : "text-muted-foreground"
      )}
      aria-hidden="true"
    />
  )
}

// =============================================================================
// STEP COMPONENT
// =============================================================================

interface StepItemProps {
  step: HealthPlanStep
  status: StepStatus
  isLoading?: boolean
  isLast?: boolean
}

function StepItem({ step, status, isLoading, isLast }: StepItemProps) {
  const config = STEP_CONFIGS[step - 1]

  return (
    <div
      className={cn(
        "flex items-center",
        // Horizontal layout for desktop
        "md:flex-row md:items-center",
        // Vertical layout for mobile
        "flex-col"
      )}
    >
      {/* Step Circle */}
      <div className="relative flex flex-col items-center md:flex-row">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-full border-2 transition-all duration-300",
            status === "completed" && "border-green-500 bg-green-500",
            status === "in-progress" && [
              "border-primary bg-primary/10",
              isLoading && "animate-pulse"
            ],
            status === "pending" && "border-muted-foreground/30 bg-muted"
          )}
          role="presentation"
        >
          <StepIcon step={step} status={status} isLoading={isLoading} />
        </div>

        {/* Step Label (visible on desktop) */}
        <div className="ml-3 hidden md:block">
          <p
            className={cn(
              "text-sm font-medium transition-colors",
              status === "completed" && "text-green-600 dark:text-green-400",
              status === "in-progress" && "text-primary",
              status === "pending" && "text-muted-foreground"
            )}
          >
            {config.shortTitle}
          </p>
        </div>

        {/* Step Label (visible on mobile, below circle) */}
        <p
          className={cn(
            "mt-2 text-center text-xs font-medium md:hidden",
            status === "completed" && "text-green-600 dark:text-green-400",
            status === "in-progress" && "text-primary",
            status === "pending" && "text-muted-foreground"
          )}
        >
          {config.shortTitle}
        </p>
      </div>

      {/* Connector Line (horizontal on desktop, vertical on mobile) */}
      {!isLast && (
        <>
          {/* Desktop horizontal line */}
          <div
            className={cn(
              "mx-4 hidden h-0.5 flex-1 transition-colors duration-300 md:block",
              status === "completed" ? "bg-green-500" : "bg-muted-foreground/20"
            )}
            aria-hidden="true"
          />
          {/* Mobile vertical line - hidden, vertical layout uses gap */}
        </>
      )}
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProgressIndicator({
  currentStep,
  completedSteps,
  isLoading = false,
  className
}: ProgressIndicatorProps) {
  const getStepStatus = (step: HealthPlanStep): StepStatus => {
    if (completedSteps.includes(step)) {
      return "completed"
    }
    if (step === currentStep) {
      return "in-progress"
    }
    return "pending"
  }

  const steps: HealthPlanStep[] = [1, 2, 3, 4, 5]
  const completedCount = completedSteps.length
  const progressPercent = (completedCount / 5) * 100

  return (
    <nav
      aria-label="Progresso do atendimento"
      className={cn("w-full", className)}
    >
      {/* Progress bar (mobile only) */}
      <div className="mb-4 md:hidden">
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={5}
            aria-label={`${completedCount} de 5 etapas completas`}
          />
        </div>
        <p className="text-muted-foreground mt-1 text-center text-xs">
          Etapa {currentStep} de 5
        </p>
      </div>

      {/* Steps container */}
      <ol
        className={cn(
          // Mobile: grid layout
          "grid grid-cols-5 gap-2",
          // Desktop: flex row
          "md:flex md:flex-row md:items-center md:justify-between md:gap-0"
        )}
      >
        {steps.map((step, index) => (
          <li
            key={step}
            className={cn(
              "flex flex-1",
              // Desktop: row with connectors
              "md:items-center",
              // Mobile: column centered
              "flex-col items-center"
            )}
          >
            <StepItem
              step={step}
              status={getStepStatus(step)}
              isLoading={isLoading && step === currentStep}
              isLast={index === steps.length - 1}
            />
          </li>
        ))}
      </ol>

      {/* Current step description (screen reader) */}
      <div className="sr-only" aria-live="polite">
        {isLoading
          ? `Processando etapa ${currentStep}: ${STEP_CONFIGS[currentStep - 1].title}`
          : `Etapa atual: ${currentStep} - ${STEP_CONFIGS[currentStep - 1].title}`}
      </div>
    </nav>
  )
}
