/**
 * Health Check endpoint para diagnosticar checkpointer
 * GET /api/chat/health-plan-agent-v2/health
 */

import { NextRequest } from "next/server"
import { getCheckpointer } from "@/lib/agents/health-plan-v2/checkpointer/postgres-checkpointer"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    buildVersion: "rag-level4-accuracy-v2",
    nodeEnv: process.env.NODE_ENV,
    envVars: {
      DATABASE_URL: process.env.DATABASE_URL
        ? `SET (${process.env.DATABASE_URL.length} chars, ends: ...${process.env.DATABASE_URL.slice(-30)})`
        : "MISSING",
      DATABASE_URL_POOLER: process.env.DATABASE_URL_POOLER
        ? `SET (${process.env.DATABASE_URL_POOLER.length} chars, ends: ...${process.env.DATABASE_URL_POOLER.slice(-30)})`
        : "MISSING",
      ENABLE_AGENT_DEBUG: process.env.ENABLE_AGENT_DEBUG || "NOT SET"
    }
  }

  try {
    const checkpointer = await getCheckpointer()
    const testConfig = {
      configurable: { thread_id: `health-check-${Date.now()}` }
    }
    const tuple = await checkpointer.getTuple(testConfig)

    result.checkpointer = {
      status: "OK",
      connected: true,
      getTuple: tuple ? "has_data" : "null_new_thread"
    }
  } catch (error) {
    result.checkpointer = {
      status: "FAILED",
      connected: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }

  const isHealthy =
    (result.checkpointer as Record<string, unknown>)?.status === "OK"

  return new Response(JSON.stringify(result, null, 2), {
    status: isHealthy ? 200 : 503,
    headers: { "Content-Type": "application/json" }
  })
}
