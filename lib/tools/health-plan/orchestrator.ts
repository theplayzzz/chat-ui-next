/**
 * Health Plan Orchestrator
 *
 * Orquestra os 5 passos do workflow de recomendação de planos de saúde
 * de forma sequencial com streaming de progresso para o usuário.
 *
 * Fluxo:
 * 1. extractClientInfo - Coleta informações do cliente
 * 2. searchHealthPlans - Busca planos via RAG
 * 3. analyzeCompatibility - Analisa e rankeia planos
 * 4. fetchERPPrices - Busca preços do ERP
 * 5. generateRecommendation - Gera recomendação humanizada
 *
 * Referência: PRD RF-008, Task #10.3
 */

import type {
  WorkspaceERPConfig,
  PartialClientInfo,
  FamilyProfile
} from "./types"
import type { ClientInfo } from "./schemas/client-info-schema"
import type {
  HealthPlanDocument,
  RankedAnalysis
} from "./analyze-compatibility"
import {
  getOrCreateSession,
  updateSession,
  addSessionError,
  completeSession,
  isClientInfoComplete,
  type SessionState,
  type WorkflowStep
} from "./session-manager"
import { extractClientInfo } from "./extract-client-info"
import { searchHealthPlans } from "./search-health-plans"
import { analyzeCompatibility } from "./analyze-compatibility"
import { fetchERPPrices } from "./fetch-erp-prices"
import { generateRecommendation } from "./generate-recommendation"
import { HealthPlanLogger, createLogger } from "./logger"
import {
  ErrorHandler,
  TimeoutError,
  executeWithTimeout,
  withRetry
} from "./error-handler"
import { saveRecommendationAudit, type SaveAuditResult } from "./audit-logger"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  sessionId?: string
  workspaceId: string
  userId: string
  assistantId: string
  openaiApiKey: string
  erpConfig?: WorkspaceERPConfig
  /**
   * Force workflow to restart from a specific step.
   * Useful when client info changes and previous results are invalidated.
   * Steps 2-5 require client info to be complete.
   */
  resetToStep?: WorkflowStep
}

/**
 * Message format for conversation
 */
export interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

/**
 * Timeout configuration per step (in milliseconds)
 */
const STEP_TIMEOUTS: Record<WorkflowStep, number> = {
  1: 10_000, // extractClientInfo: 10s
  2: 15_000, // searchHealthPlans: 15s
  3: 20_000, // analyzeCompatibility: 20s (complex GPT analysis)
  4: 10_000, // fetchERPPrices: 10s
  5: 20_000 // generateRecommendation: 20s (GPT generation)
}

/**
 * Progress messages for each step
 */
const STEP_PROGRESS: Record<WorkflowStep, string> = {
  1: "📋 Analisando suas informações...\n",
  2: "🔍 Buscando planos compatíveis...\n",
  3: "📊 Analisando compatibilidade dos planos...\n",
  4: "💰 Consultando preços atualizados...\n",
  5: "✨ Gerando sua recomendação personalizada...\n\n"
}

// =============================================================================
// ORCHESTRATOR CLASS
// =============================================================================

/**
 * Health Plan Orchestrator
 *
 * Manages the multi-step workflow for health plan recommendations
 */
export class HealthPlanOrchestrator {
  private config: OrchestratorConfig
  private session: SessionState | null = null
  private logger: HealthPlanLogger
  private errorHandler: ErrorHandler

  constructor(config: OrchestratorConfig) {
    this.config = config
    this.logger = createLogger(config.workspaceId, config.userId)
    this.errorHandler = new ErrorHandler()
  }

  /**
   * Gets or generates a session ID
   */
  getSessionId(): string {
    return this.session?.sessionId || this.config.sessionId || "pending"
  }

