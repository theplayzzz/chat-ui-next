import { NextRequest, NextResponse } from "next/server"
import { analyzePDF } from "@/lib/rag/ingest/pdf-analyzer"

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field" },
        { status: 400 }
      )
    }

    const analysis = await analyzePDF(text)
    return NextResponse.json(analysis)
  } catch (error) {
    console.error("[analyze] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    )
  }
}
