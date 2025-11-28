/**
 * Health Plan Error Handler
 *
 * Classifica, trata e gera mensagens amigáveis para erros
 * durante o workflow de recomendação de planos de saúde.
 *
 * Referência: PRD RF-008, Task #10.4
 */

import type { WorkflowStep } from "./session-manager"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Error type classification
 */
export enum ErrorType {
  VALIDATION = "ValidationError",
  TIMEOUT = "TimeoutError",
  API = "APIError",
  DATABASE = "DatabaseError",
  AUTH = "AuthorizationError",
  NETWORK = "NetworkError",
  RATE_LIMIT = "RateLimitError",
  UNKNOWN = "UnknownError"
}

/**
 * Classified error with context
 */
export interface StepError {
  step: number
  stepName: string
  type: ErrorType
  message: string
  userMessage: string
  retryable: boolean
  httpStatus: number
  originalError?: Error
}

/**
 * Step names for error context
 */
const STEP_NAMES: Record<number, string> = {
  1: "Coleta de Informações",
  2: "Busca de Planos",
  3: "Análise de Compatibilidade",
  4: "Consulta de Preços",
  5: "Geração de Recomendação"
}

// =============================================================================
// TIMEOUT ERROR
// =============================================================================

/**
 * Custom timeout error
 */
export class TimeoutError extends Error {
  public readonly step: string
  public readonly timeoutMs: number

  constructor(step: string, timeoutMs: number) {
    super(`${step} excedeu o tempo limite de ${timeoutMs}ms`)
    this.name = "TimeoutError"
    this.step = step
    this.timeoutMs = timeoutMs
  }
}

/**
 * Executes a promise with timeout
 *
 * @param promise - The promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param stepName - Name of the step for error context
 * @returns The promise result
 * @throws TimeoutError if timeout is exceeded
 */
export async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stepName: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(stepName, timeoutMs))
    }, timeoutMs)
  })

  return Promise.race([promise, timeout])
}

// =============================================================================
// ERROR HANDLER CLASS
// =============================================================================

/**
 * Error handler for health plan workflow
 */
export class ErrorHandler {
  private maxRetries: number

  constructor(maxRetries: number = 2) {
    this.maxRetries = maxRetries
  }

  /**
   * Classifies an error and returns structured error info
   *
   * @param error - The error to classify
   * @param step - The workflow step where error occurred
   * @returns Classified error with user-friendly message
   */
  classifyError(error: unknown, step: number): StepError {
    const stepName = STEP_NAMES[step] || `Passo ${step}`

    // Handle TimeoutError
    if (error instanceof TimeoutError) {
      return {
        step,
        stepName,
        type: ErrorType.TIMEOUT,
        message: error.message,
        userMessage: this.getTimeoutMessage(step),
        retryable: true,
        httpStatus: 504,
        originalError: error
      }
    }

    // Handle standard Error
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()

      // Rate limit errors
      if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("429")
      ) {
        return {
          step,
          stepName,
          type: ErrorType.RATE_LIMIT,
          message: error.message,
          userMessage:
            "O sistema está com muitas requisições. Por favor, aguarde alguns segundos e tente novamente.",
          retryable: true,
          httpStatus: 429,
          originalError: error
        }
      }

      // API errors (OpenAI, Supabase, etc.)
      if (
        errorMessage.includes("api") ||
        errorMessage.includes("openai") ||
        errorMessage.includes("500") ||
        errorMessage.includes("502") ||
        errorMessage.includes("503")
      ) {
        return {
          step,
          stepName,
          type: ErrorType.API,
          message: error.message,
          userMessage: this.getAPIErrorMessage(step),
          retryable: true,
          httpStatus: 502,
          originalError: error
        }
      }

      // Database errors
      if (
        errorMessage.includes("database") ||
        errorMessage.includes("supabase") ||
        errorMessage.includes("postgres") ||
        errorMessage.includes("query")
      ) {
        return {
          step,
          stepName,
          type: ErrorType.DATABASE,
          message: error.message,
          userMessage:
            "Houve um problema ao acessar nossos dados. Por favor, tente novamente.",
          retryable: true,
          httpStatus: 500,
          originalError: error
        }
      }

      // Authorization errors
      if (
        errorMessage.includes("unauthorized") ||
        errorMessage.includes("forbidden") ||
        errorMessage.includes("permission") ||
        errorMessage.includes("401") ||
        errorMessage.includes("403")
      ) {
        return {
          step,
          stepName,
          type: ErrorType.AUTH,
          message: error.message,
          userMessage:
            "Você não tem permissão para acessar este recurso. Por favor, verifique suas credenciais.",
          retryable: false,
          httpStatus: 403,
          originalError: error
        }
      }

      // Network errors
      if (
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("connection") ||
        errorMessage.includes("econnrefused")
      ) {
        return {
          step,
          stepName,
          type: ErrorType.NETWORK,
          message: error.message,
          userMessage:
            "Houve um problema de conexão. Por favor, verifique sua internet e tente novamente.",
          retryable: true,
          httpStatus: 503,
          originalError: error
        }
      }

      // Validation errors
      if (
        errorMessage.includes("invalid") ||
        errorMessage.includes("required") ||
        errorMessage.includes("validation") ||
        errorMessage.includes("missing")
      ) {
        return {
          step,
          stepName,
          type: ErrorType.VALIDATION,
          message: error.message,
          userMessage: this.getValidationMessage(step, error.message),
          retryable: false,
          httpStatus: 400,
          originalError: error
        }
      }

