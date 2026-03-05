/**
 * Capacidade: updateClientInfo
 *
 * Atualiza/coleta informações do cliente.
 * Pode ser chamada múltiplas vezes, em qualquer momento.
 *
 * PRD: .taskmaster/docs/health-plan-agent-v2-langgraph-prd.md
 * Seção: RF-003
 *
 * Task 23: Fase 5 - Coleta de Dados
 */

import { AIMessage } from "@langchain/core/messages"
import type { HealthPlanState } from "../../state/state-annotation"
import type { StateError } from "../../types"
import { humanizeResponse } from "./humanize-response"

// Importar funções existentes do v1
import {
  calculateCompleteness,
  FIELD_LABELS,
  isClientInfoComplete,
  type PartialClientInfo as V1PartialClientInfo
} from "../../../../tools/health-plan/schemas/client-info-schema"
import {
  validateBusinessRules,
  detectMissingFields,
  getNextFieldToCollect
} from "../../../../tools/health-plan/validators/missing-fields-detector"

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Threshold de completude para mostrar confirmação visual
 */
const COMPLETENESS_THRESHOLD_FOR_CONFIRMATION = 70

/**
 * Labels de relacionamentos de dependentes para exibição
 */
const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: "cônjuge",
  child: "filho(a)",
  parent: "pai/mãe",
  other: "outro"
}

/**
 * Estados brasileiros válidos
 */
const VALID_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
]

// ============================================================================
// VALIDAÇÃO DE DADOS
// ============================================================================

/**
 * Validação customizada para dados do cliente v2
 *
 * Complementa validateBusinessRules com validações específicas do v2
 */
function validateClientData(clientInfo: V1PartialClientInfo): StateError[] {
  const errors: StateError[] = []

  // Validar estado brasileiro
  if (
    clientInfo.state &&
    !VALID_STATES.includes(clientInfo.state.toUpperCase())
  ) {
    errors.push({
      capability: "updateClientInfo",
      message: `Estado "${clientInfo.state}" não reconhecido. Use a sigla (ex: SP, RJ, MG).`,
      timestamp: new Date().toISOString(),
      details: { field: "state", value: clientInfo.state, type: "warning" }
    })
  }

  // Validar idade
  if (clientInfo.age !== undefined) {
    if (clientInfo.age < 0 || clientInfo.age > 120) {
      errors.push({
        capability: "updateClientInfo",
        message: `Idade ${clientInfo.age} parece incorreta. Por favor, confirme.`,
        timestamp: new Date().toISOString(),
        details: { field: "age", value: clientInfo.age, type: "warning" }
      })
    }
  }

  // Validar budget
  if (clientInfo.budget !== undefined && clientInfo.budget <= 0) {
    errors.push({
      capability: "updateClientInfo",
      message: "Orçamento deve ser um valor positivo.",
      timestamp: new Date().toISOString(),
      details: { field: "budget", value: clientInfo.budget, type: "warning" }
    })
  }

  // Validar dependentes
  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    for (let i = 0; i < clientInfo.dependents.length; i++) {
      const dep = clientInfo.dependents[i]
      if (dep.age < 0 || dep.age > 120) {
        errors.push({
          capability: "updateClientInfo",
          message: `Idade do dependente ${i + 1} (${dep.age} anos) parece incorreta.`,
          timestamp: new Date().toISOString(),
          details: {
            field: "dependents",
            index: i,
            value: dep.age,
            type: "warning"
          }
        })
      }
    }
  }

  // Adicionar warnings de regras de negócio
  const businessWarnings = validateBusinessRules(clientInfo)
  for (const warning of businessWarnings) {
    errors.push({
      capability: "updateClientInfo",
      message: warning,
      timestamp: new Date().toISOString(),
      details: { type: "business_warning" }
    })
  }

  return errors
}

// ============================================================================
// FORMATAÇÃO DE CONFIRMAÇÃO VISUAL
// ============================================================================

/**
 * Formata dependentes para exibição
 */
function formatDependents(
  dependents: V1PartialClientInfo["dependents"]
): string {
  if (!dependents || dependents.length === 0) {
    return "Nenhum"
  }

  return dependents
    .map((dep, i) => {
      const rel = RELATIONSHIP_LABELS[dep.relationship] || dep.relationship
      // Tratar idade undefined
      const ageStr =
        dep.age !== undefined ? `${dep.age} anos` : "idade não informada"
      return `  ${i + 1}. ${rel}, ${ageStr}`
    })
    .join("\n")
}

/**
 * Formata condições pré-existentes para exibição
 */
function formatHealthConditions(conditions: string[] | undefined): string {
  if (!conditions || conditions.length === 0) {
    return "Nenhuma declarada"
  }
  return conditions.join(", ")
}

/**
 * Gera confirmação visual formatada dos dados coletados
 */
