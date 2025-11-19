import { z } from "zod"
import {
  FamilyProfile,
  PriceBreakdown,
  PricingModel
} from "@/lib/tools/health-plan/types"
import { ERPPriceItem } from "@/lib/tools/health-plan/schemas/erp-response-schema"

/**
 * Validation schemas for pricing inputs
 */
const FamilyProfileSchema = z.object({
  titular: z.object({
    idade: z.number().int().min(0).max(120)
  }),
  dependentes: z.array(
    z.object({
      relacao: z.enum(["conjuge", "filho", "pai", "mae", "outro"]),
      idade: z.number().int().min(0).max(120)
    })
  )
})

/**
 * Calculate family pricing from ERP data
 * @param erpData - Price data from ERP API
 * @param familyProfile - Family composition with ages
 * @param model - Pricing model to use
 * @returns Detailed price breakdown
 */
export function calculateFamilyPrice(
  erpData: ERPPriceItem,
  familyProfile: FamilyProfile,
  model: PricingModel = "por_pessoa"
): PriceBreakdown {
  // Validate inputs
  const validationResult = FamilyProfileSchema.safeParse(familyProfile)
  if (!validationResult.success) {
    throw new Error(`Invalid family profile: ${validationResult.error.message}`)
  }

  // Select calculation strategy based on pricing model
  switch (model) {
    case "familia_unica":
      return calculateFamiliaUnica(erpData, familyProfile)

    case "por_pessoa":
      return calculatePorPessoa(erpData, familyProfile)

    case "faixa_etaria":
      return calculateFaixaEtaria(erpData, familyProfile)

    default:
      throw new Error(`Unknown pricing model: ${model}`)
  }
}

/**
 * Model 1: Fixed family price regardless of size
 */
function calculateFamiliaUnica(
  erpData: ERPPriceItem,
  familyProfile: FamilyProfile
): PriceBreakdown {
  // Use the total price from ERP as-is
  const total = erpData.total
  const descontos = erpData.descontos || 0
  const subtotal = total + descontos

  // Distribute cost evenly for transparency
  const familySize = 1 + familyProfile.dependentes.length
  const costPerPerson = subtotal / familySize

  return {
    titular: costPerPerson,
    dependentes: familyProfile.dependentes.map(dep => ({
      relacao: dep.relacao,
      idade: dep.idade,
      preco: costPerPerson
    })),
    subtotal,
    descontos,
    total,
    model: "familia_unica"
  }
}

/**
 * Model 2: Sum of individual prices per person
 */
function calculatePorPessoa(
  erpData: ERPPriceItem,
  familyProfile: FamilyProfile
): PriceBreakdown {
  // Titular price
  const titularPrice = erpData.titular

  // Calculate dependent prices
  let dependentesTotal = 0
  const dependentesPrices = familyProfile.dependentes.map((dep, index) => {
    // Try to find specific price for this dependent from ERP data
    let price: number

    if (
      erpData.dependentes &&
      erpData.dependentes.length > index &&
      erpData.dependentes[index].idade === dep.idade
    ) {
      // Use ERP-provided price for this specific dependent
      price = erpData.dependentes[index].preco
    } else if (erpData.dependentes && erpData.dependentes.length > 0) {
      // Find closest age match in ERP data
      price = findClosestAgePrice(dep.idade, erpData.dependentes)
    } else {
      // Fallback: Use titular price as base (common practice)
      price = titularPrice
    }

    dependentesTotal += price

    return {
      relacao: dep.relacao,
      idade: dep.idade,
      preco: price
    }
  })

  const subtotal = titularPrice + dependentesTotal
  const descontos = erpData.descontos || 0
  const total = subtotal - descontos

  return {
    titular: titularPrice,
    dependentes: dependentesPrices,
    subtotal,
    descontos,
    total,
    model: "por_pessoa"
  }
}

/**
 * Model 3: Price based on age ranges
 */
function calculateFaixaEtaria(
  erpData: ERPPriceItem,
  familyProfile: FamilyProfile
): PriceBreakdown {
  // Similar to por_pessoa but with explicit age-based lookup
  const titularPrice = erpData.titular

  const dependentesPrices = familyProfile.dependentes.map(dep => {
    // Find price for this age from ERP data
    const price = findPriceByAge(dep.idade, erpData)

    return {
      relacao: dep.relacao,
      idade: dep.idade,
      preco: price
    }
  })

  const dependentesTotal = dependentesPrices.reduce(
    (sum, dep) => sum + dep.preco,
    0
  )
  const subtotal = titularPrice + dependentesTotal
  const descontos = erpData.descontos || 0
  const total = subtotal - descontos

  return {
    titular: titularPrice,
    dependentes: dependentesPrices,
    subtotal,
    descontos,
    total,
    model: "faixa_etaria"
  }
}

/**
 * Find price for a specific age from ERP dependente data
 */
function findPriceByAge(idade: number, erpData: ERPPriceItem): number {
  if (!erpData.dependentes || erpData.dependentes.length === 0) {
    // No age-specific data, use titular price
    return erpData.titular
  }

  // Try exact match first
  const exactMatch = erpData.dependentes.find(dep => dep.idade === idade)
  if (exactMatch) {
    return exactMatch.preco
  }

  // Find closest age
  return findClosestAgePrice(idade, erpData.dependentes)
}

/**
 * Find the closest age match in dependent prices
 */
function findClosestAgePrice(
  targetAge: number,
  dependentes: Array<{ idade: number; preco: number }>
): number {
  if (dependentes.length === 0) {
    throw new Error("No dependent price data available")
  }

  // Sort by age proximity
  const sorted = [...dependentes].sort((a, b) => {
    const diffA = Math.abs(a.idade - targetAge)
    const diffB = Math.abs(b.idade - targetAge)
    return diffA - diffB
  })

  return sorted[0].preco
}

/**
 * Validate that calculated total matches expected total (with tolerance for rounding)
 */
export function validatePriceBreakdown(
  breakdown: PriceBreakdown,
  tolerance: number = 0.01
): boolean {
  const calculatedSubtotal =
    breakdown.titular +
    breakdown.dependentes.reduce((sum, dep) => sum + dep.preco, 0)

  const diff = Math.abs(calculatedSubtotal - breakdown.subtotal)

  return diff <= tolerance
}

/**
 * Format price breakdown for display
 */
export function formatPriceBreakdown(breakdown: PriceBreakdown): string {
  const lines: string[] = []

  lines.push(`Titular: R$ ${breakdown.titular.toFixed(2)}`)

  breakdown.dependentes.forEach((dep, index) => {
    lines.push(
      `Dependente ${index + 1} (${dep.relacao}, ${dep.idade} anos): R$ ${dep.preco.toFixed(2)}`
    )
  })

  lines.push(`Subtotal: R$ ${breakdown.subtotal.toFixed(2)}`)

  if (breakdown.descontos > 0) {
    lines.push(`Descontos: -R$ ${breakdown.descontos.toFixed(2)}`)
  }

  lines.push(`Total: R$ ${breakdown.total.toFixed(2)}`)
  lines.push(`Modelo: ${breakdown.model}`)

  return lines.join("\n")
}
