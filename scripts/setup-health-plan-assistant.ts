/**
 * Script para criar o Assistente de Planos de Saúde
 *
 * Este script cria um assistente especializado com:
 * - Nome: "Agente de Planos de Saúde"
 * - Modelo: GPT-4o
 * - Temperatura: 0.3
 * - Prompt especializado
 * - Associação com collections de tipo 'health_plan'
 *
 * Uso: npx tsx scripts/setup-health-plan-assistant.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Erro: Variáveis de ambiente não configuradas")
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Ler o prompt do arquivo
const promptPath = path.join(
  __dirname,
  "../.taskmaster/docs/health-plan-agent-prompt.txt"
)
const assistantPrompt = fs.readFileSync(promptPath, "utf-8")

async function setupHealthPlanAssistant() {
  console.log("🏥 Configurando Assistente de Planos de Saúde...\n")

  try {
    // 1. Obter usuário admin (primeiro usuário do sistema)
    console.log("1️⃣  Buscando usuário admin...")
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()

    if (usersError || !users || users.users.length === 0) {
      throw new Error("Nenhum usuário encontrado no sistema")
    }

    const adminUser = users.users[0]
    console.log(`   ✅ Usuário encontrado: ${adminUser.email}`)

    // 2. Obter workspace home do admin
    console.log("\n2️⃣  Buscando workspace home...")
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("user_id", adminUser.id)
      .eq("is_home", true)
      .single()

    if (workspaceError || !workspace) {
      throw new Error("Workspace home não encontrado")
    }

    console.log(`   ✅ Workspace encontrado: ${workspace.name}`)

    // 3. Verificar se já existe assistente com este nome
    console.log("\n3️⃣  Verificando assistentes existentes...")
    const { data: existingAssistants } = await supabase
      .from("assistants")
      .select("id, name")
      .eq("name", "Agente de Planos de Saúde")
      .eq("user_id", adminUser.id)

    if (existingAssistants && existingAssistants.length > 0) {
      console.log("   ⚠️  Assistente já existe:")
      console.log(`   ID: ${existingAssistants[0].id}`)
      console.log(`   Nome: ${existingAssistants[0].name}`)
      console.log("\n   Para recriar, delete o assistente existente primeiro.")
      return
    }

    console.log("   ✅ Nenhum assistente duplicado encontrado")

    // 4. Criar assistente
    console.log("\n4️⃣  Criando assistente...")
    const { data: assistant, error: assistantError } = await supabase
      .from("assistants")
      .insert({
        user_id: adminUser.id,
        name: "Agente de Planos de Saúde",
        description: "Assistente especializado em recomendação de planos de saúde",
        model: "gpt-4o",
        temperature: 0.3,
        prompt: assistantPrompt,
        context_length: 16000,
        embeddings_provider: workspace.embeddings_provider || "openai",
        include_profile_context: false,
        include_workspace_instructions: false,
        image_path: "",
        sharing: "private"
      })
      .select()
      .single()

    if (assistantError || !assistant) {
      throw new Error(`Erro ao criar assistente: ${assistantError?.message}`)
    }

    console.log(`   ✅ Assistente criado: ${assistant.id}`)

    // 5. Criar associação com workspace
    console.log("\n5️⃣  Associando assistente ao workspace...")
    const { error: workspaceAssocError } = await supabase
      .from("assistant_workspaces")
      .insert({
        user_id: adminUser.id,
        assistant_id: assistant.id,
        workspace_id: workspace.id
      })

    if (workspaceAssocError) {
      throw new Error(
        `Erro ao associar workspace: ${workspaceAssocError.message}`
      )
    }

    console.log("   ✅ Associação com workspace criada")

    // 6. Buscar collections de planos de saúde
    console.log("\n6️⃣  Buscando collections de planos de saúde...")
    const { data: collections, error: collectionsError } = await supabase
      .from("collections")
      .select("id, name, collection_type")
      .eq("collection_type", "health_plan")

    if (collectionsError) {
      console.log(`   ⚠️  Erro ao buscar collections: ${collectionsError.message}`)
      console.log("   ⚠️  Continuando sem associar collections...")
    } else if (!collections || collections.length === 0) {
      console.log("   ⚠️  Nenhuma collection de planos de saúde encontrada")
      console.log("   ℹ️  Você pode associar collections manualmente depois")
    } else {
      console.log(`   ✅ Encontradas ${collections.length} collection(s):`)
      collections.forEach(c => console.log(`      - ${c.name}`))

      // 7. Criar associações com collections
      console.log("\n7️⃣  Associando collections ao assistente...")
      const assistantCollections = collections.map(collection => ({
        user_id: adminUser.id,
        assistant_id: assistant.id,
        collection_id: collection.id
      }))

      const { error: collAssocError } = await supabase
        .from("assistant_collections")
        .insert(assistantCollections)

      if (collAssocError) {
        console.log(
          `   ⚠️  Erro ao associar collections: ${collAssocError.message}`
        )
      } else {
        console.log(`   ✅ ${collections.length} collection(s) associada(s)`)
      }
    }

    // Resumo final
    console.log("\n" + "=".repeat(60))
    console.log("✅ ASSISTENTE CONFIGURADO COM SUCESSO!")
    console.log("=".repeat(60))
    console.log(`\n📋 Detalhes:`)
    console.log(`   ID: ${assistant.id}`)
    console.log(`   Nome: ${assistant.name}`)
    console.log(`   Modelo: ${assistant.model}`)
    console.log(`   Temperatura: ${assistant.temperature}`)
    console.log(`   Workspace: ${workspace.name}`)
    console.log(`   Collections associadas: ${collections?.length || 0}`)
    console.log(`\n🌐 Acesse o chatbot e procure por "${assistant.name}"`)
    console.log("\n✨ Pronto para uso!\n")
  } catch (error) {
    console.error("\n❌ Erro durante a configuração:")
    console.error(error)
    process.exit(1)
  }
}

// Executar
setupHealthPlanAssistant()
