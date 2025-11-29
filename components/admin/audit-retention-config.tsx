"use client"

/**
 * Audit Retention Configuration Component
 * Task 13.6 - Configuracao de retencao por workspace
 *
 * Permite configurar:
 * - Anos de retencao (1-10)
 * - Dias para anonimizacao automatica (30-365)
 * - Hard delete vs soft delete
 * - Nivel padrao de anonimizacao
 *
 * Referencia: PRD RF-012, Task #13
 */

import { FC, useContext, useEffect, useState, useCallback } from "react"
import { ChatbotUIContext } from "@/context/context"
import {
  IconLoader,
  IconSettings,
  IconShieldLock,
  IconTrash,
  IconAlertTriangle,
  IconCheck,
  IconRefresh,
  IconHistory
} from "@tabler/icons-react"

// =============================================================================
// TYPES
// =============================================================================

interface AuditRetentionConfig {
  workspace_id: string
  retention_years: number
  auto_anonymize_after_days: number
  hard_delete_enabled: boolean
  default_anonymization_level: "full" | "partial" | "none"
  created_at?: string
  updated_at?: string
}

interface CleanupResult {
  hard_deleted: number
  soft_deleted: number
  anonymization_upgraded: number
  total_processed: number
}

interface DeletionLog {
  id: string
  recommendation_id: string
  workspace_id: string
  deletion_type: string
  original_status?: string
  original_anonymization_level?: string
  new_anonymization_level?: string
  deleted_at: string
  deleted_by: string
}

// =============================================================================
// COMPONENT
// =============================================================================

