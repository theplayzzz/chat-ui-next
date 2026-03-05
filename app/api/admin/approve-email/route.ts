import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types"

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

/**
 * POST /api/admin/approve-email
 * Body: { email: string }
 * Aprova um email para acessar a aplicação.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email é obrigatório" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    const supabase = createSupabaseAdmin()

    const { error } = await supabase.from("approved_emails").upsert(
      {
        email: normalizedEmail,
        approved: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: "email" }
    )

    if (error) {
      console.error("Approve email error:", error)
      return NextResponse.json(
        { error: "Erro ao aprovar email" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      approved: true
    })
  } catch (error) {
    console.error("Approve email error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/approve-email
 * Body: { email: string }
 * Revoga o acesso de um email.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email é obrigatório" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    const supabase = createSupabaseAdmin()

    const { error } = await supabase
      .from("approved_emails")
      .update({ approved: false, updated_at: new Date().toISOString() })
      .eq("email", normalizedEmail)

    if (error) {
      console.error("Revoke email error:", error)
      return NextResponse.json(
        { error: "Erro ao revogar email" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      approved: false
    })
  } catch (error) {
    console.error("Revoke email error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/approve-email
 * Lista todos os emails aprovados.
 */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin()

    const { data, error } = await supabase
      .from("approved_emails")
      .select("email, approved, created_at, updated_at")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("List emails error:", error)
      return NextResponse.json(
        { error: "Erro ao listar emails" },
        { status: 500 }
      )
    }

    return NextResponse.json({ emails: data })
  } catch (error) {
    console.error("List emails error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
