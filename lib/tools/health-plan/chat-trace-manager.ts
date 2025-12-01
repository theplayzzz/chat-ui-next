/**
 * Chat Trace Manager
 *
 * Manages LangSmith trace IDs per chat.
 * Each chat gets a unique trace ID that groups all runs for that conversation.
 *
 * Hierarchy:
 * - Trace (per chat) - stored in chats.langsmith_trace_id
 *   - Run 1 (first interaction window)
 *     - Step 1, Step 2, ...
 *   - Run 2 (second interaction window)
 *     - Step 1, Step 2, ...
 *
 * Referência: PRD RF-013 (LangSmith Integration)
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"

// =============================================================================
// TYPES
// =============================================================================

export interface ChatTraceInfo {
  chatId: string
  traceId: string
  isNewTrace: boolean
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates a Supabase admin client for server-side operations
 */
function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Gets the existing trace ID for a chat, or creates a new one if not exists.
 *
 * @param chatId - The chat ID to look up
 * @returns ChatTraceInfo with trace ID and whether it's new
 */
export async function getOrCreateChatTraceId(
  chatId: string
): Promise<ChatTraceInfo> {
  const supabase = createSupabaseAdmin()

  console.log("[chat-trace-manager] Looking up trace ID for chat:", chatId)

  // Try to get existing trace ID
  const { data: chat, error: selectError } = await supabase
    .from("chats")
    .select("id, langsmith_trace_id")
    .eq("id", chatId)
    .single()

  if (selectError) {
    console.error(
      "[chat-trace-manager] Error looking up chat:",
      selectError.message
    )
    // If chat doesn't exist yet, generate a new trace ID
    const newTraceId = crypto.randomUUID()
    console.log(
      "[chat-trace-manager] Chat not found, generated new trace ID:",
      newTraceId
    )
    return {
      chatId,
      traceId: newTraceId,
      isNewTrace: true
    }
  }

  // If chat exists but has no trace ID, create one
  if (!chat.langsmith_trace_id) {
    const newTraceId = crypto.randomUUID()
    console.log(
      "[chat-trace-manager] Chat has no trace ID, creating new one:",
      newTraceId
    )

    const { error: updateError } = await supabase
      .from("chats")
      .update({ langsmith_trace_id: newTraceId })
      .eq("id", chatId)

    if (updateError) {
      console.error(
        "[chat-trace-manager] Error updating chat with trace ID:",
        updateError.message
      )
      // Continue anyway with the new trace ID
    }

    return {
      chatId,
      traceId: newTraceId,
      isNewTrace: true
    }
  }

  // Return existing trace ID
  console.log(
    "[chat-trace-manager] Found existing trace ID:",
    chat.langsmith_trace_id
  )
  return {
    chatId,
    traceId: chat.langsmith_trace_id,
    isNewTrace: false
  }
}

/**
 * Updates the trace ID for a chat.
 * Used when a chat is created and we need to associate it with a trace.
 *
 * @param chatId - The chat ID to update
 * @param traceId - The trace ID to set
 */
export async function setChatTraceId(
  chatId: string,
  traceId: string
): Promise<void> {
  const supabase = createSupabaseAdmin()

  console.log("[chat-trace-manager] Setting trace ID for chat:", {
    chatId,
    traceId
  })

  const { error } = await supabase
    .from("chats")
    .update({ langsmith_trace_id: traceId })
    .eq("id", chatId)

  if (error) {
    console.error("[chat-trace-manager] Error setting trace ID:", error.message)
    throw new Error(`Failed to set trace ID: ${error.message}`)
  }
}

/**
 * Gets the trace ID for a chat without creating one.
 *
 * @param chatId - The chat ID to look up
 * @returns The trace ID or null if not found
 */
export async function getChatTraceId(chatId: string): Promise<string | null> {
  const supabase = createSupabaseAdmin()

  const { data: chat, error } = await supabase
    .from("chats")
    .select("langsmith_trace_id")
    .eq("id", chatId)
    .single()

  if (error || !chat) {
    return null
  }

  return chat.langsmith_trace_id
}
