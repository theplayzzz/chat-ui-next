"use client"

/**
 * Audit History Component
 * Task 13.4 - Interface de consulta de historico de auditoria
 *
 * Exibe historico de recomendacoes com filtros e paginacao
 *
 * Features:
 * - Filtros: periodo, status, nivel de anonimizacao
 * - Paginacao server-side
 * - Link para LangSmith
 * - Export CSV (via botao que redireciona para API)
 *
 * Referencia: PRD RF-012, Task #13
 */

import { FC, useContext, useEffect, useState, useCallback } from "react"
import { ChatbotUIContext } from "@/context/context"
import {
  IconLoader,
  IconHistory,
  IconExternalLink,
  IconFilter,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconRefresh
} from "@tabler/icons-react"

// =============================================================================
// TYPES
// =============================================================================

interface AuditRecord {
  id: string
  created_at: string
  workspace_id: string
  user_email_partial?: string
  client_age_range?: string
  client_state?: string
  analyzed_plans_count: number
  recommended_plan_name?: string
  confidence_score?: number
  reasoning_preview?: string
  langsmith_run_id?: string
  status?: string
  anonymization_level?: string
  consent_given: boolean
  retention_until?: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Filters {
  startDate: string
  endDate: string
  status: string
  anonymizationLevel: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatDate(dateString: string): string {
  if (!dateString) return "-"
  const date = new Date(dateString)
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
}

function formatConfidenceScore(score?: number): string {
  if (score === undefined || score === null) return "-"
  return `${(score * 100).toFixed(0)}%`
}

function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case "active":
      return "bg-green-500/10 text-green-500"
    case "deleted":
      return "bg-red-500/10 text-red-500"
    case "archived":
      return "bg-yellow-500/10 text-yellow-500"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function getAnonymizationBadgeClass(level?: string): string {
  switch (level) {
    case "full":
      return "bg-purple-500/10 text-purple-500"
    case "partial":
      return "bg-blue-500/10 text-blue-500"
    case "none":
      return "bg-gray-500/10 text-gray-500"
    default:
      return "bg-muted text-muted-foreground"
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export const AuditHistory: FC = () => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  // State
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  })
  const [filters, setFilters] = useState<Filters>({
    startDate: "",
    endDate: "",
    status: "",
    anonymizationLevel: ""
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Load records
  const loadRecords = useCallback(
    async (page: number = 1) => {
      if (!selectedWorkspace) return

      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams({
          workspaceId: selectedWorkspace.id,
          page: page.toString(),
          limit: pagination.limit.toString()
        })

        if (filters.startDate) params.append("startDate", filters.startDate)
        if (filters.endDate) params.append("endDate", filters.endDate)
        if (filters.status) params.append("status", filters.status)
        if (filters.anonymizationLevel)
          params.append("anonymizationLevel", filters.anonymizationLevel)

        const response = await fetch(`/api/admin/audit-history?${params}`)

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to load audit history")
        }

        const data = await response.json()
        setRecords(data.records || [])
        setPagination(prev => ({
          ...prev,
          ...data.pagination,
          page
        }))
      } catch (err: any) {
        console.error("Error loading audit history:", err)
        setError(err.message || "Failed to load audit history")
      } finally {
        setLoading(false)
      }
    },
    [selectedWorkspace, filters, pagination.limit]
  )

  // Initial load
  useEffect(() => {
    loadRecords(1)
  }, [selectedWorkspace])

  // Apply filters
  const handleApplyFilters = () => {
    loadRecords(1)
  }

  // Clear filters
  const handleClearFilters = () => {
    setFilters({
      startDate: "",
      endDate: "",
      status: "",
      anonymizationLevel: ""
    })
    setTimeout(() => loadRecords(1), 0)
  }

  // Pagination handlers
  const handlePrevPage = () => {
    if (pagination.page > 1) {
      loadRecords(pagination.page - 1)
    }
  }

  const handleNextPage = () => {
    if (pagination.page < pagination.totalPages) {
      loadRecords(pagination.page + 1)
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    if (!selectedWorkspace) return

    const params = new URLSearchParams({
      workspaceId: selectedWorkspace.id
    })

    if (filters.startDate) params.append("startDate", filters.startDate)
    if (filters.endDate) params.append("endDate", filters.endDate)
    if (filters.status) params.append("status", filters.status)
    if (filters.anonymizationLevel)
      params.append("anonymizationLevel", filters.anonymizationLevel)

    window.open(`/api/admin/audit-history/export?${params}`, "_blank")
  }

  // LangSmith link
  const getLangSmithUrl = (runId: string): string => {
    return `https://smith.langchain.com/public/${runId}/r`
  }

  // Render loading state
  if (loading && records.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <IconLoader className="animate-spin" size={32} />
        <span className="ml-2">Carregando historico de auditoria...</span>
      </div>
    )
  }

  // Render error state
  if (error && records.length === 0) {
    return (
      <div className="bg-destructive/10 border-destructive rounded-lg border p-4">
        <p className="text-destructive font-medium">Erro: {error}</p>
        <button
          onClick={() => loadRecords(1)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 rounded px-4 py-2"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconHistory size={24} className="text-primary" />
          <h2 className="text-xl font-bold">Historico de Auditoria LGPD</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadRecords(pagination.page)}
            disabled={loading}
            className="hover:bg-muted flex items-center gap-1 rounded border px-3 py-2 text-sm"
          >
            <IconRefresh size={16} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 rounded border px-3 py-2 text-sm ${
              showFilters
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            <IconFilter size={16} />
            Filtros
          </button>

          <button
            onClick={handleExportCSV}
            disabled={records.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            <IconDownload size={16} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-muted/50 rounded-lg border p-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Data Inicio
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={e =>
                  setFilters(prev => ({ ...prev, startDate: e.target.value }))
                }
                className="bg-background w-full rounded border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Data Fim</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={e =>
                  setFilters(prev => ({ ...prev, endDate: e.target.value }))
                }
                className="bg-background w-full rounded border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select
                value={filters.status}
                onChange={e =>
                  setFilters(prev => ({ ...prev, status: e.target.value }))
                }
                className="bg-background w-full rounded border px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="active">Ativo</option>
                <option value="deleted">Deletado</option>
                <option value="archived">Arquivado</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Nivel Anonimizacao
              </label>
              <select
                value={filters.anonymizationLevel}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    anonymizationLevel: e.target.value
                  }))
                }
                className="bg-background w-full rounded border px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="full">Full</option>
                <option value="partial">Partial</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleApplyFilters}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-4 py-2 text-sm"
            >
              Aplicar Filtros
            </button>
            <button
              onClick={handleClearFilters}
              className="hover:bg-muted rounded border px-4 py-2 text-sm"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-destructive/10 border-destructive rounded border p-3">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {/* Results Summary */}
      <div className="text-muted-foreground text-sm">
        Mostrando {records.length} de {pagination.total} registros
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="whitespace-nowrap p-3 text-left text-sm">Data</th>
              <th className="whitespace-nowrap p-3 text-left text-sm">
                Usuario
              </th>
              <th className="whitespace-nowrap p-3 text-left text-sm">
                Perfil Cliente
              </th>
              <th className="whitespace-nowrap p-3 text-center text-sm">
                Planos Analisados
              </th>
              <th className="whitespace-nowrap p-3 text-left text-sm">
                Recomendacao
              </th>
              <th className="whitespace-nowrap p-3 text-center text-sm">
                Confianca
              </th>
              <th className="whitespace-nowrap p-3 text-center text-sm">
                Status
              </th>
              <th className="whitespace-nowrap p-3 text-center text-sm">
                Anonimizacao
              </th>
              <th className="whitespace-nowrap p-3 text-center text-sm">
                LangSmith
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map(record => (
              <tr key={record.id} className="border-t">
                <td className="whitespace-nowrap p-3 text-sm">
                  {formatDate(record.created_at)}
                </td>
                <td className="p-3 text-sm">
                  <code className="bg-muted rounded px-1 text-xs">
                    {record.user_email_partial}
                  </code>
                </td>
                <td className="p-3 text-sm">
                  {record.client_age_range && (
                    <span className="mr-2">{record.client_age_range} anos</span>
                  )}
                  {record.client_state && (
                    <span className="text-muted-foreground">
                      ({record.client_state})
                    </span>
                  )}
                </td>
                <td className="p-3 text-center text-sm">
                  {record.analyzed_plans_count}
                </td>
                <td className="max-w-[200px] truncate p-3 text-sm">
                  {record.recommended_plan_name || "-"}
                </td>
                <td className="p-3 text-center text-sm">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      record.confidence_score && record.confidence_score >= 0.8
                        ? "bg-green-500/10 text-green-500"
                        : record.confidence_score &&
                            record.confidence_score >= 0.6
                          ? "bg-yellow-500/10 text-yellow-500"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {formatConfidenceScore(record.confidence_score)}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(record.status)}`}
                  >
                    {record.status || "-"}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getAnonymizationBadgeClass(record.anonymization_level)}`}
                  >
                    {record.anonymization_level || "-"}
                  </span>
                </td>
                <td className="p-3 text-center">
                  {record.langsmith_run_id ? (
                    <a
                      href={getLangSmithUrl(record.langsmith_run_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 inline-flex items-center gap-1"
                    >
                      <IconExternalLink size={14} />
                      <span className="text-xs">Ver</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {records.length === 0 && !loading && (
        <div className="bg-muted rounded-lg p-8 text-center">
          <IconHistory
            size={48}
            className="text-muted-foreground mx-auto mb-4"
          />
          <p className="text-muted-foreground">
            Nenhum registro de auditoria encontrado
          </p>
          {(filters.startDate ||
            filters.endDate ||
            filters.status ||
            filters.anonymizationLevel) && (
            <button
              onClick={handleClearFilters}
              className="text-primary hover:text-primary/80 mt-2 text-sm"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground text-sm">
            Pagina {pagination.page} de {pagination.totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={pagination.page <= 1 || loading}
              className="hover:bg-muted flex items-center gap-1 rounded border px-3 py-2 text-sm disabled:opacity-50"
            >
              <IconChevronLeft size={16} />
              Anterior
            </button>

            <button
              onClick={handleNextPage}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="hover:bg-muted flex items-center gap-1 rounded border px-3 py-2 text-sm disabled:opacity-50"
            >
              Proximo
              <IconChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* LGPD Notice */}
      <div className="text-muted-foreground mt-4 rounded border p-3 text-xs">
        <strong>Nota LGPD:</strong> Os dados exibidos estao anonimizados
        conforme configuracao do workspace. Dados pessoais identificaveis (CPF,
        nome completo, endereco) sao removidos ou mascarados automaticamente.
      </div>
    </div>
  )
}
