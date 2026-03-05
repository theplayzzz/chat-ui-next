import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next")

  if (code) {
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("has_onboarded")
        .eq("user_id", data.session.user.id)
        .single()

      if (profile && !profile.has_onboarded) {
        return NextResponse.redirect(new URL("/setup", requestUrl.origin))
      }

      const { data: homeWorkspace } = await supabase
        .from("workspaces")
        .select("id")
        .eq("user_id", data.session.user.id)
        .eq("is_home", true)
        .single()

      if (homeWorkspace) {
        return NextResponse.redirect(
          new URL(`/${homeWorkspace.id}/chat`, requestUrl.origin)
        )
      }
    }
  }

  if (next) {
    return NextResponse.redirect(new URL(next, requestUrl.origin))
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin))
}
