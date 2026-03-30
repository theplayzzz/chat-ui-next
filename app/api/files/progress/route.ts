import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const correlationId = searchParams.get("correlationId")

  if (!correlationId) {
    return NextResponse.json(
      { error: "Missing correlationId" },
      { status: 400 }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from("rag_pipeline_logs")
    .select(
      "stage, status, duration_ms, chunks_created, chunks_processed, error_details"
    )
    .eq("correlation_id", correlationId)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Determine overall stages and their status
  const EXPECTED_STAGES = [
    "chunking",
    "embedding",
    "tag_inference",
    "context_generation",
    "file_embedding"
  ]

  const stageMap = new Map<string, any>()
  for (const log of data || []) {
    // Keep the latest status for each stage
    stageMap.set(log.stage, {
      stage: log.stage,
      status: log.status,
      durationMs: log.duration_ms,
      chunksCreated: log.chunks_created,
      chunksProcessed: log.chunks_processed,
      error: log.error_details
    })
  }

  const stages = EXPECTED_STAGES.map(stage => {
    const found = stageMap.get(stage)
    return (
      found || {
        stage,
        status: "pending",
        durationMs: null,
        chunksCreated: null
      }
    )
  })

  const done = stages.every(
    (s: any) => s.status === "completed" || s.status === "failed"
  )
  const hasError = stages.some((s: any) => s.status === "failed")

  return NextResponse.json({ stages, done, hasError })
}
