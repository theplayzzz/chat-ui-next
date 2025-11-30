"use client"

/**
 * Cache Stats Dashboard Component
 * Task 17.3 - Dashboard de metricas do cache ERP
 *
 * Exibe:
 * - Hit Rate (%)
 * - Miss Rate (%)
 * - Total Entries
 * - Evictions
 *
 * Funcionalidades:
 * - Auto-refresh a cada 30s
 * - Botao de limpar cache
 *
 * Referencia: PRD RF-006, Task #17
 */

import { FC, useContext, useEffect, useState, useCallback } from "react"
import { ChatbotUIContext } from "@/context/context"
import {
  IconLoader,
  IconRefresh,
  IconTrash,
  IconAlertTriangle,
  IconCheck,
  IconChartBar,
  IconTargetArrow,
  IconTargetOff,
  IconDatabase,
  IconArrowDownRight
} from "@tabler/icons-react"

// =============================================================================
// TYPES
// =============================================================================

interface CacheStats {
  global: {
    totalEntries: number
    hitRate: number
    missRate: number
    evictions: number
    totalHits: number
    oldestEntry: string | null
  }
  workspace: {
    entries: number
    hits: number
    oldestEntry: string | null
  }
  timestamp: string
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  color: "green" | "yellow" | "red" | "blue" | "gray"
}

const StatCard: FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color
}) => {
  const colorClasses = {
    green: "border-green-500/30 bg-green-500/5 text-green-500",
    yellow: "border-yellow-500/30 bg-yellow-500/5 text-yellow-500",
    red: "border-red-500/30 bg-red-500/5 text-red-500",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-500",
    gray: "border-gray-500/30 bg-gray-500/5 text-gray-500"
  }

  const iconColorClasses = {
    green: "text-green-500",
    yellow: "text-yellow-500",
    red: "text-red-500",
    blue: "text-blue-500",
    gray: "text-gray-500"
  }

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm font-medium">
          {title}
        </span>
        <span className={iconColorClasses[color]}>{icon}</span>
      </div>
      <div className="mt-2">
        <span className="text-3xl font-bold">{value}</span>
      </div>
      {subtitle && (
        <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
      )}
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CacheStatsDashboard: FC = () => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  // State
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Load stats
  const loadStats = useCallback(async () => {
    if (!selectedWorkspace) return

    try {
      setError(null)

      const response = await fetch(
        `/api/admin/erp-config/stats?workspaceId=${selectedWorkspace.id}`
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to load stats")
      }

      const data = await response.json()
      setStats(data)
      setLastRefresh(new Date())
    } catch (err: any) {
      console.error("Error loading cache stats:", err)
      setError(err.message || "Failed to load stats")
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace])

  // Initial load
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats()
    }, 30000)

    return () => clearInterval(interval)
  }, [loadStats])

  // Clear cache
  const handleClearCache = async (clearAll: boolean = false) => {
    if (!selectedWorkspace) return

    const message = clearAll
      ? "Tem certeza que deseja limpar TODO o cache? Isso afetara todos os workspaces."
      : "Tem certeza que deseja limpar o cache deste workspace?"

    if (!confirm(message)) {
      return
    }

    try {
      setClearing(true)
      setError(null)
      setSuccess(null)

      const url = `/api/admin/erp-config/cache/clear?workspaceId=${selectedWorkspace.id}${clearAll ? "&all=true" : ""}`
      const response = await fetch(url, { method: "DELETE" })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to clear cache")
      }

      const data = await response.json()
      setSuccess(data.message)
      setTimeout(() => setSuccess(null), 3000)

      // Reload stats
      await loadStats()
    } catch (err: any) {
      console.error("Error clearing cache:", err)
      setError(err.message || "Failed to clear cache")
    } finally {
      setClearing(false)
    }
  }

  // Get hit rate color
  const getHitRateColor = (rate: number): "green" | "yellow" | "red" => {
    if (rate >= 70) return "green"
    if (rate >= 40) return "yellow"
    return "red"
  }

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  }

  // Render loading
  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center p-8">
        <IconLoader className="animate-spin" size={32} />
        <span className="ml-2">Carregando estatisticas...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconChartBar size={24} className="text-primary" />
          <h2 className="text-xl font-bold">Cache ERP</h2>
          {lastRefresh && (
            <span className="text-muted-foreground text-xs">
              Atualizado: {formatDate(lastRefresh.toISOString())}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadStats()}
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

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Hit Rate */}
          <StatCard
            title="Hit Rate"
            value={`${stats.global.hitRate}%`}
            subtitle={`${stats.global.totalHits} acertos totais`}
            icon={<IconTargetArrow size={20} />}
            color={getHitRateColor(stats.global.hitRate)}
          />

          {/* Miss Rate */}
          <StatCard
            title="Miss Rate"
            value={`${stats.global.missRate}%`}
            subtitle="Cache nao encontrado"
            icon={<IconTargetOff size={20} />}
            color={stats.global.missRate > 60 ? "red" : "gray"}
          />

          {/* Total Entries */}
          <StatCard
            title="Entradas Totais"
            value={stats.global.totalEntries}
            subtitle={`${stats.workspace.entries} neste workspace`}
            icon={<IconDatabase size={20} />}
            color="blue"
          />

          {/* Evictions */}
          <StatCard
            title="Evictions"
            value={stats.global.evictions}
            subtitle="Entradas removidas"
            icon={<IconArrowDownRight size={20} />}
            color="gray"
          />
        </div>
      )}

      {/* Workspace Info */}
      {stats && stats.workspace.entries > 0 && (
        <div className="bg-muted/50 rounded-lg border p-4">
          <h3 className="mb-2 text-sm font-medium">
            Estatisticas deste Workspace
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Entradas:</span>
              <span className="ml-2 font-medium">
                {stats.workspace.entries}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Acertos:</span>
              <span className="ml-2 font-medium">{stats.workspace.hits}</span>
            </div>
            <div>
              <span className="text-muted-foreground">
                Entrada mais antiga:
              </span>
              <span className="ml-2 font-medium">
                {formatDate(stats.workspace.oldestEntry)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Clear Cache Actions */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <IconTrash size={16} />
          Gerenciar Cache
        </h3>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleClearCache(false)}
            disabled={clearing || !stats?.workspace.entries}
            className="flex items-center gap-2 rounded border border-yellow-500 px-4 py-2 text-sm text-yellow-500 hover:bg-yellow-500/10 disabled:opacity-50"
          >
            {clearing ? (
              <IconLoader size={14} className="animate-spin" />
            ) : (
              <IconTrash size={14} />
            )}
            Limpar Cache do Workspace
          </button>

          <button
            onClick={() => handleClearCache(true)}
            disabled={clearing || !stats?.global.totalEntries}
            className="flex items-center gap-2 rounded border border-red-500 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          >
            {clearing ? (
              <IconLoader size={14} className="animate-spin" />
            ) : (
              <IconTrash size={14} />
            )}
            Limpar Cache Global
          </button>
        </div>

        <p className="text-muted-foreground mt-2 text-xs">
          Limpar o cache forca novas consultas a API ERP. Use com moderacao para
          evitar sobrecarga.
        </p>
      </div>

      {/* Auto-refresh notice */}
      <div className="text-muted-foreground text-center text-xs">
        Auto-refresh a cada 30 segundos
      </div>
    </div>
  )
}
