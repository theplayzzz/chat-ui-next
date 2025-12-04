/**
 * Capacidade: updateClientInfo
 *
 * Atualiza/coleta informações do cliente.
 * Pode ser chamada múltiplas vezes, em qualquer momento.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-003
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"

/**
 * Gera resposta de coleta de dados baseada no que falta
 */
function generateDataCollectionResponse(state: HealthPlanState): string {
  const clientInfo = state.clientInfo || {}
  const missing: string[] = []

  // Verificar campos obrigatórios
  if (!clientInfo.age) missing.push("sua idade")
  if (!clientInfo.city && !clientInfo.state)
    missing.push("onde você mora (cidade/estado)")

  // Campos importantes mas não obrigatórios
  const hasBasicInfo = clientInfo.age && (clientInfo.city || clientInfo.state)

  if (!hasBasicInfo) {
    // Primeira coleta - pedir informações básicas
    if (missing.length > 0) {
      return `Para encontrar os melhores planos de saúde para você, preciso de algumas informações. Pode me dizer ${missing.join(" e ")}?`
    }
    return "Por favor, me conte um pouco sobre você: qual sua idade e onde mora?"
  }

  // Já tem informações básicas - perguntar sobre detalhes
  const details: string[] = []
  if (clientInfo.dependents === undefined)
    details.push("se tem dependentes (cônjuge, filhos)")
  if (!clientInfo.budget) details.push("qual seu orçamento mensal")

  if (details.length > 0) {
    return `Ótimo! Já tenho suas informações básicas. Agora me conte: ${details.join(" e ")}?`
  }

  // Tem tudo - confirmar
  const summary = []
  if (clientInfo.age) summary.push(`${clientInfo.age} anos`)
  if (clientInfo.city) summary.push(clientInfo.city)
  if (clientInfo.state) summary.push(clientInfo.state)
  if (clientInfo.dependents?.length)
    summary.push(`${clientInfo.dependents.length} dependente(s)`)
  if (clientInfo.budget) summary.push(`orçamento R$${clientInfo.budget}`)

  return `Perfeito! Tenho suas informações: ${summary.join(", ")}. Posso buscar planos de saúde compatíveis com seu perfil. Deseja que eu faça a busca?`
}

/**
 * Atualiza informações do cliente no estado
 * TODO: Implementar extração de dados da mensagem (Fase 5)
 */
export async function updateClientInfo(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  // Gerar resposta baseada no que falta coletar
  const response = generateDataCollectionResponse(state)

  console.log("[updateClientInfo] Collecting/updating client data")

  // BUG FIX (Task 22.9): Adicionar AIMessage ao histórico para persistência
  return {
    currentResponse: response,
    messages: [new AIMessage(response)]
  }
}
