/**
 * PostgreSQL Checkpointer - Persistência de estado via Supabase
 *
 * Usa PostgresSaver do @langchain/langgraph-checkpoint-postgres
 * para persistir o estado do agente entre requests.
 *
 * ## Configuração de Connection String
 *
 * Em produção (Vercel), use DATABASE_URL_POOLER com PgBouncer:
 * ```
 * DATABASE_URL_POOLER=postgresql://user:pass@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true
 * ```
 *
 * Em desenvolvimento, use DATABASE_URL com conexão direta:
 * ```
 * DATABASE_URL=postgresql://user:pass@db.xxx.supabase.co:5432/postgres
 * ```
 *
 * ## Schema
 *
 * O checkpointer usa o schema 'langgraph' que será criado pela migration.
 *
 * @see .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md seção 6.4
 */

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"

let checkpointerInstance: PostgresSaver | null = null
let setupComplete = false

// Circuit breaker: stop retrying after consecutive failures
let consecutiveFailures = 0
let lastFailureTime = 0
const MAX_CONSECUTIVE_FAILURES = 3
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000 // 1 minute

/**
 * Parses and validates a database connection URL.
 * Logs the hostname explicitly for debugging DNS issues.
 */
function parseAndValidateUrl(url: string, label: string): void {
  try {
    const parsed = new URL(url)
    console.log(`[checkpointer] ${label} parsed:`, {
      hostname: parsed.hostname,
      port: parsed.port || "(default)",
      protocol: parsed.protocol
    })

    // Warn if using legacy direct connection format from Vercel
    if (
      parsed.hostname.startsWith("db.") &&
      !parsed.hostname.includes("pooler") &&
      process.env.NODE_ENV === "production"
    ) {
      console.warn(
        `[checkpointer] WARNING: ${label} uses legacy direct hostname "${parsed.hostname}". ` +
          "Vercel serverless may not resolve this. " +
          "Use pooler format: aws-0-<region>.pooler.supabase.com:6543"
      )
    }
  } catch {
    console.error(
      `[checkpointer] ${label} is not a valid URL: ${url.slice(0, 30)}...`
    )
  }
}

/**
 * Obtém a connection string apropriada para o ambiente
 */
function getConnectionString(): string {
  const poolerUrl = process.env.DATABASE_URL_POOLER
  const directUrl = process.env.DATABASE_URL

  console.log("[checkpointer] Environment check:", {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL_POOLER: poolerUrl
      ? `SET (${poolerUrl.length} chars)`
      : "MISSING",
    DATABASE_URL: directUrl ? `SET (${directUrl.length} chars)` : "MISSING"
  })

  // Preferir pooler em produção (PgBouncer para serverless)
  if (poolerUrl) {
    parseAndValidateUrl(poolerUrl, "DATABASE_URL_POOLER")
    console.log("[checkpointer] Using DATABASE_URL_POOLER")
    return poolerUrl
  }

  // Fallback para conexão direta
  if (directUrl) {
    parseAndValidateUrl(directUrl, "DATABASE_URL")
    console.log("[checkpointer] Using DATABASE_URL (direct connection)")
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[checkpointer] WARNING: Using direct connection in production. " +
          "Consider setting DATABASE_URL_POOLER with port 6543 for serverless."
      )
    }
    return directUrl
  }

  throw new Error(
    "DATABASE_URL ou DATABASE_URL_POOLER não configurado. " +
      "Configure a variável de ambiente apropriada para seu ambiente.\n" +
      "Para produção (Vercel): use DATABASE_URL_POOLER com porta 6543\n" +
      "Para desenvolvimento: use DATABASE_URL com porta 5432"
  )
}

/**
 * Obtém ou cria a instância do checkpointer
 *
 * Em produção (Vercel): usa DATABASE_URL_POOLER (PgBouncer, porta 6543)
 * Em desenvolvimento: usa DATABASE_URL (conexão direta)
 *
 * Includes circuit breaker: after 3 consecutive failures, stops retrying
 * for 60 seconds to avoid blocking requests with slow DNS timeouts.
 */
export async function getCheckpointer(): Promise<PostgresSaver> {
  if (checkpointerInstance && setupComplete) {
    // Reset circuit breaker on success path
    consecutiveFailures = 0
    return checkpointerInstance
  }

  // Circuit breaker check
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    const elapsed = Date.now() - lastFailureTime
    if (elapsed < CIRCUIT_BREAKER_COOLDOWN_MS) {
      throw new Error(
        `[checkpointer] Circuit breaker OPEN: ${consecutiveFailures} consecutive failures. ` +
          `Cooldown: ${Math.ceil((CIRCUIT_BREAKER_COOLDOWN_MS - elapsed) / 1000)}s remaining.`
      )
    }
    // Cooldown expired, allow retry
    console.log("[checkpointer] Circuit breaker cooldown expired, retrying...")
    consecutiveFailures = 0
  }

  try {
    const connectionString = getConnectionString()

    checkpointerInstance = PostgresSaver.fromConnString(connectionString, {
      schema: "langgraph"
    })

    // Inicializa as tabelas se necessário
    // setup() cria as tabelas checkpoint e writes no schema langgraph
    if (!setupComplete) {
      console.log("[checkpointer] Running setup...")
      await checkpointerInstance.setup()
      setupComplete = true
      console.log("[checkpointer] Setup complete")
    }

    // Reset circuit breaker on success
    consecutiveFailures = 0
    return checkpointerInstance
  } catch (error) {
    consecutiveFailures++
    lastFailureTime = Date.now()

    // Clear stale instance on failure
    checkpointerInstance = null
    setupComplete = false

    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error("[checkpointer] Failed to initialize:", {
      error: errorMsg,
      consecutiveFailures,
      circuitBreakerWillOpen: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
    })
    throw error
  }
}

/**
 * Cria configuração para um thread (chat) específico
 */
export function getThreadConfig(chatId: string) {
  return {
    configurable: {
      thread_id: chatId
    }
  }
}

/**
 * Fecha o checkpointer (para cleanup)
 */
export async function closeCheckpointer(): Promise<void> {
  if (checkpointerInstance) {
    checkpointerInstance = null
    setupComplete = false
    console.log("[checkpointer] Checkpointer instance cleared")
  }
}

/**
 * Verifica se o checkpointer está configurado e funcionando
 */
export async function checkCheckpointerHealth(): Promise<boolean> {
  try {
    const checkpointer = await getCheckpointer()
    // Se chegou aqui, a conexão está funcionando
    return true
  } catch (error) {
    console.error("[checkpointer] Health check failed:", error)
    return false
  }
}
