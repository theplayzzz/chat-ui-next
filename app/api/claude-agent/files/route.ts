/**
 * Claude Agent Files — proxy entre o frontend e o Docker service.
 *
 * GET   /api/claude-agent/files          → lista arquivos da tabela claude_agent_files
 * POST  /api/claude-agent/files          → upload multipart → Docker + Supabase (auto-rename em conflito)
 */

import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import path from "path"

export const runtime = "nodejs"
export const maxDuration = 60

const DOCKER_SERVICE_URL =
  process.env.CLAUDE_AGENT_SERVICE_URL ?? "http://5.161.64.137:3011"

export async function GET() {
  const supabase = createClient(cookies())
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("claude_agent_files")
    .select("*")
    .order("uploaded_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ files: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = createClient(cookies())
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  // Resolve unique filename by checking Supabase first
  const originalName = file.name
  const ext = path.extname(originalName)
  const base = path.basename(originalName, ext)
  let finalName = originalName
  let attempt = 1
  while (true) {
    const { data: existing } = await supabase
      .from("claude_agent_files")
      .select("id")
      .eq("filename", finalName)
      .maybeSingle()
    if (!existing) break
    attempt++
    finalName = `${base}-${attempt}${ext}`
    if (attempt > 100) {
      return NextResponse.json(
        { error: "Too many filename collisions" },
        { status: 409 }
      )
    }
  }

  // Forward to Docker with resolved filename
  const dockerForm = new FormData()
  const renamedBlob = new File([await file.arrayBuffer()], finalName, {
    type: file.type
  })
  dockerForm.append("file", renamedBlob)

  let dockerResp: Response
  try {
    dockerResp = await fetch(`${DOCKER_SERVICE_URL}/upload`, {
      method: "POST",
      body: dockerForm
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[claude-agent-files] Docker unreachable:", msg)
    return NextResponse.json(
      { error: "Claude Agent service unreachable" },
      { status: 503 }
    )
  }

  if (!dockerResp.ok) {
    const text = await dockerResp.text()
    return NextResponse.json(
      { error: `Docker upload failed: ${text}` },
      { status: dockerResp.status }
    )
  }

  // Insert Supabase row
  const { data: inserted, error } = await supabase
    .from("claude_agent_files")
    .insert({
      filename: finalName,
      size_bytes: file.size,
      uploaded_by: user.user.id
    })
    .select()
    .single()

  if (error) {
    // Rollback Docker upload if Supabase insert fails
    await fetch(
      `${DOCKER_SERVICE_URL}/documents/${encodeURIComponent(finalName)}`,
      { method: "DELETE" }
    ).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ file: inserted })
}
