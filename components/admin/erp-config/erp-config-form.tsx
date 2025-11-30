"use client"

/**
 * ERP Configuration Form Component
 * Task 17.2 - Formulario CRUD para configuracao ERP
 *
 * Permite configurar:
 * - URL da API ERP
 * - API Key (encriptada)
 * - Timeout (1000-60000ms)
 * - Retentativas (0-5)
 * - Cache TTL (1-1440 minutos)
 * - Headers customizados
 *
 * Referencia: PRD RF-006, Task #17
 */

import { FC, useContext, useEffect, useState, useCallback } from "react"
import { ChatbotUIContext } from "@/context/context"
import {
  IconLoader,
  IconSettings,
  IconPlugConnected,
  IconTrash,
  IconAlertTriangle,
  IconCheck,
  IconRefresh,
  IconKey,
  IconClock,
  IconRepeat,
  IconDatabase,
  IconBrandCodesandbox,
  IconTestPipe
} from "@tabler/icons-react"

// =============================================================================
// TYPES
// =============================================================================

interface ERPConfig {
  workspace_id: string
  api_url: string
  encrypted_api_key: string
  custom_headers: Record<string, string>
  timeout_ms: number
  retry_attempts: number
  cache_ttl_minutes: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

interface TestResult {
  success: boolean
  latencyMs: number
  message: string
  details?: {
    errorCode?: string
    dataReceived?: boolean
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export const ERPConfigForm: FC = () => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  // State
  const [config, setConfig] = useState<ERPConfig | null>(null)
  const [configExists, setConfigExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Form state
  const [apiUrl, setApiUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [timeoutMs, setTimeoutMs] = useState(10000)
  const [retryAttempts, setRetryAttempts] = useState(2)
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(15)
  const [customHeaders, setCustomHeaders] = useState("")
  const [isActive, setIsActive] = useState(true)

  // Track if API key was changed
  const [apiKeyChanged, setApiKeyChanged] = useState(false)

  // Load config
  const loadConfig = useCallback(async () => {
    if (!selectedWorkspace) return

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(
        `/api/admin/erp-config?workspaceId=${selectedWorkspace.id}`
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to load configuration")
      }

      const data = await response.json()
      setConfig(data.config)
      setConfigExists(data.exists)

      if (data.config) {
        // Update form state
        setApiUrl(data.config.api_url || "")
        setApiKey("") // Never pre-fill encrypted key
        setTimeoutMs(data.config.timeout_ms || 10000)
        setRetryAttempts(data.config.retry_attempts ?? 2)
        setCacheTtlMinutes(data.config.cache_ttl_minutes || 15)
        setCustomHeaders(
          data.config.custom_headers
            ? JSON.stringify(data.config.custom_headers, null, 2)
            : "{}"
        )
        setIsActive(data.config.is_active ?? true)
        setApiKeyChanged(false)
      }
    } catch (err: any) {
      console.error("Error loading ERP config:", err)
      setError(err.message || "Failed to load configuration")
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace])

  // Initial load
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Parse custom headers
  const parseCustomHeaders = (): Record<string, string> | null => {
    try {
      const parsed = JSON.parse(customHeaders || "{}")
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  // Save config
  const handleSave = async () => {
    if (!selectedWorkspace) return

    // Validate
    if (!apiUrl) {
      setError("URL da API e obrigatoria")
      return
    }

    if (!configExists && !apiKey) {
      setError("API Key e obrigatoria para nova configuracao")
      return
    }

    const headers = parseCustomHeaders()
    if (headers === null) {
      setError("Headers customizados devem ser um JSON valido")
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const method = configExists ? "PUT" : "POST"
      const body: Record<string, any> = {
        workspaceId: selectedWorkspace.id,
        apiUrl,
        timeoutMs,
        retryAttempts,
        cacheTtlMinutes,
        customHeaders: headers,
        isActive
      }

      // Only include API key if changed or new config
      if (apiKeyChanged || !configExists) {
        body.apiKey = apiKey
      }

      const response = await fetch("/api/admin/erp-config", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save configuration")
      }

      const data = await response.json()
      setConfig(data.config)
      setConfigExists(true)
      setApiKeyChanged(false)
      setApiKey("") // Clear API key after save
      setSuccess("Configuracao salva com sucesso!")

      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error("Error saving ERP config:", err)
      setError(err.message || "Failed to save configuration")
    } finally {
      setSaving(false)
    }
  }

  // Delete config
  const handleDelete = async () => {
    if (!selectedWorkspace || !configExists) return

    if (
      !confirm(
        "Tem certeza que deseja remover a configuracao ERP? Esta acao nao pode ser desfeita."
      )
    ) {
      return
    }

    try {
      setDeleting(true)
      setError(null)
      setSuccess(null)

      const response = await fetch(
        `/api/admin/erp-config?workspaceId=${selectedWorkspace.id}`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete configuration")
      }

      setConfig(null)
      setConfigExists(false)
      setApiUrl("")
      setApiKey("")
      setTimeoutMs(10000)
      setRetryAttempts(2)
      setCacheTtlMinutes(15)
      setCustomHeaders("{}")
      setIsActive(true)
      setApiKeyChanged(false)
      setTestResult(null)
      setSuccess("Configuracao removida com sucesso!")

      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error("Error deleting ERP config:", err)
      setError(err.message || "Failed to delete configuration")
    } finally {
      setDeleting(false)
    }
  }

  // Test connectivity
  const handleTestConnectivity = async () => {
    if (!selectedWorkspace) return

    // Validate URL
    if (!apiUrl) {
      setError("URL da API e obrigatoria para teste")
      return
    }

    const headers = parseCustomHeaders()
    if (headers === null) {
      setError("Headers customizados devem ser um JSON valido")
      return
    }

    try {
      setTesting(true)
      setError(null)
      setTestResult(null)

      const body: Record<string, any> = {
        workspaceId: selectedWorkspace.id
      }

      // If API key was changed or no config exists, use temp credentials
      if (apiKeyChanged || !configExists) {
        if (!apiKey) {
          setError("API Key e obrigatoria para teste")
          setTesting(false)
          return
        }
        body.tempApiUrl = apiUrl
        body.tempApiKey = apiKey
        body.tempTimeoutMs = timeoutMs
        body.tempRetryAttempts = retryAttempts
        body.tempCustomHeaders = headers
      }

      const response = await fetch("/api/admin/erp-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (data.testResult) {
        setTestResult(data.testResult)
        if (data.testResult.success) {
          setSuccess("Teste de conectividade bem sucedido!")
          setTimeout(() => setSuccess(null), 3000)
        }
      } else if (data.error) {
        setError(data.error)
      }
    } catch (err: any) {
      console.error("Error testing ERP connectivity:", err)
      setError(err.message || "Failed to test connectivity")
    } finally {
      setTesting(false)
    }
  }

  // Format date
  const formatDate = (dateString: string): string => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  // Render loading
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <IconLoader className="animate-spin" size={32} />
        <span className="ml-2">Carregando configuracao...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconPlugConnected size={24} className="text-primary" />
          <h2 className="text-xl font-bold">Configuracao ERP</h2>
          {configExists && (
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                config?.is_active
                  ? "bg-green-500/10 text-green-500"
                  : "bg-yellow-500/10 text-yellow-500"
              }`}
            >
              {config?.is_active ? "Ativo" : "Inativo"}
            </span>
          )}
        </div>
        {configExists && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1 rounded border border-red-500 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          >
            {deleting ? (
              <IconLoader size={14} className="animate-spin" />
            ) : (
              <IconTrash size={14} />
            )}
            Remover
          </button>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-destructive/10 border-destructive flex items-center gap-2 rounded border p-3">
          <IconAlertTriangle size={16} className="text-destructive" />
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded border border-green-500 bg-green-500/10 p-3">
          <IconCheck size={16} className="text-green-500" />
          <p className="text-sm text-green-500">{success}</p>
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 rounded border p-3 ${
            testResult.success
              ? "border-green-500 bg-green-500/10"
              : "border-red-500 bg-red-500/10"
          }`}
        >
          {testResult.success ? (
            <IconCheck size={16} className="text-green-500" />
          ) : (
            <IconAlertTriangle size={16} className="text-red-500" />
          )}
          <div className="flex-1">
            <p
              className={`text-sm ${testResult.success ? "text-green-500" : "text-red-500"}`}
            >
              {testResult.message}
            </p>
            {testResult.details?.errorCode && (
              <p className="text-muted-foreground text-xs">
                Codigo: {testResult.details.errorCode}
              </p>
            )}
          </div>
          <span className="text-muted-foreground text-xs">
            {testResult.latencyMs}ms
          </span>
        </div>
      )}

      {/* Configuration Form */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="flex items-center gap-2 font-medium">
          <IconSettings size={18} />
          Credenciais e Configuracoes
        </h3>

        {/* API URL */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <IconBrandCodesandbox size={16} />
            URL da API ERP *
          </label>
          <input
            type="url"
            value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
            placeholder="https://api.erp.example.com/prices"
            className="bg-background w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            URL completa do endpoint de precos (deve usar HTTPS)
          </p>
        </div>

        {/* API Key */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <IconKey size={16} />
            API Key {!configExists && "*"}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => {
              setApiKey(e.target.value)
              setApiKeyChanged(true)
            }}
            placeholder={
              configExists
                ? "Deixe vazio para manter a chave atual"
                : "Digite a API key"
            }
            className="bg-background w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            {configExists
              ? "A chave sera encriptada. Deixe vazio para manter a atual."
              : "A chave sera encriptada antes de salvar."}
          </p>
        </div>

        {/* Timeout */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <IconClock size={16} />
            Timeout (ms)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1000"
              max="60000"
              step="1000"
              value={timeoutMs}
              onChange={e => setTimeoutMs(Number(e.target.value))}
              className="w-full"
            />
            <span className="bg-muted w-24 rounded px-3 py-2 text-center text-sm font-medium">
              {(timeoutMs / 1000).toFixed(0)}s
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Tempo maximo de espera por resposta (1-60 segundos, padrao: 10s)
          </p>
        </div>

        {/* Retry Attempts */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <IconRepeat size={16} />
            Tentativas de Retry
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="5"
              value={retryAttempts}
              onChange={e => setRetryAttempts(Number(e.target.value))}
              className="w-full"
            />
            <span className="bg-muted w-16 rounded px-3 py-2 text-center text-sm font-medium">
              {retryAttempts}x
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Numero de tentativas em caso de falha (0-5, padrao: 2)
          </p>
        </div>

        {/* Cache TTL */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <IconDatabase size={16} />
            Cache TTL (minutos)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="60"
              value={cacheTtlMinutes}
              onChange={e => setCacheTtlMinutes(Number(e.target.value))}
              className="w-full"
            />
            <span className="bg-muted w-20 rounded px-3 py-2 text-center text-sm font-medium">
              {cacheTtlMinutes} min
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Tempo que os precos ficam em cache antes de buscar novamente
            (padrao: 15min)
          </p>
        </div>

        {/* Custom Headers */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <IconSettings size={16} />
            Headers Customizados (JSON)
          </label>
          <textarea
            value={customHeaders}
            onChange={e => setCustomHeaders(e.target.value)}
            placeholder='{"X-Custom-Header": "value"}'
            rows={3}
            className="bg-background w-full rounded border px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Headers adicionais para enviar em cada requisicao (JSON valido)
          </p>
        </div>

        {/* Active Toggle */}
        {configExists && (
          <div className="flex items-center justify-between rounded border p-3">
            <div className="flex items-center gap-2">
              <IconPlugConnected
                size={18}
                className={
                  isActive ? "text-green-500" : "text-muted-foreground"
                }
              />
              <span className="font-medium">Integracao Ativa</span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:size-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-green-500 peer-checked:after:translate-x-full"></div>
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <button
            onClick={loadConfig}
            disabled={loading || saving}
            className="hover:bg-muted flex items-center gap-2 rounded border px-4 py-2 text-sm"
          >
            <IconRefresh size={16} />
            Recarregar
          </button>

          <button
            onClick={handleTestConnectivity}
            disabled={testing || !apiUrl}
            className="flex items-center gap-2 rounded border border-blue-500 px-4 py-2 text-sm text-blue-500 hover:bg-blue-500/10 disabled:opacity-50"
          >
            {testing ? (
              <IconLoader size={16} className="animate-spin" />
            ) : (
              <IconTestPipe size={16} />
            )}
            Testar Conectividade
          </button>

          <button
            onClick={handleSave}
            disabled={saving || !apiUrl}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? (
              <IconLoader size={16} className="animate-spin" />
            ) : (
              <IconCheck size={16} />
            )}
            {configExists ? "Salvar Alteracoes" : "Criar Configuracao"}
          </button>
        </div>
      </div>

      {/* Metadata */}
      {configExists && config && (
        <div className="text-muted-foreground rounded border p-3 text-xs">
          <div className="flex flex-wrap gap-4">
            <span>
              <strong>Criado em:</strong> {formatDate(config.created_at || "")}
            </span>
            <span>
              <strong>Atualizado em:</strong>{" "}
              {formatDate(config.updated_at || "")}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
