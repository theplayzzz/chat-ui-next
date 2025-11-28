"use client"

/**
 * Health Plan Context
 *
 * Manages state for the Health Plan Agent workflow.
 * Provides isolated state management separate from ChatbotUIContext.
 *
 * Task Master: Task #12.1
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
  useMemo
} from "react"
import type {
  PartialClientInfo,
  SearchHealthPlansResponse,
  RankedAnalysis,
  ERPPriceResult,
  GenerateRecommendationResult
} from "./types"

// =============================================================================
// STATE
// =============================================================================

export type HealthPlanStep = 1 | 2 | 3 | 4 | 5

export interface HealthPlanState {
  // Workflow state
  currentStep: HealthPlanStep
  completedSteps: HealthPlanStep[]
  isLoading: boolean
  error: string | null

  // Step data
  clientInfo: PartialClientInfo | null
  searchResults: SearchHealthPlansResponse | null
  compatibilityAnalysis: RankedAnalysis | null
  erpPrices: ERPPriceResult | null
  recommendation: GenerateRecommendationResult | null

  // UI state
  isClientInfoCollapsed: boolean
  selectedPlanId: string | null
  activeFilter: PlanFilter
}

export interface PlanFilter {
  operadora?: string
  minScore?: number
  maxPrice?: number
}

const initialState: HealthPlanState = {
  currentStep: 1,
  completedSteps: [],
  isLoading: false,
  error: null,
  clientInfo: null,
  searchResults: null,
  compatibilityAnalysis: null,
  erpPrices: null,
  recommendation: null,
  isClientInfoCollapsed: false,
  selectedPlanId: null,
  activeFilter: {}
}

// =============================================================================
// ACTIONS
// =============================================================================

type HealthPlanAction =
  | { type: "SET_STEP"; payload: HealthPlanStep }
  | { type: "COMPLETE_STEP"; payload: HealthPlanStep }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_CLIENT_INFO"; payload: PartialClientInfo }
  | { type: "UPDATE_CLIENT_INFO"; payload: Partial<PartialClientInfo> }
  | { type: "SET_SEARCH_RESULTS"; payload: SearchHealthPlansResponse }
  | { type: "SET_COMPATIBILITY_ANALYSIS"; payload: RankedAnalysis }
  | { type: "SET_ERP_PRICES"; payload: ERPPriceResult }
  | { type: "SET_RECOMMENDATION"; payload: GenerateRecommendationResult }
  | { type: "TOGGLE_CLIENT_INFO_COLLAPSED" }
  | { type: "SET_SELECTED_PLAN"; payload: string | null }
  | { type: "SET_FILTER"; payload: PlanFilter }
  | { type: "RESET" }
  | { type: "RESET_TO_STEP"; payload: HealthPlanStep }

function healthPlanReducer(
  state: HealthPlanState,
  action: HealthPlanAction
): HealthPlanState {
  switch (action.type) {
    case "SET_STEP":
      return {
        ...state,
        currentStep: action.payload,
        error: null
      }

    case "COMPLETE_STEP":
      if (state.completedSteps.includes(action.payload)) {
        return state
      }
      return {
        ...state,
        completedSteps: [...state.completedSteps, action.payload].sort(
          (a, b) => a - b
        )
      }

    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.payload
      }

    case "SET_ERROR":
      return {
        ...state,
        error: action.payload,
        isLoading: false
      }

    case "SET_CLIENT_INFO":
      return {
        ...state,
        clientInfo: action.payload
      }

    case "UPDATE_CLIENT_INFO":
      return {
        ...state,
        clientInfo: {
          ...state.clientInfo,
          ...action.payload
        }
      }

    case "SET_SEARCH_RESULTS":
      return {
        ...state,
        searchResults: action.payload
      }

    case "SET_COMPATIBILITY_ANALYSIS":
      return {
        ...state,
        compatibilityAnalysis: action.payload
      }

    case "SET_ERP_PRICES":
      return {
        ...state,
        erpPrices: action.payload
      }

    case "SET_RECOMMENDATION":
      return {
        ...state,
        recommendation: action.payload
      }

    case "TOGGLE_CLIENT_INFO_COLLAPSED":
      return {
        ...state,
        isClientInfoCollapsed: !state.isClientInfoCollapsed
      }

    case "SET_SELECTED_PLAN":
      return {
        ...state,
        selectedPlanId: action.payload
      }

    case "SET_FILTER":
      return {
        ...state,
        activeFilter: action.payload
      }

    case "RESET":
      return initialState

    case "RESET_TO_STEP": {
      const targetStep = action.payload
      // Keep completed steps before target, clear the rest
      const newCompletedSteps = state.completedSteps.filter(s => s < targetStep)

      // Clear data from target step onwards
      const newState: HealthPlanState = {
        ...state,
        currentStep: targetStep,
        completedSteps: newCompletedSteps,
        isLoading: false,
        error: null,
        selectedPlanId: null
      }

      // Clear step-specific data based on target
      if (targetStep <= 1) {
        newState.clientInfo = null
      }
      if (targetStep <= 2) {
        newState.searchResults = null
      }
      if (targetStep <= 3) {
        newState.compatibilityAnalysis = null
      }
      if (targetStep <= 4) {
        newState.erpPrices = null
      }
      if (targetStep <= 5) {
        newState.recommendation = null
      }

      return newState
    }

    default:
      return state
  }
}

// =============================================================================
// CONTEXT
// =============================================================================

interface HealthPlanContextValue {
  state: HealthPlanState

  // Workflow actions
  setStep: (step: HealthPlanStep) => void
  completeStep: (step: HealthPlanStep) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
  resetToStep: (step: HealthPlanStep) => void

  // Data actions
  setClientInfo: (info: PartialClientInfo) => void
  updateClientInfo: (info: Partial<PartialClientInfo>) => void
  setSearchResults: (results: SearchHealthPlansResponse) => void
  setCompatibilityAnalysis: (analysis: RankedAnalysis) => void
  setERPPrices: (prices: ERPPriceResult) => void
  setRecommendation: (recommendation: GenerateRecommendationResult) => void

  // UI actions
  toggleClientInfoCollapsed: () => void
  setSelectedPlan: (planId: string | null) => void
  setFilter: (filter: PlanFilter) => void

  // Derived state
  isStepComplete: (step: HealthPlanStep) => boolean
  canProceedToStep: (step: HealthPlanStep) => boolean
  getStepStatus: (
    step: HealthPlanStep
  ) => "pending" | "in-progress" | "completed"
}

const HealthPlanContext = createContext<HealthPlanContextValue | null>(null)

// =============================================================================
// PROVIDER
// =============================================================================

interface HealthPlanProviderProps {
  children: ReactNode
  initialClientInfo?: PartialClientInfo
}

export function HealthPlanProvider({
  children,
  initialClientInfo
}: HealthPlanProviderProps) {
  const [state, dispatch] = useReducer(healthPlanReducer, {
    ...initialState,
    clientInfo: initialClientInfo || null
  })

  // Workflow actions
  const setStep = useCallback((step: HealthPlanStep) => {
    dispatch({ type: "SET_STEP", payload: step })
  }, [])

  const completeStep = useCallback((step: HealthPlanStep) => {
    dispatch({ type: "COMPLETE_STEP", payload: step })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: "SET_LOADING", payload: loading })
  }, [])

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "SET_ERROR", payload: error })
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: "RESET" })
  }, [])

  const resetToStep = useCallback((step: HealthPlanStep) => {
    dispatch({ type: "RESET_TO_STEP", payload: step })
  }, [])

  // Data actions
  const setClientInfo = useCallback((info: PartialClientInfo) => {
    dispatch({ type: "SET_CLIENT_INFO", payload: info })
  }, [])

  const updateClientInfo = useCallback((info: Partial<PartialClientInfo>) => {
    dispatch({ type: "UPDATE_CLIENT_INFO", payload: info })
  }, [])

  const setSearchResults = useCallback((results: SearchHealthPlansResponse) => {
    dispatch({ type: "SET_SEARCH_RESULTS", payload: results })
  }, [])

  const setCompatibilityAnalysis = useCallback((analysis: RankedAnalysis) => {
    dispatch({ type: "SET_COMPATIBILITY_ANALYSIS", payload: analysis })
  }, [])

  const setERPPrices = useCallback((prices: ERPPriceResult) => {
    dispatch({ type: "SET_ERP_PRICES", payload: prices })
  }, [])

  const setRecommendation = useCallback(
    (recommendation: GenerateRecommendationResult) => {
      dispatch({ type: "SET_RECOMMENDATION", payload: recommendation })
    },
    []
  )

  // UI actions
  const toggleClientInfoCollapsed = useCallback(() => {
    dispatch({ type: "TOGGLE_CLIENT_INFO_COLLAPSED" })
  }, [])

  const setSelectedPlan = useCallback((planId: string | null) => {
    dispatch({ type: "SET_SELECTED_PLAN", payload: planId })
  }, [])

  const setFilter = useCallback((filter: PlanFilter) => {
    dispatch({ type: "SET_FILTER", payload: filter })
  }, [])

  // Derived state functions
  const isStepComplete = useCallback(
    (step: HealthPlanStep) => {
      return state.completedSteps.includes(step)
    },
    [state.completedSteps]
  )

  const canProceedToStep = useCallback(
    (step: HealthPlanStep) => {
      // Step 1 is always accessible
      if (step === 1) return true

      // Other steps require previous steps to be complete
      for (let i = 1; i < step; i++) {
        if (!state.completedSteps.includes(i as HealthPlanStep)) {
          return false
        }
      }
      return true
    },
    [state.completedSteps]
  )

  const getStepStatus = useCallback(
    (step: HealthPlanStep): "pending" | "in-progress" | "completed" => {
      if (state.completedSteps.includes(step)) {
        return "completed"
      }
      if (state.currentStep === step && state.isLoading) {
        return "in-progress"
      }
      if (state.currentStep === step) {
        return "in-progress"
      }
      return "pending"
    },
    [state.completedSteps, state.currentStep, state.isLoading]
  )

  const value = useMemo<HealthPlanContextValue>(
    () => ({
      state,
      setStep,
      completeStep,
      setLoading,
      setError,
      reset,
      resetToStep,
      setClientInfo,
      updateClientInfo,
      setSearchResults,
      setCompatibilityAnalysis,
      setERPPrices,
      setRecommendation,
      toggleClientInfoCollapsed,
      setSelectedPlan,
      setFilter,
      isStepComplete,
      canProceedToStep,
      getStepStatus
    }),
    [
      state,
      setStep,
      completeStep,
      setLoading,
      setError,
      reset,
      resetToStep,
      setClientInfo,
      updateClientInfo,
      setSearchResults,
      setCompatibilityAnalysis,
      setERPPrices,
      setRecommendation,
      toggleClientInfoCollapsed,
      setSelectedPlan,
      setFilter,
      isStepComplete,
      canProceedToStep,
      getStepStatus
    ]
  )

  return (
    <HealthPlanContext.Provider value={value}>
      {children}
    </HealthPlanContext.Provider>
  )
}

// =============================================================================
// HOOK
// =============================================================================

export function useHealthPlan(): HealthPlanContextValue {
  const context = useContext(HealthPlanContext)
  if (!context) {
    throw new Error("useHealthPlan must be used within a HealthPlanProvider")
  }
  return context
}

/**
 * Hook to check if we're inside a HealthPlanProvider
 */
export function useHealthPlanOptional(): HealthPlanContextValue | null {
  return useContext(HealthPlanContext)
}