  /**
   * Executes the complete workflow with streaming
   *
   * @param messages - Conversation messages from user
   * @yields Progress messages and final recommendation
   */
  async *executeWorkflow(
    messages: Message[]
  ): AsyncGenerator<string, void, unknown> {
    const workflowStartTime = Date.now()

    try {
      // Initialize or resume session (with ownership validation if sessionId provided)
      this.session = await getOrCreateSession(
        this.config.workspaceId,
        this.config.userId,
        this.config.sessionId // Pass sessionId for specific session lookup with ownership validation
      )

      this.logger.setSessionId(this.session.sessionId)
      this.logger.logWorkflowStart()

      // Determine starting step based on session state
      const startStep = this.determineStartStep()

      // Execute steps sequentially
      for (let step = startStep; step <= 5; step++) {
        const stepResult = yield* this.executeStep(
          step as WorkflowStep,
          messages
        )

        if (!stepResult.continue) {
          // Step indicated we should stop (e.g., waiting for more info)
          if (stepResult.message) {
            yield stepResult.message
          }
          return
        }
      }

      // Workflow complete - yield final recommendation
      if (this.session.recommendation?.markdown) {
        yield this.session.recommendation.markdown
      }

      // Save recommendation to client_recommendations with LangSmith runId
      await this.saveToClientRecommendations()

      const totalTime = Date.now() - workflowStartTime
      this.logger.logWorkflowEnd(true, totalTime)
    } catch (error) {
      const totalTime = Date.now() - workflowStartTime
      this.logger.logWorkflowEnd(false, totalTime, error)

      const stepError = this.errorHandler.classifyError(
        error,
        this.session?.currentStep || 1
      )

      yield `\n\n${stepError.userMessage}`

      // Try to yield partial results if available
      yield* this.yieldPartialResults()
    }
  }

  /**
   * Determines which step to start/resume from.
   *
   * Priority order:
   * 1. resetToStep from config (explicit restart request)
   * 2. Step 1 if client info is incomplete
   * 3. Current step if session not completed
   * 4. Step 1 for completed sessions
   */
  private determineStartStep(): WorkflowStep {
    if (!this.session) return 1

    // 1. Honor explicit resetToStep request
    if (this.config.resetToStep) {
      const resetStep = this.config.resetToStep

      // Steps 2-5 require complete client info
      if (resetStep > 1 && !isClientInfoComplete(this.session.clientInfo)) {
        console.log(
          `[orchestrator] Reset to step ${resetStep} requested but client info incomplete, starting from step 1`
        )
        return 1
      }

      // Clear data from invalidated steps when resetting
      this.invalidateStepsFrom(resetStep)

      console.log(`[orchestrator] Resetting to step ${resetStep} as requested`)
      return resetStep
    }

    // 2. If client info is incomplete, always start from step 1
    if (!isClientInfoComplete(this.session.clientInfo)) {
      return 1
    }

    // 3. Resume from current step if not completed
    if (!this.session.completedAt) {
      return this.session.currentStep
    }

    // 4. Completed sessions start fresh
    return 1
  }

  /**
   * Invalidates (clears) session data from a specific step onwards.
   * This ensures stale data is not used when restarting from an earlier step.
   */
  private async invalidateStepsFrom(step: WorkflowStep): Promise<void> {
    if (!this.session) return

    const updates: Partial<SessionState> = {
      currentStep: step,
      completedAt: undefined
    }

    // Clear data for invalidated steps
    if (step <= 2) {
      updates.searchResults = undefined
    }
    if (step <= 3) {
      updates.compatibilityAnalysis = undefined
    }
    if (step <= 4) {
      updates.erpPrices = undefined
    }
    if (step <= 5) {
      updates.recommendation = undefined
    }

    await updateSession(this.session.sessionId, updates as any)
    console.log(
      `[orchestrator] Invalidated session data from step ${step} onwards`
    )
  }

