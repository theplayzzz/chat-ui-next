"use client"

/**
 * API Call History Component
 * Task 17.4 - Historico de chamadas API com paginacao e filtros
 *
 * Exibe tabela com:
 * - Timestamp
 * - Status (badge colorido)
 * - Response Time
 * - Cache Hit
 * - Error Message
 *
 * Filtros:
 * - Date range
 * - Status checkboxes
 * - Paginacao server-side
 *
 * Referencia: PRD RF-006, Task #17
 */

import { FC, useContext, useEffect, useState, useCallback } from "react"
import { ChatbotUIContext } from "@/context/context"
import {
  IconLoader,
  IconRefresh,
  IconFilter,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconHistory,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDatabase
} from "@tabler/icons-react"

// =============================================================================
// TYPES
// =============================================================================

interface LogEntry {
  id: string
  workspace_id: string
  timestamp: string
  status: "success" | "error" | "timeout"
  response_time_ms: number | null
  cache_hit: boolean
  error_message: string | null
  request_params: Record<string, unknown> | null
  created_at: string
}

interface LogsResponse {
  data: LogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface StatusBadgeProps {
  status: "success" | "error" | "timeout"
}

const StatusBadge: FC<StatusBadgeProps> = ({ status }) => {
  const colors = {
    success: "bg-green-500/10 text-green-500 border-green-500/30",
    error: "bg-red-500/10 text-red-500 border-red-500/30",
    timeout: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
  }

  const labels = {
    success: "Sucesso",
    error: "Erro",
    timeout: "Timeout"
  }

  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${colors[status]}`}>
      {labels[status]}
    </span>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const APICallHistory: FC = () => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  // State
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [cacheHitFilter, setCacheHitFilter] = useState<string>("")

  // Load logs
  const loadLogs = useCallback(async () => {
    if (!selectedWorkspace) return

    try {
      setLoading(true)
      setError(null)

      // Build query string
      const params = new URLSearchParams({
        workspaceId: selectedWorkspace.id,
        page: page.toString(),
        pageSize: pageSize.toString()
      })

      if (statusFilters.length > 0) {
        params.set("status", statusFilters.join(","))
      }
      if (fromDate) {
        params.set("from", new Date(fromDate).toISOString())
      }
      if (toDate) {
        params.set("to", new Date(toDate).toISOString())
      }
      if (cacheHitFilter) {
        params.set("cacheHit", cacheHitFilter)
      }

      const response = await fetch(`/api/admin/erp-config/logs?${params}`)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to load logs")
      }

      const data: LogsResponse = await response.json()
      setLogs(data.data)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (err: any) {
      console.error("Error loading API logs:", err)
      setError(err.message || "Failed to load logs")
    } finally {
      setLoading(false)
    }
  }, [
    selectedWorkspace,
    page,
    pageSize,
    statusFilters,
    fromDate,
    toDate,
    cacheHitFilter
  ])

  // Initial load
  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilters, fromDate, toDate, cacheHitFilter])

  // Toggle status filter
  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  // Clear filters
  const clearFilters = () => {
    setStatusFilters([])
    setFromDate("")
    setToDate("")
    setCacheHitFilter("")
    setPage(1)
  }

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  }

  // Truncate error message
  const truncateError = (
    message: string | null,
    maxLength: number = 50
  ): string => {
    if (!message) return "-"
    if (message.length <= maxLength) return message
    return message.slice(0, maxLength) + "..."
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconHistory size={24} className="text-primary" />
          <h2 className="text-xl font-bold">Historico de Chamadas API</h2>
          <span className="text-muted-foreground text-sm">
            ({total} registros)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`hover:bg-muted flex items-center gap-1 rounded border px-3 py-1.5 text-sm ${
              showFilters ||
              statusFilters.length > 0 ||
              fromDate ||
              toDate ||
              cacheHitFilter
                ? "border-blue-500 text-blue-500"
                : ""
            }`}
          >
            <IconFilter size={14} />
            Filtros
            {(statusFilters.length > 0 ||
              fromDate ||
              toDate ||
              cacheHitFilter) && (
              <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                {statusFilters.length +
                  (fromDate ? 1 : 0) +
                  (toDate ? 1 : 0) +
                  (cacheHitFilter ? 1 : 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => loadLogs()}
            disabled={loading}
            className="hover:bg-muted flex items-center gap-1 rounded border px-3 py-1.5 text-sm"
          >
            {loading ? (
              <IconLoader size={14} className="animate-spin" />
            ) : (
              <IconRefresh size={14} />
            )}
            Atualizar
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-muted/50 rounded-lg border p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">Filtros</h3>
            <button
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Limpar filtros
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {/* Status Filter */}
            <div>
              <label className="mb-2 block text-xs font-medium">Status</label>
              <div className="flex flex-wrap gap-2">
                {["success", "error", "timeout"].map(status => (
                  <label
                    key={status}
                    className={`cursor-pointer rounded border px-2 py-1 text-xs ${
                      statusFilters.includes(status)
                        ? status === "success"
                          ? "border-green-500 bg-green-500/10 text-green-500"
                          : status === "error"
                            ? "border-red-500 bg-red-500/10 text-red-500"
                            : "border-yellow-500 bg-yellow-500/10 text-yellow-500"
                        : "hover:bg-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={statusFilters.includes(status)}
                      onChange={() => toggleStatusFilter(status)}
                    />
                    {status === "success"
                      ? "Sucesso"
                      : status === "error"
                        ? "Erro"
                        : "Timeout"}
                  </label>
                ))}
              </div>
            </div>

            {/* From Date */}
            <div>
              <label className="mb-2 block text-xs font-medium">
                Data Inicio
              </label>
              <input
                type="datetime-local"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="bg-background w-full rounded border px-2 py-1 text-sm"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="mb-2 block text-xs font-medium">Data Fim</label>
              <input
                type="datetime-local"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="bg-background w-full rounded border px-2 py-1 text-sm"
              />
            </div>

            {/* Cache Hit Filter */}
            <div>
              <label className="mb-2 block text-xs font-medium">Cache</label>
              <select
                value={cacheHitFilter}
                onChange={e => setCacheHitFilter(e.target.value)}
                className="bg-background w-full rounded border px-2 py-1 text-sm"
              >
                <option value="">Todos</option>
                <option value="true">Cache Hit</option>
                <option value="false">Cache Miss</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-destructive/10 border-destructive flex items-center gap-2 rounded border p-3">
          <IconAlertTriangle size={16} className="text-destructive" />
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Tempo (ms)</th>
                <th className="px-4 py-3 text-left font-medium">Cache</th>
                <th className="px-4 py-3 text-left font-medium">
                  Mensagem de Erro
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <IconLoader className="mx-auto animate-spin" size={24} />
                    <p className="text-muted-foreground mt-2 text-sm">
                      Carregando logs...
                    </p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <IconHistory
                      className="text-muted-foreground mx-auto"
                      size={32}
                    />
                    <p className="text-muted-foreground mt-2 text-sm">
                      Nenhum log encontrado
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <IconClock
                          size={14}
                          className="text-muted-foreground"
                        />
                        <span className="whitespace-nowrap">
                          {formatDate(log.timestamp)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-4 py-3">
                      {log.response_time_ms !== null ? (
                        <span
                          className={
                            log.response_time_ms > 5000
                              ? "text-red-500"
                              : log.response_time_ms > 2000
                                ? "text-yellow-500"
                                : "text-green-500"
                          }
                        >
                          {log.response_time_ms}ms
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.cache_hit ? (
                        <div className="flex items-center gap-1 text-green-500">
                          <IconDatabase size={14} />
                          <span className="text-xs">Hit</span>
                        </div>
                      ) : (
                        <div className="text-muted-foreground flex items-center gap-1">
                          <IconX size={14} />
                          <span className="text-xs">Miss</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.error_message ? (
                        <span
                          className="cursor-help text-red-500"
                          title={log.error_message}
                        >
                          {truncateError(log.error_message)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Mostrando {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, total)} de {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="hover:bg-muted flex items-center gap-1 rounded border px-2 py-1 text-sm disabled:opacity-50"
                >
                  <IconChevronLeft size={14} />
                  Anterior
                </button>
                <span className="text-muted-foreground text-sm">
                  Pagina {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="hover:bg-muted flex items-center gap-1 rounded border px-2 py-1 text-sm disabled:opacity-50"
                >
                  Proxima
                  <IconChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
