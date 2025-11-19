import { z } from "zod"

/**
 * Schema for individual dependent pricing
 */
export const ERPDependentePriceSchema = z.object({
  idade: z.number().int().min(0).max(120),
  preco: z.number().positive()
})

/**
 * Schema for a single plan's price data from ERP
 */
export const ERPPriceItemSchema = z.object({
  planId: z.string().min(1),
  titular: z.number().positive(),
  dependentes: z.array(ERPDependentePriceSchema).optional().default([]),
  descontos: z.number().optional().default(0),
  total: z.number().positive()
})

/**
 * Schema for the complete ERP API response
 */
export const ERPResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(ERPPriceItemSchema),
  timestamp: z.string().datetime()
})

/**
 * Inferred types from schemas
 */
export type ERPDependentePrice = z.infer<typeof ERPDependentePriceSchema>
export type ERPPriceItem = z.infer<typeof ERPPriceItemSchema>
export type ERPResponse = z.infer<typeof ERPResponseSchema>