      // Generic error
      return {
        step,
        stepName,
        type: ErrorType.UNKNOWN,
        message: error.message,
        userMessage: this.getGenericErrorMessage(step),
        retryable: true,
        httpStatus: 500,
        originalError: error
      }
    }

    // Unknown error type
    return {
      step,
      stepName,
      type: ErrorType.UNKNOWN,
      message: String(error),
      userMessage: this.getGenericErrorMessage(step),
      retryable: true,
      httpStatus: 500
    }
  }

  /**
   * Determines if an error should be retried
   *
   * @param error - The classified error
   * @param attempt - Current retry attempt (0-based)
   * @returns Whether to retry
   */
  shouldRetry(error: StepError, attempt: number): boolean {
    if (attempt >= this.maxRetries) {
      return false
    }

    return error.retryable
  }

  /**
   * Gets retry delay with exponential backoff
   *
   * @param attempt - Current retry attempt (0-based)
   * @returns Delay in milliseconds
   */
  getRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s
    return Math.min(1000 * Math.pow(2, attempt), 4000)
  }

  /**
   * Gets user-friendly timeout message
   */
  private getTimeoutMessage(step: number): string {
    const stepMessages: Record<number, string> = {
      1: "A análise das suas informações está demorando mais que o esperado. Por favor, tente novamente.",
      2: "A busca de planos está demorando. Tente novamente em alguns instantes.",
      3: "A análise de compatibilidade está levando mais tempo que o normal. Por favor, aguarde ou tente novamente.",
      4: "A consulta de preços excedeu o tempo limite. Os preços podem não estar disponíveis no momento.",
      5: "A geração da recomendação está demorando. Por favor, tente novamente."
    }

    return (
      stepMessages[step] ||
      "A operação excedeu o tempo limite. Por favor, tente novamente."
    )
  }

  /**
   * Gets user-friendly API error message
   */
  private getAPIErrorMessage(step: number): string {
    const stepMessages: Record<number, string> = {
      1: "Houve um problema ao processar suas informações. Por favor, tente novamente.",
      2: "Não foi possível buscar os planos no momento. Tente novamente em alguns instantes.",
      3: "A análise de planos encontrou um problema. Por favor, tente novamente.",
      4: "Não foi possível consultar os preços atualizados. A recomendação será feita sem preços.",
      5: "Houve um problema ao gerar sua recomendação. Por favor, tente novamente."
    }

    return (
      stepMessages[step] ||
      "Houve um problema com o serviço. Por favor, tente novamente."
    )
  }

  /**
   * Gets user-friendly validation error message
   */
  private getValidationMessage(step: number, originalMessage: string): string {
    // Try to extract useful info from the original message
    if (originalMessage.includes("age")) {
      return "Preciso saber sua idade para continuar. Quantos anos você tem?"
    }
    if (originalMessage.includes("city") || originalMessage.includes("state")) {
      return "Preciso saber sua localização. Em qual cidade e estado você mora?"
    }
    if (originalMessage.includes("budget")) {
      return "Preciso saber seu orçamento mensal. Quanto você pode investir no plano de saúde?"
    }

    const stepMessages: Record<number, string> = {
      1: "Algumas informações estão incompletas. Pode me fornecer mais detalhes?",
      2: "Preciso de mais informações sobre seu perfil para buscar planos adequados.",
      3: "Os dados para análise estão incompletos. Por favor, verifique suas informações.",
      4: "Não foi possível calcular os preços com as informações fornecidas.",
      5: "Não há dados suficientes para gerar a recomendação."
    }

    return (
      stepMessages[step] ||
      "Algumas informações necessárias estão faltando. Por favor, verifique seus dados."
    )
  }

  /**
   * Gets generic error message for step
   */
  private getGenericErrorMessage(step: number): string {
    return `Ocorreu um erro durante "${STEP_NAMES[step] || `o passo ${step}`}". Por favor, tente novamente ou entre em contato com o suporte.`
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Wraps an async function with retry logic
 *
 * @param fn - The async function to execute
 * @param maxRetries - Maximum retry attempts
 * @param step - Step number for error classification
 * @returns The function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  step: number = 0
): Promise<T> {
  const handler = new ErrorHandler(maxRetries)
  let lastError: StepError | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = handler.classifyError(error, step)

      if (!handler.shouldRetry(lastError, attempt)) {
        throw error
      }

      // Wait before retry
      const delay = handler.getRetryDelay(attempt)
      await new Promise(resolve => setTimeout(resolve, delay))

      console.log(
        `[error-handler] Retrying step ${step} (attempt ${attempt + 1}/${maxRetries})`
      )
    }
  }

  // Should not reach here, but just in case
  throw lastError?.originalError || new Error("Max retries exceeded")
}

/**
 * Formats error for logging (removes sensitive data)
 *
 * @param error - The error to format
 * @returns Safe error object for logging
 */
export function formatErrorForLogging(error: StepError): object {
  return {
    step: error.step,
    stepName: error.stepName,
    type: error.type,
    message: error.message,
    retryable: error.retryable,
    httpStatus: error.httpStatus
    // Excludes originalError and userMessage for security
  }
}
