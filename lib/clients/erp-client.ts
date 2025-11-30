import {
  WorkspaceERPConfig,
  ERPResult,
  ERPError
} from "@/lib/tools/health-plan/types"
import {
  ERPResponse,
  ERPResponseSchema,
  ERPPriceItem
} from "@/lib/tools/health-plan/schemas/erp-response-schema"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"

// =============================================================================
// AUTO-LOGGING TYPES
// =============================================================================

interface APILogEntry {
  workspace_id: string
  status: "success" | "error" | "timeout"
  response_time_ms: number
  cache_hit: boolean
  error_message?: string
  request_params?: Record<string, unknown>
}

/**
 * HTTP client for ERP API integration with robust error handling and retry logic
 * Task #17.2: Added auto-logging to erp_api_logs table
 */
export class ERPClient {
  private config: WorkspaceERPConfig
  private decryptedApiKey: string
  private supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null

  constructor(config: WorkspaceERPConfig, decryptedApiKey: string) {
    this.config = config
    this.decryptedApiKey = decryptedApiKey
    this.initSupabaseAdmin()
  }

  /**
   * Initialize Supabase admin client for logging
   * Uses service role key for bypassing RLS
   */
  private initSupabaseAdmin(): void {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (supabaseUrl && supabaseServiceKey) {
        this.supabaseAdmin = createClient<Database>(
          supabaseUrl,
          supabaseServiceKey,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          }
        )
      }
    } catch (error) {
      console.warn("[ERPClient] Failed to initialize Supabase admin:", error)
    }
  }

  /**
   * Log API call to erp_api_logs table
   * Non-blocking - errors are logged but don't affect main flow
   */
  private async logAPICall(entry: APILogEntry): Promise<void> {
    if (!this.supabaseAdmin) {
      return // Silently skip if no admin client
    }

    try {
      await this.supabaseAdmin.from("erp_api_logs").insert({
        workspace_id: entry.workspace_id,
        status: entry.status,
        response_time_ms: entry.response_time_ms,
        cache_hit: entry.cache_hit,
        error_message: entry.error_message || null,
        request_params: (entry.request_params as Record<string, string>) || null
      })
    } catch (error) {
      // Non-blocking - just log the error
      console.error("[ERPClient] Failed to log API call:", error)
    }
  }

  /**
   * Fetch prices for multiple plans from ERP API
   * @param planIds - Array of plan IDs to fetch prices for
   * @returns Result with price data or error
   */
  async fetchPrices(planIds: string[]): Promise<ERPResult<ERPPriceItem[]>> {
    const startTime = Date.now()
    let lastError: ERPError | null = null

    // Try up to retry_attempts + 1 times (initial + retries)
    const maxAttempts = this.config.retry_attempts + 1

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logRequest(attempt, {
          workspace_id: this.config.workspace_id,
          plan_ids: planIds,
          max_attempts: maxAttempts
        })

        const response = await this.fetchWithRetry(planIds, attempt)

        // Parse response
        const data = await response.json()

        // Validate response schema
        const validationResult = ERPResponseSchema.safeParse(data)

        if (!validationResult.success) {
          throw new Error(
            `Invalid ERP response format: ${validationResult.error.message}`
          )
        }

        const erpResponse: ERPResponse = validationResult.data

        if (!erpResponse.success) {
          throw new Error("ERP API returned success=false")
        }

        // Success!
        const duration = Date.now() - startTime
        console.log(
          `[ERPClient] Success after ${attempt} attempt(s) in ${duration}ms`
        )

        // Auto-log successful call
        this.logAPICall({
          workspace_id: this.config.workspace_id,
          status: "success",
          response_time_ms: duration,
          cache_hit: false,
          request_params: { plan_ids: planIds, attempt }
        })

        return {
          success: true,
          data: erpResponse.data,
          source: "api"
        }
      } catch (error) {
        lastError = this.handleError(error, attempt)

        // If we have more attempts, wait with exponential backoff
        if (attempt < maxAttempts) {
          const backoffMs = 100 * Math.pow(2, attempt - 1) // 100ms, 200ms, 400ms, etc.
          console.warn(
            `[ERPClient] Attempt ${attempt} failed, retrying in ${backoffMs}ms...`,
            lastError
          )
          await this.sleep(backoffMs)
        }
      }
    }

    // All attempts failed
    const duration = Date.now() - startTime
    console.error(
      `[ERPClient] All ${maxAttempts} attempts failed after ${duration}ms`,
      lastError
    )

    // Auto-log failed call
    const logStatus: "error" | "timeout" =
      lastError?.code === "TIMEOUT" ? "timeout" : "error"
    this.logAPICall({
      workspace_id: this.config.workspace_id,
      status: logStatus,
      response_time_ms: duration,
      cache_hit: false,
      error_message: lastError?.message,
      request_params: { plan_ids: planIds, attempts: maxAttempts }
    })

    return {
      success: false,
      error: lastError!,
      canRetry: this.isRetryableError(lastError!)
    }
  }

  /**
   * Fetch with timeout using AbortController
   */
  private async fetchWithRetry(
    planIds: string[],
    attempt: number
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout_ms
    )

    try {
      // Prepare request headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.decryptedApiKey}`,
        ...this.config.custom_headers
      }

      const response = await fetch(this.config.api_url, {
        method: "POST",
        headers,
        body: JSON.stringify({ planIds }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.config.timeout_ms}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Handle and normalize errors
   */
  private handleError(error: unknown, attempt: number): ERPError {
    const timestamp = new Date().toISOString()

    if (error instanceof Error) {
      // Timeout error
      if (error.message.includes("timeout")) {
        return {
          code: "TIMEOUT",
          message: error.message,
          attempt,
          timestamp
        }
      }

      // HTTP error
      const httpMatch = error.message.match(/HTTP (\d+):/)
      if (httpMatch) {
        const statusCode = parseInt(httpMatch[1])
        return {
          code: statusCode >= 500 ? "SERVER_ERROR" : "CLIENT_ERROR",
          message: error.message,
          statusCode,
          attempt,
          timestamp
        }
      }

      // Validation error
      if (error.message.includes("Invalid ERP response")) {
        return {
          code: "VALIDATION_ERROR",
          message: error.message,
          attempt,
          timestamp
        }
      }

      // Generic error
      return {
        code: "UNKNOWN_ERROR",
        message: error.message,
        attempt,
        timestamp
      }
    }

    // Non-Error object
    return {
      code: "UNKNOWN_ERROR",
      message: String(error),
      attempt,
      timestamp
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: ERPError): boolean {
    // Retry on timeout, server errors (5xx), and network errors
    return (
      error.code === "TIMEOUT" ||
      error.code === "SERVER_ERROR" ||
      error.code === "UNKNOWN_ERROR" ||
      (error.statusCode !== undefined && error.statusCode >= 500)
    )
  }

  /**
   * Log request details
   */
  private logRequest(attempt: number, context: Record<string, any>): void {
    console.log(`[ERPClient] Request attempt ${attempt}`, {
      ...context,
      api_url: this.config.api_url,
      timeout_ms: this.config.timeout_ms,
      retry_attempts: this.config.retry_attempts
    })
  }
}
