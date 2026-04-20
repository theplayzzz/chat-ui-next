/**
 * Claude Agent route — proxies to local Docker service running Claude Code CLI
 *
 * Uses a unique per-request chatId to avoid --resume (which fails when
 * ~/.claude is mounted read-only in Docker). Conversation history is passed
 * inline so Claude Code has full context without needing session persistence.
 */

import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 300 // Vercel Pro: 5 min (Claude Code lê PDFs grandes)

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { chatId, messages } = body as {
    chatId?: string
    messages?: Array<{ role: string; content: string }>
  }

  const allMessages = messages ?? []

  // Extract last user message
  const lastUserMsg = allMessages
    .slice()
    .reverse()
    .find(m => m.role === "user")?.content

  if (!lastUserMsg) {
    return new Response(JSON.stringify({ error: "No user message found" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  // Build message with conversation history so Claude Code has full context.
  // Each turn uses a fresh session (unique chatId) because ~/.claude is
  // read-only in Docker and --resume silently returns 0 bytes when the
  // session file cannot be saved.
  let message: string
  const prior = allMessages.slice(0, -1) // everything before last user msg
  if (prior.length > 0) {
    const historyLines = prior
      .map(m => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n\n")
    message = `Histórico da conversa:\n${historyLines}\n\nNova pergunta do usuário: ${lastUserMsg}`
  } else {
    message = lastUserMsg
  }

  // Use a unique chatId per request — never reuse sessions
  const requestId = `${chatId ?? "default"}-${Date.now()}`

  const serviceUrl = "http://5.161.64.137:3011"

  let upstream: Response
  try {
    upstream = await fetch(`${serviceUrl}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: requestId, message })
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[claude-agent] Service unreachable:", msg)
    return new Response(
      "Serviço do agente indisponível no momento. Tente novamente em instantes.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    )
  }

  if (!upstream.ok) {
    return new Response(`Erro no agente: ${upstream.status}`, {
      status: upstream.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    })
  }

  // Pipe stream diretamente ao cliente — mesmo padrão do health-plan-agent-v2
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Chat-Id": chatId ?? "default"
    }
  })
}
