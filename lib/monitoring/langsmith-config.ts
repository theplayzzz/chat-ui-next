/**
 * LangSmith Configuration
 *
 * Centralized configuration for LangSmith observability SDK.
 * Provides client initialization, health checks, and utility functions.
 *
 * Referência: PRD RF-013, Task #14.1
 */

import { Client } from "langsmith"
import { v4 as uuidv4 } from "uuid"

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * LangSmith project configuration
 */
export const LANGSMITH_CONFIG = {
  projectName: process.env.LANGSMITH_PROJECT || "health-plan-agent",
  apiEndpoint:
    process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com",
  traceVersion: "1.0.0",
  maxRetries: 3,
  timeout: 10000
} as const

// =============================================================================
// CLIENT SINGLETON
// =============================================================================

let langsmithClient: Client | null = null

/**
 * Gets or creates the LangSmith client singleton
 *
 * @returns LangSmith client or null if not configured
 */
export function getLangSmithClient(): Client | null {
  if (langsmithClient) {
    return langsmithClient
  }

  const apiKey = process.env.LANGSMITH_API_KEY
  if (!apiKey) {
    return null
  }

  try {
    const workspaceId = process.env.LANGSMITH_WORKSPACE_ID

    const clientOptions: any = {
      apiKey,
      apiUrl: LANGSMITH_CONFIG.apiEndpoint
    }

    // Required for org-scoped API keys
    if (workspaceId) {
      clientOptions.workspaceId = workspaceId
    }

    langsmithClient = new Client(clientOptions)
    return langsmithClient
  } catch (error) {
    console.error("[langsmith-config] Failed to create client:", error)
    return null
  }
}

/**
 * Checks if LangSmith is enabled (API key is configured)
 */
export function isLangSmithEnabled(): boolean {
  return !!process.env.LANGSMITH_API_KEY
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Result of LangSmith health check
 */
export interface HealthCheckResult {
  healthy: boolean
  latencyMs: number
  error?: string
  projectName: string
}

/**
 * Validates LangSmith connection by creating and deleting a test run
 *
 * @returns Health check result
 */
export async function checkLangSmithHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now()
  const projectName = LANGSMITH_CONFIG.projectName

  const client = getLangSmithClient()
  if (!client) {
    return {
      healthy: false,
      latencyMs: 0,
      error: "LangSmith not configured (LANGSMITH_API_KEY missing)",
      projectName
    }
  }

  try {
    // Create a minimal test run
    const testRunId = uuidv4()
    await client.createRun({
      id: testRunId,
      name: "health-check",
      run_type: "chain",
      inputs: { test: true },
      project_name: projectName,
      start_time: new Date().toISOString()
    })

    // End the test run immediately
    await client.updateRun(testRunId, {
      outputs: { healthy: true },
      end_time: new Date().toISOString()
    })

    const latencyMs = Date.now() - startTime

    return {
      healthy: true,
      latencyMs,
      projectName
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      projectName
    }
  }
}

// =============================================================================
// RUN ID GENERATION
// =============================================================================

/**
 * Generates a unique run ID as a valid UUID (required by LangSmith API)
 *
 * LangSmith requires run IDs to match pattern:
 * ^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
 *
 * @param _prefix - Deprecated: prefix is ignored, use metadata for categorization
 * @returns Valid UUID run ID
 */
export function generateRunId(_prefix: string = "hp"): string {
  // Return a proper UUID - metadata/tags should be used for categorization instead
  return uuidv4()
}

/**
 * Generates a child run ID as a valid UUID (required by LangSmith API)
 *
 * @param _parentId - Deprecated: parent relationship is set via parent_run_id field
 * @param _childName - Deprecated: use run name field instead
 * @returns Valid UUID run ID
 */
export function generateChildRunId(
  _parentId: string,
  _childName: string
): string {
  // Return a proper UUID - parent relationship is established via parent_run_id field
  return uuidv4()
}

// =============================================================================
// ENVIRONMENT VARIABLES DOCUMENTATION
// =============================================================================

/**
 * Required environment variables:
 *
 * LANGSMITH_API_KEY - Your LangSmith API key
 *   Get from: https://smith.langchain.com/settings
 *
 * Optional:
 *
 * LANGSMITH_PROJECT - Project name in LangSmith (default: "health-plan-agent")
 * LANGSMITH_ENDPOINT - API endpoint (default: "https://api.smith.langchain.com")
 */

// =============================================================================
// EXPORTS
// =============================================================================

export { Client } from "langsmith"
