#!/usr/bin/env npx tsx
/**
 * Script para popular plan_metadata nos file_items existentes
 *
 * PRD Referência: .taskmaster/docs/agentic-rag-implementation-prd.md (Fase 6A.1)
 *
 * Regras de classificação por nome de arquivo:
 * - "planos_com_" → product (documentos de planos específicos)
 * - "atendimento_" → faq (FAQ e atendimento)
 * - Outros → general (documentação geral)
 *
 * Uso:
 *   npx tsx scripts/populate-plan-metadata.ts [--dry-run]
 */

import { createClient } from "@supabase/supabase-js"

// Configuração Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Tipos de documento conforme PRD
type DocumentType = "general" | "operator" | "product" | "clause" | "faq"

interface PlanMetadata {
  documentType: DocumentType
  operator?: string
  planCode?: string
  tags: string[]
  version: string
}

interface FileInfo {
  id: string
  name: string
}

interface FileItem {
  id: string
  file_id: string
  content: string
  files: FileInfo | FileInfo[]
}

/**
 * Classifica o documento baseado no nome do arquivo
 */
function classifyDocument(fileName: string): PlanMetadata {
  const lowerName = fileName.toLowerCase()

  // Extrair operadora do nome do arquivo se presente
  let operator: string | undefined
  let documentType: DocumentType = "general"
  const tags: string[] = []

  // Regra: planos_com_* → product
  if (lowerName.includes("planos_com_")) {
    documentType = "product"
    tags.push("plano", "produto")

    // Extrair operadora do nome (ex: planos_com_einstein → Einstein)
    const match = lowerName.match(/planos_com_([a-z0-9_]+)/)
    if (match) {
      operator = match[1].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      tags.push(operator.toLowerCase())
    }
  }
  // Regra: atendimento_* → faq
  else if (lowerName.includes("atendimento_")) {
    documentType = "faq"
    tags.push("atendimento", "faq", "suporte")
  }
  // Regra: clausula_*, contrato_* → clause
  else if (lowerName.includes("clausula_") || lowerName.includes("contrato_")) {
    documentType = "clause"
    tags.push("cláusula", "contrato", "legal")
  }
  // Regra: operadora_*, unimed_*, amil_*, etc → operator
  else if (
    lowerName.includes("operadora_") ||
    lowerName.includes("unimed") ||
    lowerName.includes("amil") ||
    lowerName.includes("bradesco") ||
    lowerName.includes("sulamerica")
  ) {
    documentType = "operator"
    tags.push("operadora")

    // Tentar extrair nome da operadora
    const operadoras = ["unimed", "amil", "bradesco", "sulamerica", "hapvida", "notredame"]
    for (const op of operadoras) {
      if (lowerName.includes(op)) {
        operator = op.charAt(0).toUpperCase() + op.slice(1)
        tags.push(op)
        break
      }
    }
  }
  // Padrão: general
  else {
    documentType = "general"
    tags.push("geral", "documentação")
  }

  // Extrair ano do nome se presente (ex: 2025)
  const yearMatch = lowerName.match(/20\d{2}/)
  if (yearMatch) {
    tags.push(yearMatch[0])
  }

  return {
    documentType,
    operator,
    planCode: undefined, // Pode ser extraído do conteúdo em iterações futuras
    tags,
    version: "1.0"
  }
}

async function populatePlanMetadata(dryRun: boolean = false): Promise<void> {
  console.log(`\n🚀 Iniciando população de plan_metadata... ${dryRun ? "(DRY RUN)" : ""}\n`)

  // Buscar todos os file_items com informações do arquivo pai
  const { data: fileItems, error: fetchError } = await supabase
    .from("file_items")
    .select(`
      id,
      file_id,
      content,
      files!inner (
        id,
        name
      )
    `)
    .is("plan_metadata", null)

  if (fetchError) {
    console.error("❌ Erro ao buscar file_items:", fetchError.message)
    process.exit(1)
  }

  if (!fileItems || fileItems.length === 0) {
    console.log("✅ Todos os chunks já possuem plan_metadata!")
    return
  }

  console.log(`📊 Encontrados ${fileItems.length} chunks sem plan_metadata\n`)

  // Estatísticas
  const stats: Record<DocumentType, number> = {
    general: 0,
    operator: 0,
    product: 0,
    clause: 0,
    faq: 0
  }

  let updated = 0
  let errors = 0

  // Processar cada file_item
  for (const item of fileItems as FileItem[]) {
    const fileObj = Array.isArray(item.files) ? item.files[0] : item.files
    const fileName = fileObj?.name || "unknown"
    const metadata = classifyDocument(fileName)

    stats[metadata.documentType]++

    if (dryRun) {
      console.log(`  [DRY] ${fileName} → ${metadata.documentType} (tags: ${metadata.tags.join(", ")})`)
      continue
    }

    // Atualizar no banco
    const { error: updateError } = await supabase
      .from("file_items")
      .update({ plan_metadata: metadata })
      .eq("id", item.id)

    if (updateError) {
      console.error(`  ❌ Erro ao atualizar ${item.id}: ${updateError.message}`)
      errors++
    } else {
      updated++
    }
  }

  // Relatório final
  console.log("\n" + "=".repeat(50))
  console.log("📋 RELATÓRIO")
  console.log("=".repeat(50))
  console.log("\nDistribuição por tipo:")
  for (const [type, count] of Object.entries(stats)) {
    console.log(`  - ${type}: ${count} chunks`)
  }

  if (!dryRun) {
    console.log(`\n✅ Atualizados: ${updated}`)
    if (errors > 0) {
      console.log(`❌ Erros: ${errors}`)
    }
  } else {
    console.log("\n⚠️  Modo DRY RUN - nenhuma alteração foi feita")
  }
}

// Main
const dryRun = process.argv.includes("--dry-run")
populatePlanMetadata(dryRun)
  .then(() => {
    console.log("\n✨ Concluído!\n")
    process.exit(0)
  })
  .catch(err => {
    console.error("❌ Erro fatal:", err)
    process.exit(1)
  })
