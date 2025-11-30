/**
 * Correlation ID Management
 *
 * Provides unique correlation IDs that propagate through the entire workflow.
 * Correlation IDs allow tracking a user session across all components:
 * - LLM calls
 * - Database operations
 * - External API calls (ERP)
 * - LangSmith traces
 * - Application logs
 *
 * Referência: PRD RF-013, Task #14.5
 */

import { v4 as uuidv4 } from "uuid"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Complete tracing context for a session
 */
export interface TracingContext {
  /** Unique correlation ID for the session */
  correlationId: string
  /** Session ID from session manager */
  sessionId: string
  /** User ID */
  userId?: string
  /** Workspace ID */
  workspaceId: string
  /** Parent run ID for LangSmith hierarchy */
  parentRunId?: string
  /** Session run ID (top-level LangSmith run) */
  sessionRunId?: string
  /** Current step being executed */
  currentStep?: number
  /** Timestamp when context was created */
  createdAt: string
  /** Additional metadata */
  metadata?: Record<string, any>
}

/**
 * Context propagation headers for HTTP requests
 */
export interface CorrelationHeaders {
  "X-Correlation-Id": string
  "X-Session-Id"?: string
  "X-Workspace-Id"?: string
  "X-User-Id"?: string
  "X-Parent-Run-Id"?: string
}

// =============================================================================
// CORRELATION ID GENERATION
// =============================================================================

/**
 * Generates a unique correlation ID with health-plan prefix
 *
 * Format: hp-{timestamp}-{uuid8chars}
 * Example: hp-1732923840000-a1b2c3d4
 *
 * @returns Unique correlation ID
 */
export function generateCorrelationId(): string {
  return `hp-${Date.now()}-${uuidv4().slice(0, 8)}`
}

/**
 * Generates a correlation ID for a specific domain/service
 *
 * @param prefix - Domain prefix (e.g., "erp", "llm", "db")
 * @returns Prefixed correlation ID
 */
