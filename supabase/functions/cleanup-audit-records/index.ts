/**
 * Supabase Edge Function: cleanup-audit-records
 * Task 13.6 - Job de limpeza automatica diaria
 *
 * Executa limpeza de registros de auditoria:
 * 1. Hard delete para workspaces com hard_delete_enabled=true
 * 2. Soft delete para workspaces sem hard_delete
 * 3. Anonimizacao progressiva (partial → full) apos X dias
 *
 * Agendamento: Cron diario as 3AM UTC
 * Comando: supabase functions deploy cleanup-audit-records
 *
 * Referencia: PRD RF-012, Task #13
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
}

interface CleanupResult {
  hard_deleted: number
  soft_deleted: number
  anonymization_upgraded: number
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Verify authorization (cron job or admin)
    const authHeader = req.headers.get("Authorization")
    const cronSecret = Deno.env.get("CRON_SECRET")

    // Allow cron jobs with secret or service role
    const isCronJob = req.headers.get("X-Cron-Secret") === cronSecret
    const isServiceRole = authHeader?.includes(
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    )

    if (!isCronJob && !isServiceRole) {
      // For manual triggers, verify admin status
      const supabaseUrl = Deno.env.get("SUPABASE_URL")
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing Supabase environment variables")
      }

      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader || "" } }
      })

      const {
        data: { user },
        error: authError
      } = await supabaseClient.auth.getUser()

      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }

      // Check if user is global admin
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("is_global_admin")
        .eq("user_id", user.id)
        .single()

      if (!profile?.is_global_admin) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Admin privileges required" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        )
      }
    }

    // Create service role client for cleanup operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase service role environment variables")
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Execute cleanup function
    const { data, error } = await supabaseAdmin.rpc("cleanup_audit_records")

    if (error) {
      console.error("[Cleanup] Error executing cleanup:", error)
      return new Response(
        JSON.stringify({
          error: "Cleanup failed",
          details: error.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      )
    }

    // Parse result
    const result: CleanupResult = Array.isArray(data) && data.length > 0
      ? data[0]
      : { hard_deleted: 0, soft_deleted: 0, anonymization_upgraded: 0 }

    const totalProcessed =
      result.hard_deleted +
      result.soft_deleted +
      result.anonymization_upgraded

    console.log(
      `[Cleanup] Completed: ${result.hard_deleted} hard deleted, ` +
        `${result.soft_deleted} soft deleted, ` +
        `${result.anonymization_upgraded} anonymization upgrades`
    )

    // NOTE: Individual operations are already logged by the SQL function cleanup_audit_records()
    // No need to insert a summary here - it would violate FK constraints anyway

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        result: {
          hard_deleted: result.hard_deleted,
          soft_deleted: result.soft_deleted,
          anonymization_upgraded: result.anonymization_upgraded,
          total_processed: totalProcessed
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )
  } catch (error: any) {
    console.error("[Cleanup] Unexpected error:", error)
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )
  }
})