  /**
   * Executes a single step of the workflow
   */
  private async *executeStep(
    step: WorkflowStep,
    messages: Message[]
  ): AsyncGenerator<string, { continue: boolean; message?: string }, unknown> {
    const stepStartTime = Date.now()

    try {
      // Yield progress message
      yield STEP_PROGRESS[step]

      this.logger.logStepStart(step, this.getStepInputs(step))

      // Execute step with timeout and automatic retry for transient errors
      const result = await withRetry(
        () =>
          executeWithTimeout(
            this.executeStepLogic(step, messages),
            STEP_TIMEOUTS[step],
            `Step ${step}`
          ),
        2, // maxRetries: up to 2 retries (3 total attempts)
        step
      )

      const duration = Date.now() - stepStartTime
      this.logger.logStepEnd(step, result, duration)

      // Handle step-specific results
      return yield* this.handleStepResult(step, result)
    } catch (error) {
      const duration = Date.now() - stepStartTime
      this.logger.logStepError(step, error as Error, duration)

      // Add error to session (this error has exhausted all retries)
      if (this.session) {
        const classified = this.errorHandler.classifyError(error, step)
        await addSessionError(
          this.session.sessionId,
          step,
          error instanceof Error ? error.message : String(error),
          false // Not retryable - retries were already exhausted by withRetry
        )
      }

      throw error
    }
  }

  /**
   * Gets inputs for the current step (for logging)
   */
  private getStepInputs(step: WorkflowStep): any {
    switch (step) {
      case 1:
        return { currentInfo: this.session?.clientInfo }
      case 2:
        return { clientInfo: this.session?.clientInfo }
      case 3:
        return { plansCount: this.session?.searchResults?.results?.length }
      case 4:
        return { analysisComplete: !!this.session?.compatibilityAnalysis }
      case 5:
        return { hasAnalysis: !!this.session?.compatibilityAnalysis }
      default:
        return {}
    }
  }

  /**
   * Executes the logic for a specific step
   */
  private async executeStepLogic(
    step: WorkflowStep,
    messages: Message[]
  ): Promise<any> {
    switch (step) {
      case 1:
        return this.executeExtractClientInfo(messages)
      case 2:
        return this.executeSearchHealthPlans()
      case 3:
        return this.executeAnalyzeCompatibility()
      case 4:
        return this.executeFetchERPPrices()
      case 5:
        return this.executeGenerateRecommendation()
      default:
        throw new Error(`Unknown step: ${step}`)
    }
  }

  /**
   * Handles the result of a step and determines next action
   */
  private async *handleStepResult(
    step: WorkflowStep,
    result: any
  ): AsyncGenerator<string, { continue: boolean; message?: string }, unknown> {
    switch (step) {
      case 1: {
        // Check if client info is complete
        const extractResult = result as {
          clientInfo: PartialClientInfo
          isComplete: boolean
          nextQuestion?: string
        }

        await updateSession(this.session!.sessionId, {
          clientInfo: extractResult.clientInfo,
          currentStep: extractResult.isComplete ? 2 : 1
        })

        this.session!.clientInfo = extractResult.clientInfo
        this.session!.currentStep = extractResult.isComplete ? 2 : 1

        if (!extractResult.isComplete) {
          return {
            continue: false,
            message:
              extractResult.nextQuestion ||
              "Preciso de mais algumas informações para encontrar o plano ideal. Pode me contar mais sobre você?"
          }
        }

        return { continue: true }
      }

      case 2: {
        await updateSession(this.session!.sessionId, {
          searchResults: result,
          currentStep: 3
        })

        this.session!.searchResults = result
        this.session!.currentStep = 3

        // Check if we found any plans
        if (!result.results || result.results.length === 0) {
          return {
            continue: false,
            message:
              "Não encontrei planos de saúde compatíveis com seu perfil na nossa base. Por favor, verifique as informações fornecidas ou entre em contato com o suporte."
          }
        }

        return { continue: true }
      }

      case 3: {
        await updateSession(this.session!.sessionId, {
          compatibilityAnalysis: result,
          currentStep: 4
        })

        this.session!.compatibilityAnalysis = result
        this.session!.currentStep = 4

        return { continue: true }
      }

      case 4: {
        await updateSession(this.session!.sessionId, {
          erpPrices: result,
          currentStep: 5
        })

        this.session!.erpPrices = result
        this.session!.currentStep = 5

        return { continue: true }
      }

      case 5: {
        await completeSession(this.session!.sessionId, result)
        this.session!.recommendation = result
        this.session!.completedAt = new Date().toISOString()

        return { continue: true }
      }

      default:
        return { continue: true }
    }
  }