export function generateDomainCorrelationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${uuidv4().slice(0, 8)}`
}

/**
 * Validates if a string is a valid correlation ID format
 *
 * @param id - String to validate
 * @returns True if valid correlation ID format
 */
export function isValidCorrelationId(id: string): boolean {
  // Matches patterns like: hp-1732923840000-a1b2c3d4
  return /^[a-z]+-\d+-[a-f0-9]{8}$/.test(id)
}

// =============================================================================
// CONTEXT CREATION
// =============================================================================

/**
 * Creates a new tracing context for a session
 *
 * @param workspaceId - Workspace ID
 * @param sessionId - Session ID
 * @param userId - Optional user ID
 * @param existingCorrelationId - Optional existing correlation ID to reuse
 * @returns Complete tracing context
 */
export function createTracingContext(
  workspaceId: string,
  sessionId: string,
  userId?: string,
  existingCorrelationId?: string
): TracingContext {
  return {
    correlationId: existingCorrelationId || generateCorrelationId(),
    sessionId,
    workspaceId,
    userId,
    createdAt: new Date().toISOString()
  }
}

/**
 * Creates a child context from an existing context
 * Preserves correlation ID but allows updating parent run ID
 *
 * @param parentContext - Parent tracing context
 * @param updates - Updates to apply
 * @returns Child context with inherited correlation ID
 */
export function createChildContext(
  parentContext: TracingContext,
  updates: Partial<TracingContext>
): TracingContext {
  return {
    ...parentContext,
    ...updates,
    // Always preserve original correlation ID
    correlationId: parentContext.correlationId,
    metadata: {
      ...parentContext.metadata,
      ...updates.metadata,
      parentCorrelationId: parentContext.correlationId
    }
  }
}

// =============================================================================
// HEADER GENERATION
// =============================================================================

/**
 * Generates HTTP headers for correlation propagation
 *
 * @param context - Tracing context
 * @returns Headers object with correlation data
 */
export function getCorrelationHeaders(
  context: TracingContext
): CorrelationHeaders {
  const headers: CorrelationHeaders = {
    "X-Correlation-Id": context.correlationId
  }

  if (context.sessionId) {
    headers["X-Session-Id"] = context.sessionId
  }

  if (context.workspaceId) {
    headers["X-Workspace-Id"] = context.workspaceId
  }

  if (context.userId) {
    headers["X-User-Id"] = context.userId
  }

  if (context.parentRunId) {
    headers["X-Parent-Run-Id"] = context.parentRunId
  }

  return headers
}

/**
 * Extracts correlation context from HTTP headers
 *
 * @param headers - HTTP headers object
 * @returns Partial tracing context from headers
 */
export function extractCorrelationFromHeaders(
  headers: Record<string, string | undefined>
): Partial<TracingContext> {
  const context: Partial<TracingContext> = {}

  const correlationId =
    headers["x-correlation-id"] ||
    headers["X-Correlation-Id"] ||
    headers["X-CORRELATION-ID"]

  if (correlationId) {
    context.correlationId = correlationId
  }

  const sessionId =
    headers["x-session-id"] ||
    headers["X-Session-Id"] ||
    headers["X-SESSION-ID"]

  if (sessionId) {
    context.sessionId = sessionId
  }

  const workspaceId =
    headers["x-workspace-id"] ||
    headers["X-Workspace-Id"] ||
    headers["X-WORKSPACE-ID"]

  if (workspaceId) {
    context.workspaceId = workspaceId
  }

  const userId =
    headers["x-user-id"] || headers["X-User-Id"] || headers["X-USER-ID"]

  if (userId) {
    context.userId = userId
  }

  const parentRunId =
    headers["x-parent-run-id"] ||
    headers["X-Parent-Run-Id"] ||
    headers["X-PARENT-RUN-ID"]

  if (parentRunId) {
    context.parentRunId = parentRunId
  }

  return context
}

// =============================================================================
// LOGGING HELPERS
// =============================================================================

/**
 * Creates a log prefix with correlation ID
 *
 * @param context - Tracing context
 * @returns Log prefix string
 */
export function getLogPrefix(context: TracingContext): string {
  return `[${context.correlationId}]`
}

/**
 * Creates structured log metadata from context
 *
 * @param context - Tracing context
 * @returns Metadata object for structured logging
 */
export function getLogMetadata(context: TracingContext): Record<string, any> {
  return {
    correlationId: context.correlationId,
    sessionId: context.sessionId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    parentRunId: context.parentRunId,
    currentStep: context.currentStep
  }
}

// =============================================================================
// LANGSMITH INTEGRATION
// =============================================================================

/**
 * Creates LangSmith metadata from tracing context
 *
 * @param context - Tracing context
 * @returns Metadata object for LangSmith runs
 */
export function getLangSmithMetadata(
  context: TracingContext
): Record<string, any> {
  return {
    correlationId: context.correlationId,
    sessionId: context.sessionId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    createdAt: context.createdAt,
    ...context.metadata
  }
}

/**
 * Creates LangSmith tags from tracing context
 *
 * @param context - Tracing context
 * @returns Array of tags for LangSmith
 */
export function getLangSmithTags(context: TracingContext): string[] {
  const tags: string[] = ["health-plan"]

  if (context.workspaceId) {
    tags.push(`workspace:${context.workspaceId}`)
  }

  if (context.currentStep) {
    tags.push(`step:${context.currentStep}`)
  }

  return tags
}

// =============================================================================
// CONTEXT STORAGE (AsyncLocalStorage alternative)
// =============================================================================

/**
 * Simple context storage for the current request
 * Uses a Map to store contexts by correlation ID
 */
const contextStore = new Map<string, TracingContext>()

/**
 * Stores a context for later retrieval
 *
 * @param context - Context to store
 */
export function storeContext(context: TracingContext): void {
  contextStore.set(context.correlationId, context)
}

/**
 * Retrieves a stored context by correlation ID
 *
 * @param correlationId - Correlation ID to look up
 * @returns Stored context or undefined
 */
export function getStoredContext(
  correlationId: string
): TracingContext | undefined {
  return contextStore.get(correlationId)
}

/**
 * Removes a stored context
 *
 * @param correlationId - Correlation ID to remove
 */
export function clearStoredContext(correlationId: string): void {
  contextStore.delete(correlationId)
}

/**
 * Gets the current context store size (for debugging)
 */
export function getContextStoreSize(): number {
  return contextStore.size
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Merges correlation ID into existing metadata
 *
 * @param metadata - Existing metadata
 * @param context - Tracing context
 * @returns Merged metadata with correlation info
 */
export function mergeCorrelationMetadata(
  metadata: Record<string, any> | undefined,
  context: TracingContext
): Record<string, any> {
  return {
    ...metadata,
    correlationId: context.correlationId,
    sessionId: context.sessionId,
    workspaceId: context.workspaceId
  }
}

/**
 * Creates a correlation-aware error with context
 *
 * @param message - Error message
 * @param context - Tracing context
 * @returns Error with correlation metadata
 */
export function createCorrelatedError(
  message: string,
  context: TracingContext
): Error {
  const error = new Error(message)
  ;(error as any).correlationId = context.correlationId
  ;(error as any).sessionId = context.sessionId
  ;(error as any).workspaceId = context.workspaceId
  return error
}
