/**
 * Claude Agent route — proxies to local Docker service running Claude Code CLI
 * Each chatId maps to a persistent Claude Code session
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

  // Extrai última mensagem do usuário
  const message = messages
    ?.slice()
    .reverse()
    .find(m => m.role === "user")?.content

  if (!message) {
    return new Response(JSON.stringify({ error: "No user message found" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  const serviceUrl = "http://localhost:3011"

  let upstream: Response
  try {
    upstream = await fetch(`${serviceUrl}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chatId ?? "default", message })
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[claude-agent] Service unreachable:", msg)
    return new Response(
      "Serviço Claude Agent indisponível. Verifique se o Docker está rodando.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    )
  }

  if (!upstream.ok) {
    return new Response(`Claude Agent error: ${upstream.status}`, {
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
