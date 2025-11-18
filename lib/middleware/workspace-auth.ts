import { NextRequest } from "next/server"
import {
  validateAssistantWorkspaceAccess,
  unauthorizedResponse
} from "@/lib/server/workspace-authorization"

/**
 * Middleware para validar acesso ao workspace e assistente
 *
 * Uso em API routes:
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const authResult = await validateWorkspaceAuthMiddleware(request)
 *   if (!authResult.isAuthorized) {
 *     return authResult.response
 *   }
 *
 *   const { userId, assistantId, workspaceId } = authResult
 *   // Continue com a lógica da API...
 * }
 * ```
 */

export interface WorkspaceAuthResult {
  isAuthorized: boolean
  userId?: string
  assistantId?: string
  workspaceId?: string
  response?: Response
  errors?: string[]
}

/**
 * Valida autorização de workspace e assistente a partir do request
 *
 * Espera JSON body com campos:
 * - assistantId: ID do assistente sendo acessado
 * - workspaceId: ID do workspace de contexto
 *
 * @param request - NextRequest da API route
 * @returns Resultado da validação com informações do usuário ou resposta de erro
 */
export async function validateWorkspaceAuthMiddleware(
  request: NextRequest
): Promise<WorkspaceAuthResult> {
  let body: any

  try {
    // Parse request body
    const text = await request.text()
    if (!text) {
      return {
        isAuthorized: false,
        response: unauthorizedResponse("Request body is required", 400),
        errors: ["Missing request body"]
      }
    }

    body = JSON.parse(text)
  } catch (error) {
    return {
      isAuthorized: false,
      response: unauthorizedResponse("Invalid JSON in request body", 400),
      errors: ["Invalid JSON format"]
    }
  }

  // Extract and validate required fields
  const { assistantId, workspaceId } = body

  if (!assistantId) {
    return {
      isAuthorized: false,
      response: unauthorizedResponse("assistantId is required", 400),
      errors: ["Missing assistantId parameter"]
    }
  }

  if (!workspaceId) {
    return {
      isAuthorized: false,
      response: unauthorizedResponse("workspaceId is required", 400),
      errors: ["Missing workspaceId parameter"]
    }
  }

  // Validate authorization
  const validation = await validateAssistantWorkspaceAccess(
    assistantId,
    workspaceId
  )

  if (!validation.isAuthorized) {
    return {
      isAuthorized: false,
      response: unauthorizedResponse(validation.errors.join("; "), 403),
      errors: validation.errors
    }
  }

  // Authorization successful
  return {
    isAuthorized: true,
    userId: validation.userId,
    assistantId,
    workspaceId
  }
}

/**
 * Extrai parâmetros de autorização do request sem validar
 *
 * Útil quando você quer extrair os parâmetros e fazer validação customizada
 *
 * @param request - NextRequest da API route
 * @returns Objeto com assistantId, workspaceId e body parseado
 */
export async function extractAuthParams(request: NextRequest): Promise<{
  assistantId?: string
  workspaceId?: string
  body: any
  error?: string
}> {
  try {
    const text = await request.text()
    if (!text) {
      return {
        body: {},
        error: "Request body is required"
      }
    }

    const body = JSON.parse(text)
    return {
      assistantId: body.assistantId,
      workspaceId: body.workspaceId,
      body
    }
  } catch (error) {
    return {
      body: {},
      error: "Invalid JSON in request body"
    }
  }
}

/**
 * Validação simplificada apenas para autenticação de usuário
 *
 * Use quando não precisar validar workspace ou assistente
 */
export async function validateUserAuth(request: NextRequest): Promise<{
  isAuthenticated: boolean
  userId?: string
  response?: Response
}> {
  const { validateUserAuthentication } = await import(
    "@/lib/server/workspace-authorization"
  )

  try {
    const userId = await validateUserAuthentication()
    return {
      isAuthenticated: true,
      userId
    }
  } catch (error) {
    return {
      isAuthenticated: false,
      response: unauthorizedResponse("User not authenticated", 401)
    }
  }
}

/**
 * Helper para logging de tentativas de autorização
 *
 * @param result - Resultado da validação
 * @param context - Contexto adicional para o log
 */
export function logAuthAttempt(
  result: WorkspaceAuthResult,
  context?: Record<string, any>
) {
  const timestamp = new Date().toISOString()
  const logData = {
    timestamp,
    isAuthorized: result.isAuthorized,
    userId: result.userId,
    assistantId: result.assistantId,
    workspaceId: result.workspaceId,
    errors: result.errors,
    ...context
  }

  if (result.isAuthorized) {
    console.log("[AUTH SUCCESS]", JSON.stringify(logData))
  } else {
    console.warn("[AUTH FAILED]", JSON.stringify(logData))
  }
}
