import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing workspaceId" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase
      .from("chunk_tags")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name")

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch tags"
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      workspace_id,
      name,
      slug,
      description,
      weight_boost,
      parent_tag_id,
      color
    } = body

    if (!workspace_id || !name || !slug) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase
      .from("chunk_tags")
      .insert([
        {
          workspace_id,
          name,
          slug,
          description,
          weight_boost,
          parent_tag_id,
          color
        }
      ])
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create tag"
      },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "Missing tag id" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase
      .from("chunk_tags")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update tag"
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Missing tag id" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    // Check if system tag
    const { data: tag } = await supabase
      .from("chunk_tags")
      .select("is_system")
      .eq("id", id)
      .single()

    if (tag?.is_system) {
      return NextResponse.json(
        { error: "System tags cannot be deleted" },
        { status: 403 }
      )
    }

    const { error } = await supabase.from("chunk_tags").delete().eq("id", id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete tag"
      },
      { status: 500 }
    )
  }
}