  /**
   * Step 1: Extract client info from conversation
   */
  private async executeExtractClientInfo(messages: Message[]) {
    return extractClientInfo(
      {
        messages,
        currentInfo: this.session?.clientInfo
      },
      this.config.openaiApiKey
    )
  }

  /**
   * Step 2: Search health plans via RAG
   */
  private async executeSearchHealthPlans() {
    if (!this.session?.clientInfo) {
      throw new Error("Client info is required for search")
    }

    return searchHealthPlans(
      {
        assistantId: this.config.assistantId,
        clientInfo: this.session.clientInfo,
        topK: 15 // Get more results for better analysis
      },
      this.config.openaiApiKey
    )
  }

  /**
   * Step 3: Analyze compatibility of plans
   */
  private async executeAnalyzeCompatibility() {
    if (!this.session?.clientInfo || !this.session?.searchResults) {
      throw new Error(
        "Client info and search results are required for analysis"
      )
    }

    // Ensure clientInfo has all required fields (type assertion)
    const clientInfo = this.session.clientInfo as ClientInfo

    // Group search results by collection/plan
    const planDocuments = this.groupSearchResultsByPlan()

    return analyzeCompatibility(
      {
        clientInfo,
        plans: planDocuments,
        options: {
          topK: 5,
          includeAlternatives: true,
          detailedReasoning: true,
          maxConcurrency: 3,
          timeoutMs: 15_000
        }
      },
      this.config.openaiApiKey
    )
  }

  /**
   * Groups search results into plan documents for analysis
   */
  private groupSearchResultsByPlan(): HealthPlanDocument[] {
    if (!this.session?.searchResults?.results) {
      return []
    }

    // Group by collectionId
    const grouped = new Map<string, HealthPlanDocument>()

    for (const result of this.session.searchResults.results) {
      const key = result.collectionId

      if (!grouped.has(key)) {
        grouped.set(key, {
          planId: result.collectionId,
          planName: result.collectionName,
          operadora: result.metadata?.operator,
          collectionId: result.collectionId,
          collectionName: result.collectionName,
          documents: []
        })
      }

      grouped.get(key)!.documents.push(result)
    }

    // Return as array, limited to top plans
    return Array.from(grouped.values()).slice(0, 10)
  }

  /**
   * Step 4: Fetch ERP prices
   */
  private async executeFetchERPPrices() {
    if (!this.session?.compatibilityAnalysis || !this.session?.clientInfo) {
      throw new Error(
        "Compatibility analysis and client info are required for pricing"
      )
    }

    // If no ERP config, return empty result
    if (!this.config.erpConfig) {
      return {
        success: false,
        error: "ERP not configured for this workspace",
        source: "none" as const,
        cached_at: null,
        is_fresh: false
      }
    }

    // Get plan IDs from analysis
    const analysis = this.session.compatibilityAnalysis
    const planIds = analysis.rankedPlans.slice(0, 5).map(p => p.planId)

    // Build family profile
    const familyProfile: FamilyProfile = {
      titular: {
        idade: this.session.clientInfo.age!
      },
      dependentes: (this.session.clientInfo.dependents || []).map(dep => ({
        relacao: this.mapRelationship(dep.relationship),
        idade: dep.age
      }))
    }

    return fetchERPPrices(this.config.workspaceId, planIds, familyProfile)
  }

