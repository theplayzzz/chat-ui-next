/**
 * RAG Prompts - Prompts para RAG Simplificado
 *
 * Prompt otimizado para grading com contexto enriquecido.
 * O prompt principal está inline no grade-documents.ts para melhor manutenção.
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 */

// Este arquivo mantém apenas constantes e helpers que podem ser usados
// em outros módulos. O prompt principal de grading está definido
// diretamente em grade-documents.ts para facilitar a manutenção.

/** Temperatura para grading */
export const GRADING_TEMPERATURE = 0.1

/**
 * Formata informações do cliente para prompt
 * @deprecated Use formatClientInfo de grade-documents.ts
 */
export function formatClientInfoForPrompt(clientInfo: {
  age?: number
  city?: string
  state?: string
  budget?: number
  dependents?: Array<{ age?: number; relationship?: string }>
  preExistingConditions?: string[]
  preferences?: string[]
}): string {
  const parts: string[] = []

  if (clientInfo.age !== undefined) {
    parts.push(`- **Idade:** ${clientInfo.age} anos`)
  }

  if (clientInfo.city || clientInfo.state) {
    const location = [clientInfo.city, clientInfo.state]
      .filter(Boolean)
      .join(", ")
    parts.push(`- **Localização:** ${location}`)
  }

  if (clientInfo.budget !== undefined) {
    parts.push(
      `- **Orçamento:** até R$ ${clientInfo.budget.toLocaleString("pt-BR")}/mês`
    )
  }

  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const depsDescriptions = clientInfo.dependents.map(dep => {
      const depParts = []
      if (dep.relationship) depParts.push(dep.relationship)
      if (dep.age !== undefined) depParts.push(`${dep.age} anos`)
      return depParts.join(" de ") || "dependente"
    })
    parts.push(`- **Dependentes:** ${depsDescriptions.join(", ")}`)
  }

  if (
    clientInfo.preExistingConditions &&
    clientInfo.preExistingConditions.length > 0
  ) {
    parts.push(
      `- **Condições pré-existentes:** ${clientInfo.preExistingConditions.join(", ")}`
    )
  }

  if (clientInfo.preferences && clientInfo.preferences.length > 0) {
    parts.push(`- **Preferências:** ${clientInfo.preferences.join(", ")}`)
  }

  if (parts.length === 0) {
    return "Nenhuma informação específica do cliente disponível"
  }

  return parts.join("\n")
}
