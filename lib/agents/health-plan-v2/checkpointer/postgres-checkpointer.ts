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
 * DATABASE_URL_POOLER=postgresql://user:pass@db.xxx.supabase.co:6543/postgres?pgbouncer=true
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

/**
 * Obtém a connection string apropriada para o ambiente
 */
function getConnectionString(): string {
  const poolerUrl = process.env.DATABASE_URL_POOLER
  const directUrl = process.env.DATABASE_URL

  console.log("[checkpointer] Environment check:", {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL_POOLER: poolerUrl
      ? `SET (${poolerUrl.length} chars, ends: ...${poolerUrl.slice(-30)})`
      : "MISSING",
    DATABASE_URL: directUrl
      ? `SET (${directUrl.length} chars, ends: ...${directUrl.slice(-30)})`
      : "MISSING"
  })

  // Preferir pooler em produção (PgBouncer para serverless)
  if (poolerUrl) {
    console.log("[checkpointer] Using DATABASE_URL_POOLER")
    return poolerUrl
  }

  // Fallback para conexão direta
  if (directUrl) {
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
 */
export async function getCheckpointer(): Promise<PostgresSaver> {
  if (checkpointerInstance && setupComplete) {
    return checkpointerInstance
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

    return checkpointerInstance
  } catch (error) {
    console.error("[checkpointer] Failed to initialize:", error)
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
    // PostgresSaver não tem método close explícito,
    // mas podemos limpar a referência
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
