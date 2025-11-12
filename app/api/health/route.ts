import { NextResponse } from "next/server"
import OpenAI from "openai"

// Forçar uso do Node.js runtime para acessar variáveis de ambiente
export const runtime = "nodejs"

/**
 * Endpoint de verificação de status do agente
 * GET /api/health
 *
 * Verifica se:
 * - OPENAI_API_KEY está configurada
 * - Conexão com OpenAI API está funcionando
 * - Modelo de embeddings está disponível
 */
export async function GET() {
  const startTime = Date.now()

  try {
    // Verificar se OPENAI_API_KEY está configurada
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          status: "error",
          message: "OPENAI_API_KEY não configurada",
          agent: "health-plan-agent",
          timestamp: new Date().toISOString(),
          responseTime: `${Date.now() - startTime}ms`
        },
        { status: 500 }
      )
    }

    // Criar cliente OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    // Testar conexão listando modelos
    const modelsResponse = await openai.models.list()
    const models = modelsResponse.data

    // Verificar se modelo de embeddings está disponível
    const embeddingModels = models.filter(model =>
      model.id.includes("text-embedding")
    )

    const hasTextEmbedding3Small = models.some(
      model => model.id === "text-embedding-3-small"
    )

    // Verificar se modelo GPT-4o está disponível (para o agente)
    const hasGPT4o = models.some(
      model => model.id === "gpt-4o" || model.id.startsWith("gpt-4o-")
    )

    const responseTime = Date.now() - startTime

    // Retornar status de sucesso
    return NextResponse.json(
      {
        status: "ok",
        message: "Agente de planos de saúde operacional",
        agent: "health-plan-agent",
        services: {
          openai: {
            status: "connected",
            modelsAvailable: models.length,
            embeddingModels: embeddingModels.length,
            textEmbedding3Small: hasTextEmbedding3Small
              ? "available"
              : "unavailable",
            gpt4o: hasGPT4o ? "available" : "unavailable"
          }
        },
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    )
  } catch (error) {
    const responseTime = Date.now() - startTime

    console.error("Health check failed:", error)

    // Tratamento de erros da OpenAI
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        {
          status: "error",
          message: `Erro na API OpenAI: ${error.message}`,
          agent: "health-plan-agent",
          error: {
            type: "openai_api_error",
            code: error.code,
            statusCode: error.status
          },
          timestamp: new Date().toISOString(),
          responseTime: `${responseTime}ms`
        },
        { status: 503 }
      )
    }

    // Outros erros
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Erro desconhecido",
        agent: "health-plan-agent",
        error: {
          type: "unknown_error"
        },
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`
      },
      { status: 503 }
    )
  }
}
