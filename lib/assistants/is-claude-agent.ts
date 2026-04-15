import { Tables } from "@/supabase/types"

/**
 * Detects whether an assistant should be routed to the Claude Agent Docker service.
 * Same logic used by the chat handler and sidebar.
 */
export function isClaudeAgentAssistant(
  assistant: Tables<"assistants"> | null
): boolean {
  if (!assistant) return false
  const name = assistant.name.toLowerCase()
  const desc = (assistant.description || "").toLowerCase()
  return (
    name.includes("claude agent") ||
    name.includes("agente documentos") ||
    name.includes("documents agent") ||
    desc.includes("claude-agent")
  )
}
