/**
 * Types re-export for Health Plan UI components
 *
 * Centralizes all types needed by the UI layer
 * from the health-plan tool implementations.
 *
 * Task Master: Task #12.1
 */

// Client Info types
export type {
  ClientInfo,
  PartialClientInfo,
  Dependent,
  DependentRelationship,
  Preferences,
  NetworkType
} from "@/lib/tools/health-plan/schemas/client-info-schema"

export {
  FIELD_LABELS,
  REQUIRED_FIELDS,
  isClientInfoComplete,
  calculateCompleteness
} from "@/lib/tools/health-plan/schemas/client-info-schema"

// Search types
export type {
  SearchHealthPlansResponse,
  HealthPlanSearchResult
} from "@/lib/tools/health-plan/types"

// Compatibility analysis types
export type {
  RankedAnalysis,
  PlanCompatibilityAnalysis,
  CompatibilityScore,
  EligibilityAnalysis,
  CoverageEvaluation,
  ExclusionAlert,
  AlertSeverity,
  AlertType,
  CategorizedAlert,
  AlertUrgency,
  PlanBadge,
  ExecutiveSummary
} from "@/lib/tools/health-plan/analyze-compatibility"

// ERP types
export type {
  ERPPriceResult,
  PriceBreakdown,
  PriceSource
} from "@/lib/tools/health-plan/types"

// Recommendation types
export type {
  GenerateRecommendationResult,
  MainRecommendationResponse,
  AlternativesResponse,
  AlertsFormattedResponse,
  NextStepsResponse,
  IntroResponse
} from "@/lib/tools/health-plan/schemas/recommendation-schemas"

// Orchestrator types
export type { WorkflowStep } from "@/lib/tools/health-plan/session-manager"

/**
 * Step configuration for UI components
 */
export interface StepConfig {
  step: 1 | 2 | 3 | 4 | 5
  title: string
  shortTitle: string
  description: string
  icon: string
}

/**
 * Step configurations
 */
export const STEP_CONFIGS: StepConfig[] = [
  {
    step: 1,
    title: "Coleta de Informações",
    shortTitle: "Coleta",
    description: "Entendendo seu perfil",
    icon: "User"
  },
  {
    step: 2,
    title: "Busca de Planos",
    shortTitle: "Busca",
    description: "Procurando planos compatíveis",
    icon: "Search"
  },
  {
    step: 3,
    title: "Análise de Compatibilidade",
    shortTitle: "Análise",
    description: "Avaliando cada plano",
    icon: "BarChart"
  },
  {
    step: 4,
    title: "Consulta de Preços",
    shortTitle: "Preços",
    description: "Buscando valores atualizados",
    icon: "DollarSign"
  },
  {
    step: 5,
    title: "Recomendação Final",
    shortTitle: "Recom.",
    description: "Preparando sua recomendação",
    icon: "FileText"
  }
]

/**
 * Get step config by step number
 */
export function getStepConfig(step: 1 | 2 | 3 | 4 | 5): StepConfig {
  return STEP_CONFIGS[step - 1]
}