  /**
   * Maps relationship string to ERP format
   */
  private mapRelationship(
    relationship: string
  ): "conjuge" | "filho" | "pai" | "mae" | "outro" {
    const mapping: Record<
      string,
      "conjuge" | "filho" | "pai" | "mae" | "outro"
    > = {
      spouse: "conjuge",
      child: "filho",
      parent: "pai",
      mother: "mae",
      father: "pai",
      other: "outro"
    }
    return mapping[relationship] || "outro"
  }

  /**
   * Step 5: Generate recommendation
   */
  private async executeGenerateRecommendation() {
    if (!this.session?.compatibilityAnalysis) {
      throw new Error("Compatibility analysis is required for recommendation")
    }

    return generateRecommendation({
      rankedAnalysis: this.session.compatibilityAnalysis,
      erpPrices: this.session.erpPrices || undefined,
      options: {
        includeAlternatives: true,
        includeAlerts: true,
        includeNextSteps: true,
        explainTechnicalTerms: true
      }
    })
  }

  /**
   * Yields partial results when workflow fails
   */
  private async *yieldPartialResults(): AsyncGenerator<string, void, unknown> {
    if (!this.session) return

    const partialInfo: string[] = []

    if (this.session.searchResults?.results?.length) {
      partialInfo.push(
        `\n📌 Encontramos ${this.session.searchResults.results.length} planos compatíveis antes do erro.`
      )
    }

    if (this.session.compatibilityAnalysis?.rankedPlans?.length) {
      const top = this.session.compatibilityAnalysis.rankedPlans[0]
      partialInfo.push(
        `\n📌 Melhor plano identificado: ${top.planName} (Score: ${top.score.overall}/100)`
      )
    }

    if (partialInfo.length > 0) {
      yield "\n\n**Informações parciais coletadas:**"
      for (const info of partialInfo) {
        yield info
      }
      yield "\n\nPor favor, tente novamente ou entre em contato com o suporte."
    }
  }

  /**
   * Saves the completed recommendation to client_recommendations table
   * with LGPD compliance (anonymization, retention, consent)
   * Uses the audit-logger for automatic anonymization
   */
  private async saveToClientRecommendations(): Promise<SaveAuditResult> {
    if (!this.session?.recommendation || !this.session?.clientInfo) {
      console.log(
        "[orchestrator] Skipping client_recommendations save - no recommendation or client info"
      )
      return { success: false, error: "No data to save", auditStatus: "failed" }
    }

    try {
      const runId = this.logger.getLangSmithRunId()
      const topPlan =
        this.session.compatibilityAnalysis?.rankedPlans?.[0] || null

      // Use audit-logger with automatic anonymization and LGPD fields
      const result = await saveRecommendationAudit({
        workspaceId: this.config.workspaceId,
        userId: this.config.userId,
        clientInfo: this.session.clientInfo,
        analyzedPlans: this.session.compatibilityAnalysis?.rankedPlans || [],
        recommendedPlan: topPlan,
        reasoning: this.session.recommendation.markdown,
        langsmithRunId: runId,
        consentGiven: true, // TODO: Get from user flow when consent UI is implemented
        erpPrices: this.session.erpPrices,
        searchResultsCount: this.session.searchResults?.results?.length || 0
      })

      if (result.success) {
        console.log(
          `[orchestrator] Saved recommendation audit ${result.auditId} (runId: ${runId || "none"})`
        )
      } else {
        console.error(`[orchestrator] Failed to save audit: ${result.error}`)
      }

      return result
    } catch (error) {
      // Non-critical error - log but don't fail the workflow
      console.error(
        "[orchestrator] Error saving to client_recommendations:",
        error
      )
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        auditStatus: "failed"
      }
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { OrchestratorConfig, Message, STEP_TIMEOUTS, STEP_PROGRESS }
