/**
 * Script para validar a criação do assistente
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function validateAssistant() {
  console.log("🔍 Validando criação do assistente...\n")

  // 1. Verificar assistente
  const { data: assistant } = await supabase
    .from("assistants")
    .select("*")
    .eq("name", "Agente de Planos de Saúde")
    .single()

  if (!assistant) {
    console.log("❌ Assistente não encontrado!")
    return
  }

  console.log("✅ Assistente encontrado:")
  console.log(`   ID: ${assistant.id}`)
  console.log(`   Nome: ${assistant.name}`)
  console.log(`   Modelo: ${assistant.model}`)
  console.log(`   Temperatura: ${assistant.temperature}`)
  console.log(`   Prompt (primeiras 100 chars): ${assistant.prompt.substring(0, 100)}...`)

  // 2. Verificar assistant_workspaces
  console.log("\n✅ Verificando associações com workspaces...")
  const { data: workspaces } = await supabase
    .from("assistant_workspaces")
    .select("workspace_id, workspaces(name)")
    .eq("assistant_id", assistant.id)

  console.log(`   Total de workspaces: ${workspaces?.length || 0}`)
  workspaces?.forEach((w: any) => {
    console.log(`   - ${w.workspaces.name}`)
  })

  // 3. Verificar assistant_collections
  console.log("\n✅ Verificando associações com collections...")
  const { data: collections } = await supabase
    .from("assistant_collections")
    .select("collection_id, collections(name, collection_type)")
    .eq("assistant_id", assistant.id)

  console.log(`   Total de collections: ${collections?.length || 0}`)
  if (collections && collections.length > 0) {
    collections.forEach((c: any) => {
      console.log(`   - ${c.collections.name} (${c.collections.collection_type})`)
    })
  } else {
    console.log("   ℹ️  Nenhuma collection associada ainda")
  }

  // 4. Verificar collections disponíveis
  console.log("\n📊 Collections de planos de saúde disponíveis:")
  const { data: healthCollections } = await supabase
    .from("collections")
    .select("id, name, collection_type")
    .eq("collection_type", "health_plan")

  if (!healthCollections || healthCollections.length === 0) {
    console.log("   ⚠️  Nenhuma collection de tipo 'health_plan' encontrada")
    console.log("   ℹ️  Crie collections com collection_type='health_plan' para associar ao assistente")
  } else {
    console.log(`   Total disponível: ${healthCollections.length}`)
    healthCollections.forEach(c => {
      console.log(`   - ${c.name}`)
    })
  }

  console.log("\n✅ Validação concluída!")
}

validateAssistant()
