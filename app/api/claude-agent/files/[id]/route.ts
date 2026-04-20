/**
 * DELETE /api/claude-agent/files/[id]
 * Remove do Docker + Supabase. Atomicidade best-effort (Docker primeiro, Supabase depois).
 */

import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

const DOCKER_SERVICE_URL =
  process.env.CLAUDE_AGENT_SERVICE_URL ?? "http://5.161.64.137:3011"

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(cookies())
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: row, error: selectErr } = await supabase
    .from("claude_agent_files")
    .select("filename")
    .eq("id", params.id)
    .maybeSingle()

  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Delete from Docker first
  let dockerResp: Response
  try {
    dockerResp = await fetch(
      `${DOCKER_SERVICE_URL}/documents/${encodeURIComponent(row.filename)}`,
      { method: "DELETE" }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[claude-agent-files] Docker unreachable on delete:", msg)
    return NextResponse.json(
      { error: "Serviço do agente indisponível" },
      { status: 503 }
    )
  }

  // Accept 404 (file already gone in Docker) — still proceed with Supabase delete
  if (!dockerResp.ok && dockerResp.status !== 404) {
    const text = await dockerResp.text()
    return NextResponse.json(
      { error: `Docker delete failed: ${text}` },
      { status: dockerResp.status }
    )
  }

  const { error: delErr } = await supabase
    .from("claude_agent_files")
    .delete()
    .eq("id", params.id)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
