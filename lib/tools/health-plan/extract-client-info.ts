/**
 * Tool: extractClientInfo
 *
 * Extrai informações estruturadas do cliente usando GPT-4o
 * com structured output e validação via Zod
 *
 * Referência: PRD RF-002 (linhas 56-77)
 */

import OpenAI from "openai"
import {
  ClientInfoSchema,
  PartialClientInfoSchema,
  calculateCompleteness,
  type PartialClientInfo
} from "./schemas/client-info-schema"
import {
  parseClientInfo,
  detectMissingFields,
  getNextFieldToCollect,
  mergeClientInfo,
  validateClientInfoComplete,
  validateBusinessRules
} from "./validators/missing-fields-detector"
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_MODEL_CONFIG,
  buildExtractionPrompt
} from "./prompts/extraction-prompts"
import type {
  ExtractClientInfoParams,
  ExtractClientInfoResponse
} from "./types"

/**
 * Tool principal para extração de informações do cliente
 *
 * @param params - Parâmetros incluindo mensagens e informações atuais
 * @param apiKey - OpenAI API key
 * @returns Informações extraídas, campos faltantes e status de completude
 */
export async function extractClientInfo(
  params: ExtractClientInfoParams,
  apiKey: string
): Promise<ExtractClientInfoResponse> {
  console.log("[extract-client-info] ========================================")
  console.log("[extract-client-info] 📋 extractClientInfo called")
  console.log(
    "[extract-client-info] 📨 Messages count:",
    params.messages?.length || 0
  )
  console.log(
    "[extract-client-info] 📝 Has current info:",
    !!params.currentInfo
  )

  try {
    // 1. Configurar OpenAI client
    console.log("[extract-client-info] 🔧 Configuring OpenAI client...")
    const openai = new OpenAI({
      apiKey: apiKey
    })

    // 2. Construir prompt com histórico de conversa
    const messages = buildExtractionPrompt(params.messages)

    // 3. Adicionar instrução final para extrair
    messages.push({
      role: "user",
      content:
        "Com base na conversa acima, extraia todas as informações disponíveis do cliente em formato JSON estruturado. Se alguma informação obrigatória estiver faltando, retorne null para esse campo."
    })

    // 4. Chamar GPT-4o com structured output
    console.log(
      "[extract-client-info] 🤖 Calling GPT-4o with model:",
      EXTRACTION_MODEL_CONFIG.model
    )
    const response = await openai.chat.completions.create({
      model: EXTRACTION_MODEL_CONFIG.model,
      messages: messages,
      temperature: EXTRACTION_MODEL_CONFIG.temperature,
      max_tokens: EXTRACTION_MODEL_CONFIG.maxTokens,
      response_format: EXTRACTION_MODEL_CONFIG.responseFormat
    })

    console.log("[extract-client-info] ✅ GPT-4o response received:", {
      tokensUsed: response.usage?.total_tokens,
      finishReason: response.choices[0]?.finish_reason
    })

    // 5. Extrair resposta
    const rawResponse = response.choices[0]?.message?.content

    if (!rawResponse) {
      console.error("[extract-client-info] ❌ GPT-4o returned empty response")
      throw new Error("GPT-4o não retornou resposta válida")
    }

    console.log(
      "[extract-client-info] 📄 Raw response length:",
      rawResponse.length
    )

    // 6. Parse e validação
    console.log("[extract-client-info] 🔍 Parsing response...")
    const parseResult = parseClientInfo(rawResponse)

    if (!parseResult.success || !parseResult.data) {
      throw new Error(
        `Erro ao validar resposta: ${parseResult.errors?.join(", ")}`
      )
    }

    let clientInfo = parseResult.data

    // 7. Merge com informações existentes (se houver)
    if (params.currentInfo) {
      clientInfo = mergeClientInfo(params.currentInfo, clientInfo)
    }

    // 8. Detectar campos faltantes
    const missingFields = detectMissingFields(clientInfo)
    const missingFieldLabels = missingFields.map(f => f.label)

    // 9. Verificar se está completo
    const isComplete = validateClientInfoComplete(clientInfo)

    // 10. Calcular completude
    const completeness = calculateCompleteness(clientInfo)

    // 11. Gerar próxima pergunta (se aplicável)
    let nextQuestion: string | undefined

    if (!isComplete) {
      const nextField = getNextFieldToCollect(clientInfo)

      if (nextField) {
        nextQuestion = await generateNextQuestion(
          nextField.field,
          clientInfo,
          openai
        )
      }
    }

    // 12. Validar regras de negócio (warnings não bloqueantes)
    const warnings = validateBusinessRules(clientInfo)

    // 13. Adicionar metadata
    const enrichedClientInfo: PartialClientInfo = {
      ...clientInfo,
      metadata: {
        extractedAt: new Date().toISOString(),
        schemaVersion: "1.0",
        completeness
      }
    }

    console.log("[extract-client-info] ✅ Extraction complete:", {
      isComplete,
      completeness,
      missingFieldsCount: missingFieldLabels.length,
      hasNextQuestion: !!nextQuestion,
      warningsCount: warnings.length
    })

    return {
      clientInfo: enrichedClientInfo,
      missingFields: missingFieldLabels,
      isComplete,
      completeness,
      nextQuestion
    }
  } catch (error) {
    console.error("[extract-client-info] ❌ Error:", error)

    throw new Error(
      `Falha ao extrair informações do cliente: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Gera próxima pergunta contextual para coletar campo faltante
 *
 * @param field - Campo que precisa ser coletado
 * @param currentInfo - Informações já coletadas
 * @param openai - OpenAI client
 * @returns Pergunta natural e empática
 */
async function generateNextQuestion(
  field: string,
  currentInfo: PartialClientInfo,
  openai: OpenAI
): Promise<string> {
  const questionPrompts: Record<string, string> = {
    age: "Para começar, preciso saber: quantos anos você tem?",
    city: "Em qual cidade você mora?",
    state: "E em qual estado você reside?",
    budget:
      "Quanto você pode investir mensalmente no plano de saúde? (valor aproximado)",
    dependents:
      "Você vai incluir dependentes no plano? Se sim, pode me contar sobre eles?",
    preExistingConditions:
      "Você ou alguém da sua família tem alguma condição de saúde pré-existente que eu deva saber?",
    medications: "Alguém faz uso de medicamentos de forma contínua? Quais?",
    preferences:
      "Você tem alguma preferência específica? Por exemplo, rede credenciada ampla ou restrita, aceitação de coparticipação, hospitais específicos..."
  }

  // Retornar pergunta pré-definida se existir
  if (questionPrompts[field]) {
    return questionPrompts[field]
  }

  // Caso contrário, gerar pergunta contextual com GPT
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente empático que está coletando informações para recomendação de planos de saúde. Gere uma pergunta natural e amigável para coletar a informação solicitada."
        },
        {
          role: "user",
          content: `Preciso coletar a informação: "${field}". Informações já coletadas: ${JSON.stringify(currentInfo)}. Gere uma pergunta natural e empática.`
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    })

    return (
      response.choices[0]?.message?.content ||
      "Pode me fornecer mais algumas informações?"
    )
  } catch (error) {
    console.error("[generateNextQuestion] Error:", error)
    return "Pode me fornecer mais algumas informações?"
  }
}

/**
 * Cria schema de function calling para registro da tool no OpenAI
 *
 * Este schema é usado quando a tool é registrada como uma função
 * que o GPT pode chamar durante a conversa
 */
export const extractClientInfoFunctionSchema: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: "extractClientInfo",
      description:
        "Extrai informações estruturadas do cliente a partir da conversa para recomendação de planos de saúde. Use quando o usuário fornecer informações pessoais, médicas ou de orçamento.",
      parameters: {
        type: "object",
        properties: {
          age: {
            type: "number",
            description: "Idade do titular do plano"
          },
          city: {
            type: "string",
            description: "Cidade onde o cliente mora"
          },
          state: {
            type: "string",
            description: "Sigla do estado (ex: SP, RJ, MG)"
          },
          budget: {
            type: "number",
            description: "Orçamento mensal disponível em reais"
          },
          dependents: {
            type: "array",
            description: "Lista de dependentes a serem incluídos no plano",
            items: {
              type: "object",
              properties: {
                relationship: {
                  type: "string",
                  enum: ["spouse", "child", "parent", "other"],
                  description: "Relação do dependente com o titular"
                },
                age: {
                  type: "number",
                  description: "Idade do dependente"
                }
              },
              required: ["relationship", "age"]
            }
          },
          preExistingConditions: {
            type: "array",
            description: "Condições de saúde pré-existentes declaradas",
            items: {
              type: "string"
            }
          },
          medications: {
            type: "array",
            description: "Medicamentos de uso contínuo",
            items: {
              type: "string"
            }
          },
          preferences: {
            type: "object",
            description: "Preferências do cliente para o plano",
            properties: {
              networkType: {
                type: "string",
                enum: ["broad", "restricted"],
                description: "Tipo de rede credenciada preferida"
              },
              coParticipation: {
                type: "boolean",
                description: "Aceita planos com coparticipação"
              },
              specificHospitals: {
                type: "array",
                description: "Hospitais específicos desejados",
                items: {
                  type: "string"
                }
              }
            }
          }
        },
        required: ["age", "city", "state", "budget"]
      }
    }
  }

/**
 * Wrapper simplificado para uso em API routes
 *
 * @param messages - Histórico de mensagens da conversa
 * @param apiKey - OpenAI API key
 * @param currentInfo - Informações já coletadas (opcional)
 * @returns ExtractClientInfoResponse
 */
export async function extractFromConversation(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  apiKey: string,
  currentInfo?: PartialClientInfo
): Promise<ExtractClientInfoResponse> {
  return extractClientInfo(
    {
      messages,
      currentInfo
    },
    apiKey
  )
}