function generateConfirmationMessage(
  clientInfo: V1PartialClientInfo,
  completeness: number,
  warnings: StateError[]
): string {
  const lines: string[] = []

  lines.push("✅ **Dados coletados:**\n")

  // Dados básicos
  if (clientInfo.age !== undefined) {
    lines.push(`- **Idade:** ${clientInfo.age} anos`)
  }
  if (clientInfo.city || clientInfo.state) {
    const location = [clientInfo.city, clientInfo.state]
      .filter(Boolean)
      .join(", ")
    lines.push(`- **Localização:** ${location}`)
  }
  if (clientInfo.budget !== undefined) {
    lines.push(
      `- **Orçamento:** R$ ${clientInfo.budget.toLocaleString("pt-BR")}/mês`
    )
  }

  // Dependentes
  if (clientInfo.dependents !== undefined) {
    if (clientInfo.dependents.length > 0) {
      lines.push(`- **Dependentes:** ${clientInfo.dependents.length}`)
      lines.push(formatDependents(clientInfo.dependents))
    } else {
      lines.push("- **Dependentes:** Nenhum")
    }
  }

  // Condições de saúde
  if (
    clientInfo.preExistingConditions &&
    clientInfo.preExistingConditions.length > 0
  ) {
    lines.push(
      `- **Condições pré-existentes:** ${formatHealthConditions(clientInfo.preExistingConditions)}`
    )
  }

  // Preferências
  if (clientInfo.preferences) {
    const prefs: string[] = []
    if (clientInfo.preferences.coParticipation !== undefined) {
      prefs.push(
        clientInfo.preferences.coParticipation
          ? "Aceita coparticipação"
          : "Prefere sem coparticipação"
      )
    }
    if (clientInfo.preferences.networkType) {
      prefs.push(
        clientInfo.preferences.networkType === "broad"
          ? "Rede ampla"
          : "Rede restrita"
      )
    }
    if (prefs.length > 0) {
      lines.push(`- **Preferências:** ${prefs.join(", ")}`)
    }
  }

  // Completude
  lines.push(`\n📊 **Completude:** ${completeness}%`)

  // Warnings
  const businessWarnings = warnings.filter(
    w => w.details?.type === "business_warning"
  )
  if (businessWarnings.length > 0) {
    lines.push("\n⚠️ **Alertas:**")
    for (const warning of businessWarnings) {
      lines.push(`- ${warning.message}`)
    }
  }

  // Próximo passo
  if (isClientInfoComplete(clientInfo)) {
    lines.push(
      "\n🔍 Posso buscar planos de saúde compatíveis com seu perfil. Deseja que eu faça a busca?"
    )
  } else {
    const missingFields = detectMissingFields(clientInfo)
    const requiredMissing = missingFields.filter(f => f.isRequired)
    if (requiredMissing.length > 0) {
      const labels = requiredMissing.map(f => f.label).join(", ")
      lines.push(`\n📝 **Falta informar:** ${labels}`)
    }
  }

  return lines.join("\n")
}

// ============================================================================
// GERAÇÃO DE PERGUNTAS DE FOLLOW-UP
// ============================================================================

/**
 * Gera pergunta de follow-up contextual baseada nos dados faltantes
 */
function generateFollowUpQuestion(clientInfo: V1PartialClientInfo): string {
  const hasAnyRequired =
    clientInfo.age !== undefined ||
    clientInfo.city ||
    clientInfo.state ||
    clientInfo.budget !== undefined

  // Se não tem nenhum dado, pergunta consolidada inicial
  if (!hasAnyRequired) {
    return `Olá! Para encontrar os melhores planos de saúde para você, preciso de algumas informações básicas:

📋 **Informações necessárias:**
- Sua **idade**
- **Cidade** e **estado** onde você mora
- **Orçamento mensal** disponível para o plano

Você também pode me contar se vai incluir **dependentes** (cônjuge, filhos) ou se tem alguma **condição de saúde** que eu deva considerar.

Pode compartilhar essas informações? 😊`
  }

  // Verificar se há dependentes sem idade informada
  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const dependentsWithoutAge = clientInfo.dependents.filter(
      dep => dep.age === undefined
    )
    if (dependentsWithoutAge.length > 0) {
      const summary = generatePartialSummary(clientInfo)
      const depList = dependentsWithoutAge
        .map(dep => {
          const rel = RELATIONSHIP_LABELS[dep.relationship] || dep.relationship
          return rel
        })
        .join(", ")

      return `${summary}

Para calcular o valor do plano corretamente, preciso saber a **idade** dos dependentes:

📝 **Dependentes sem idade:** ${depList}

Qual a idade de cada um?`
    }
  }

  // Perguntas específicas por campo faltante (priorizadas)
  const nextField = getNextFieldToCollect(clientInfo)

  if (!nextField) {
    // Todos campos preenchidos - confirmar
    return generateConfirmationMessage(
      clientInfo,
      calculateCompleteness(clientInfo),
      []
    )
  }

  // Perguntas contextuais (tom de "só falta X")
  const questionsByField: Record<string, string> = {
    age: "Só falta me dizer: **quantos anos você tem**?",
    city: "E em qual **cidade** você mora?",
    state: "Qual é o **estado**? (pode ser a sigla, tipo SP, RJ, MG...)",
    budget:
      "Por último, **quanto você pode investir mensalmente** no plano? (valor aproximado em reais)",
    dependents: `Você vai incluir **dependentes** no plano?

Se sim, me conte sobre eles:
- Quantos são?
- Qual a relação (cônjuge, filho, pais)?
- Qual a idade de cada um?

Se não tiver dependentes, pode dizer "não tenho dependentes" ou "sou só eu".`,
    preExistingConditions: `Você ou alguém da sua família tem alguma **condição de saúde pré-existente** que eu deva saber?

Por exemplo: diabetes, hipertensão, cardiopatia, etc.

Se não tiver, pode dizer "nenhuma" ou "não tenho".`,
    medications: `Alguém faz uso de **medicamentos de forma contínua**?

Isso pode influenciar na cobertura do plano. Se não usar, pode dizer "não uso".`,
    preferences: `Tem alguma **preferência específica** para o plano?

Por exemplo:
- Hospitais específicos que deseja acesso
- Prefere plano com ou sem coparticipação
- Rede ampla ou restrita está ok?`
  }

  // Gerar resumo parcial + próxima pergunta
  const summary = generatePartialSummary(clientInfo)
  const question =
    questionsByField[nextField.field] || `Pode me informar ${nextField.label}?`

  if (summary) {
    return `${summary}\n\n${question}`
  }

  return question
}