export const AuditRetentionConfig: FC = () => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  // State
  const [config, setConfig] = useState<AuditRetentionConfig | null>(null)
  const [isDefault, setIsDefault] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [retentionYears, setRetentionYears] = useState(1)
  const [autoAnonymizeDays, setAutoAnonymizeDays] = useState(90)
  const [hardDeleteEnabled, setHardDeleteEnabled] = useState(false)
  const [defaultAnonymization, setDefaultAnonymization] = useState<
    "full" | "partial" | "none"
  >("partial")

  // Cleanup state
  const [runningCleanup, setRunningCleanup] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null)
  const [deletionLogs, setDeletionLogs] = useState<DeletionLog[]>([])
  const [showLogs, setShowLogs] = useState(false)

  // Load config
  const loadConfig = useCallback(async () => {
    if (!selectedWorkspace) return

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(
        `/api/admin/audit-retention?workspaceId=${selectedWorkspace.id}`
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to load configuration")
      }

      const data = await response.json()
      setConfig(data.config)
      setIsDefault(data.isDefault)

      // Update form state
      setRetentionYears(data.config.retention_years)
      setAutoAnonymizeDays(data.config.auto_anonymize_after_days)
      setHardDeleteEnabled(data.config.hard_delete_enabled)
      setDefaultAnonymization(data.config.default_anonymization_level)
    } catch (err: any) {
      console.error("Error loading retention config:", err)
      setError(err.message || "Failed to load configuration")
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace])

  // Initial load
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Save config
  const handleSave = async () => {
    if (!selectedWorkspace) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const response = await fetch("/api/admin/audit-retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspace.id,
          retentionYears,
          autoAnonymizeAfterDays: autoAnonymizeDays,
          hardDeleteEnabled,
          defaultAnonymizationLevel: defaultAnonymization
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save configuration")
      }

      const data = await response.json()
      setConfig(data.config)
      setIsDefault(false)
      setSuccess("Configuracao salva com sucesso!")

      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error("Error saving retention config:", err)
      setError(err.message || "Failed to save configuration")
    } finally {
      setSaving(false)
    }
  }

  // Trigger manual cleanup
  const handleTriggerCleanup = async () => {
    if (!selectedWorkspace) return

    if (
      !confirm(
        "Tem certeza que deseja executar a limpeza manualmente? Esta operacao nao pode ser desfeita."
      )
    ) {
      return
    }

    try {
      setRunningCleanup(true)
      setError(null)
      setCleanupResult(null)

      const response = await fetch("/api/admin/audit-retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspace.id,
          action: "trigger_cleanup"
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to run cleanup")
      }

      const data = await response.json()
      setCleanupResult(data.result)
      setSuccess(
        `Limpeza executada: ${data.result.total_processed} registros processados`
      )

      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      console.error("Error running cleanup:", err)
      setError(err.message || "Failed to run cleanup")
    } finally {
      setRunningCleanup(false)
    }
  }

  // Load deletion logs
  const handleLoadLogs = async () => {
    if (!selectedWorkspace) return

    try {
      setError(null)

      const response = await fetch("/api/admin/audit-retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspace.id,
          action: "get_deletion_log"
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to load logs")
      }

      const data = await response.json()
      setDeletionLogs(data.logs)
      setShowLogs(true)
    } catch (err: any) {
      console.error("Error loading deletion logs:", err)
      setError(err.message || "Failed to load logs")
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
      <div className="flex items-center gap-2">
        <IconShieldLock size={24} className="text-primary" />
        <h2 className="text-xl font-bold">Configuracao de Retencao LGPD</h2>
        {isDefault && (
          <span className="rounded-full bg-yellow-500/10 px-2 py-1 text-xs text-yellow-500">
            Usando valores padrao
          </span>
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

      {/* Configuration Form */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="flex items-center gap-2 font-medium">
          <IconSettings size={18} />
          Configuracoes de Retencao
        </h3>

        {/* Retention Years */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            Anos de Retencao
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="10"
              value={retentionYears}
              onChange={e => setRetentionYears(Number(e.target.value))}
              className="w-full"
            />
            <span className="bg-muted w-16 rounded px-3 py-2 text-center text-sm font-medium">
              {retentionYears} {retentionYears === 1 ? "ano" : "anos"}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Periodo para reter dados antes de aplicar exclusao (1-10 anos)
          </p>
        </div>

        {/* Auto Anonymize Days */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            Dias para Anonimizacao Automatica
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="30"
              max="365"
              step="30"
              value={autoAnonymizeDays}
              onChange={e => setAutoAnonymizeDays(Number(e.target.value))}
              className="w-full"
            />
            <span className="bg-muted w-20 rounded px-3 py-2 text-center text-sm font-medium">
              {autoAnonymizeDays} dias
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Apos este periodo, dados com anonimizacao &quot;partial&quot; serao
            atualizados para &quot;full&quot; (30-365 dias)
          </p>
        </div>

        {/* Default Anonymization Level */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            Nivel Padrao de Anonimizacao
          </label>
          <div className="flex gap-4">
            {(["none", "partial", "full"] as const).map(level => (
              <label
                key={level}
                className={`flex cursor-pointer items-center gap-2 rounded border px-4 py-2 ${
                  defaultAnonymization === level
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="anonymization"
                  value={level}
                  checked={defaultAnonymization === level}
                  onChange={() => setDefaultAnonymization(level)}
                  className="sr-only"
                />
                <span className="text-sm font-medium capitalize">{level}</span>
              </label>
            ))}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Nivel de anonimizacao aplicado a novos registros de auditoria
          </p>
        </div>

        {/* Hard Delete Toggle */}
        <div className="rounded border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconTrash size={18} className="text-red-500" />
              <span className="font-medium">
                Exclusao Permanente (Hard Delete)
              </span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={hardDeleteEnabled}
                onChange={e => setHardDeleteEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:size-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-red-500 peer-checked:after:translate-x-full"></div>
            </label>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            {hardDeleteEnabled ? (
              <span className="text-red-500">
                <strong>ATENCAO:</strong> Registros expirados serao
                permanentemente removidos do banco de dados. Esta acao nao pode
                ser desfeita.
              </span>
            ) : (
              "Registros expirados serao marcados como deletados (soft delete), mantendo historico para auditoria."
            )}
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={loadConfig}
            disabled={loading || saving}
            className="hover:bg-muted flex items-center gap-2 rounded border px-4 py-2 text-sm"
          >
            <IconRefresh size={16} />
            Recarregar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? (
              <IconLoader size={16} className="animate-spin" />
            ) : (
              <IconCheck size={16} />
            )}
            Salvar Configuracao
          </button>
        </div>
      </div>

      {/* Manual Cleanup Section */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="flex items-center gap-2 font-medium">
          <IconTrash size={18} />
          Limpeza Manual
        </h3>

        <p className="text-muted-foreground text-sm">
          A limpeza automatica e executada diariamente as 3AM UTC. Voce pode
          executar manualmente clicando no botao abaixo.
        </p>

        {cleanupResult && (
          <div className="bg-muted rounded p-3">
            <p className="text-sm font-medium">Resultado da ultima limpeza:</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                Hard deleted:{" "}
                <span className="font-medium">
                  {cleanupResult.hard_deleted}
                </span>
              </li>
              <li>
                Soft deleted:{" "}
                <span className="font-medium">
                  {cleanupResult.soft_deleted}
                </span>
              </li>
              <li>
                Anonimizacao atualizada:{" "}
                <span className="font-medium">
                  {cleanupResult.anonymization_upgraded}
                </span>
              </li>
              <li>
                Total processado:{" "}
                <span className="font-medium">
                  {cleanupResult.total_processed}
                </span>
              </li>
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleTriggerCleanup}
            disabled={runningCleanup}
            className="flex items-center gap-2 rounded border border-red-500 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          >
            {runningCleanup ? (
              <IconLoader size={16} className="animate-spin" />
            ) : (
              <IconTrash size={16} />
            )}
            Executar Limpeza Agora
          </button>

          <button
            onClick={handleLoadLogs}
            className="hover:bg-muted flex items-center gap-2 rounded border px-4 py-2 text-sm"
          >
            <IconHistory size={16} />
            Ver Log de Exclusoes
          </button>
        </div>
      </div>

      {/* Deletion Logs */}
      {showLogs && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-medium">
              <IconHistory size={18} />
              Log de Exclusoes (Ultimos 100)
            </h3>
            <button
              onClick={() => setShowLogs(false)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Fechar
            </button>
          </div>

          {deletionLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum registro de exclusao encontrado.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">Status Original</th>
                    <th className="p-2 text-left">Anonimizacao</th>
                    <th className="p-2 text-left">Executado Por</th>
                  </tr>
                </thead>
                <tbody>
                  {deletionLogs.map(log => (
                    <tr key={log.id} className="border-t">
                      <td className="p-2">{formatDate(log.deleted_at)}</td>
                      <td className="p-2">
                        <span
                          className={`rounded px-2 py-1 text-xs ${
                            log.deletion_type === "hard"
                              ? "bg-red-500/10 text-red-500"
                              : log.deletion_type === "soft"
                                ? "bg-yellow-500/10 text-yellow-500"
                                : "bg-blue-500/10 text-blue-500"
                          }`}
                        >
                          {log.deletion_type}
                        </span>
                      </td>
                      <td className="p-2">{log.original_status || "-"}</td>
                      <td className="p-2">
                        {log.original_anonymization_level}
                        {log.new_anonymization_level &&
                          ` → ${log.new_anonymization_level}`}
                      </td>
                      <td className="p-2">{log.deleted_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* LGPD Compliance Notice */}
      <div className="text-muted-foreground rounded border p-3 text-xs">
        <strong>Conformidade LGPD:</strong> Esta configuracao controla como os
        dados pessoais sao retidos e anonimizados conforme a Lei Geral de
        Protecao de Dados. A exclusao automatica e a anonimizacao progressiva
        garantem que dados desnecessarios sejam removidos ou mascarados apos o
        periodo de retencao configurado.
      </div>
    </div>
  )
}
