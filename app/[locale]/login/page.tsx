import { Brand } from "@/components/ui/brand"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Login"
}

export default async function Login({
  searchParams
}: {
  searchParams: { message?: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        }
      }
    }
  )
  const session = (await supabase.auth.getSession()).data.session

  if (session) {
    const { data: homeWorkspace, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("is_home", true)
      .single()

    if (!homeWorkspace) {
      throw new Error(error?.message || "Home workspace not found")
    }

    return redirect(`/${homeWorkspace.id}/chat`)
  }

  const handleLogin = async (formData: FormData) => {
    "use server"

    const email = formData.get("email") as string
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    // 1. Admin client (service role)
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 2. Criar usuário se não existe (idempotente) - qualquer email é permitido
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true
    })

    if (
      createError &&
      !createError.message.includes("already been registered")
    ) {
      console.error("Create user error:", createError)
      return redirect(
        `/login?message=${encodeURIComponent("Erro ao processar acesso. Tente novamente.")}`
      )
    }

    // 3. Gerar token + verificar server-side → sessão nos cookies
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email
      })

    if (linkError || !linkData) {
      console.error("Generate link error:", linkError)
      return redirect(
        `/login?message=${encodeURIComponent("Erro ao gerar acesso. Tente novamente.")}`
      )
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink"
    })

    if (verifyError) {
      console.error("Verify OTP error:", verifyError)
      return redirect(
        `/login?message=${encodeURIComponent("Erro ao verificar acesso. Tente novamente.")}`
      )
    }

    // 4. Redirecionar direto para o chat (onboarding é automático)
    const { data: homeWorkspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("user_id", linkData.user.id)
      .eq("is_home", true)
      .single()

    if (!homeWorkspace) {
      // Aguardar trigger criar workspace (raro, mas possível em race condition)
      return redirect(
        `/login?message=${encodeURIComponent("Conta criada. Tente entrar novamente.")}`
      )
    }

    return redirect(`/${homeWorkspace.id}/chat`)
  }

  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-2 px-8 sm:max-w-md">
      <form
        className="animate-in text-foreground flex w-full flex-1 flex-col justify-center gap-2"
        action={handleLogin}
      >
        <Brand />

        <Label className="text-md mt-4" htmlFor="email">
          Email
        </Label>
        <Input
          className="mb-6 rounded-md border bg-inherit px-4 py-2"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
        />

        <SubmitButton className="mb-2 rounded-md bg-blue-700 px-4 py-2 text-white">
          Entrar
        </SubmitButton>

        {searchParams?.message && (
          <p className="bg-foreground/10 text-foreground mt-4 p-4 text-center">
            {decodeURIComponent(searchParams.message)}
          </p>
        )}
      </form>
    </div>
  )
}