/**
 * Gera resumo parcial dos dados já coletados
 */
function generatePartialSummary(clientInfo: V1PartialClientInfo): string {
  const parts: string[] = []

  if (clientInfo.age !== undefined) parts.push(`${clientInfo.age} anos`)
  if (clientInfo.city) parts.push(clientInfo.city)
  if (clientInfo.state) parts.push(clientInfo.state)
  if (clientInfo.budget !== undefined)
    parts.push(`orçamento R$${clientInfo.budget}`)
  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    parts.push(`${clientInfo.dependents.length} dependente(s)`)
  }

  if (parts.length === 0) return ""

  return `📋 Já tenho: ${parts.join(", ")}.`
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

/**
 * Atualiza informações do cliente no estado
 *
 * Fluxo:
 * 1. Orchestrator já extraiu dados via intent-classifier → state.clientInfo atualizado
 * 2. Esta capacidade valida os dados e gera resposta apropriada
 * 3. Se dados completos → confirmação visual
 * 4. Se dados incompletos → pergunta de follow-up
 * 5. Adiciona warnings de validação ao estado
 *
 * Task 23: Implementação completa da Fase 5
 */
export async function updateClientInfo(
  state: HealthPlanState
): Promise<Partial<HealthPlanState>> {
  const clientInfo = (state.clientInfo || {}) as V1PartialClientInfo
  const completeness = calculateCompleteness(clientInfo)
  const isComplete = isClientInfoComplete(clientInfo)

  console.log("[updateClientInfo] Processing client data:", {
    completeness,
    isComplete,
    fieldsPresent: Object.keys(clientInfo).filter(
      k => clientInfo[k as keyof V1PartialClientInfo] !== undefined
    ),
    clientInfoVersion: state.clientInfoVersion
  })

  // 1. Validar dados
  const validationErrors = validateClientData(clientInfo)

  if (validationErrors.length > 0) {
    console.log(
      "[updateClientInfo] Validation warnings:",
      validationErrors.map(e => e.message)
    )
  }

  // 2. Gerar resposta apropriada
  let rawResponse: string
  let messageType: "confirmation" | "follow_up_question" | "greeting"

  const hasAnyRequired =
    clientInfo.age !== undefined ||
    clientInfo.city ||
    clientInfo.state ||
    clientInfo.budget !== undefined

  if (isComplete || completeness >= COMPLETENESS_THRESHOLD_FOR_CONFIRMATION) {
    rawResponse = generateConfirmationMessage(
      clientInfo,
      completeness,
      validationErrors
    )
    messageType = "confirmation"
    console.log("[updateClientInfo] Generating confirmation message")
  } else {
    rawResponse = generateFollowUpQuestion(clientInfo)
    messageType = !hasAnyRequired ? "greeting" : "follow_up_question"
    console.log("[updateClientInfo] Generating follow-up question")
  }

  // 3. Humanizar resposta via LLM
  const humanized = await humanizeResponse({
    rawResponse,
    state,
    messageType
  })

  const response = humanized.response

  // 4. Preparar retorno
  const stateUpdate: Partial<HealthPlanState> = {
    currentResponse: response,
    messages: [new AIMessage(response)]
  }

  // 5. Adicionar warnings ao estado (se houver)
  if (validationErrors.length > 0) {
    stateUpdate.errors = validationErrors
  }

  return stateUpdate
}

// ============================================================================
// EXPORTS PARA TESTES
// ============================================================================

export {
  validateClientData,
  generateConfirmationMessage,
  generateFollowUpQuestion,
  generatePartialSummary,
  formatDependents,
  formatHealthConditions,
  COMPLETENESS_THRESHOLD_FOR_CONFIRMATION,
  VALID_STATES,
  RELATIONSHIP_LABELS
}
