import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkPlans() {
  // Buscar todos os file_items para ver os metadados de preço
  const { data: items, error } = await supabase
    .from("file_items")
    .select("id, content, metadata")
    .limit(30)

  if (error) {
    console.error("Erro:", error)
    return
  }

  console.log("=== FILE_ITEMS COM METADADOS DE PLANOS ===\n")

  let plansWithPricing = 0
  let plansWithoutPricing = 0

  for (const item of items || []) {
    const meta = item.metadata as any
    if (meta?.plan_metadata) {
      const pm = meta.plan_metadata
      plansWithPricing++
      console.log("ID:", item.id.substring(0, 8) + "...")
      console.log("  Operadora:", pm.operator)
      console.log("  Plano:", pm.planCode)
      console.log("  Faixas de preço:", JSON.stringify(pm.ageBands))
      console.log("  Content:", item.content?.substring(0, 80) + "...")
      console.log("")
    } else {
      plansWithoutPricing++
    }
  }

  console.log("\n=== RESUMO ===")
  console.log("Com plan_metadata:", plansWithPricing)
  console.log("Sem plan_metadata:", plansWithoutPricing)

  // Verificar especificamente planos compatíveis com R$500 para 35 anos
  console.log("\n=== PLANOS COMPATÍVEIS COM R$500 (35 anos, Faixa 2: 29-33 ou 34-38) ===\n")

  for (const item of items || []) {
    const meta = item.metadata as any
    if (meta?.plan_metadata?.ageBands) {
      const pm = meta.plan_metadata
      // Faixa 2 seria para 35 anos
      const faixa2 = pm.ageBands["2"] || pm.ageBands["faixa_2"]
      if (faixa2 && faixa2 <= 500) {
        console.log(`✅ ${pm.operator} - ${pm.planCode}: R$${faixa2} (Faixa 2)`)
      } else if (faixa2) {
        console.log(`❌ ${pm.operator} - ${pm.planCode}: R$${faixa2} (Faixa 2) - ACIMA DO ORÇAMENTO`)
      }
    }
  }
}

checkPlans()
