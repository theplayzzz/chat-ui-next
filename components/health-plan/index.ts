/**
 * Health Plan Components
 *
 * Specialized React components for the Health Plan Agent workflow.
 *
 * Task Master: Task #12
 */

// Main components
export {
  HealthPlanChat,
  HealthPlanProvider,
  useHealthPlan
} from "./health-plan-chat"
export type { HealthPlanChatProps, ToolResult } from "./health-plan-chat"

// Context
export {
  useHealthPlanOptional,
  type HealthPlanState,
  type HealthPlanStep,
  type PlanFilter
} from "./health-plan-context"

// Progress Indicator
export { ProgressIndicator } from "./progress-indicator"
export type { ProgressIndicatorProps } from "./progress-indicator"

// Client Info Card
export { ClientInfoCard } from "./client-info-card"
export type { ClientInfoCardProps } from "./client-info-card"

// Plan Comparison
export { PlanComparison } from "./plan-comparison"
export type { PlanComparisonProps } from "./plan-comparison"

// Recommendation Panel
export { RecommendationPanel } from "./recommendation-panel"
export type { RecommendationPanelProps } from "./recommendation-panel"

// Types
export * from "./types"
