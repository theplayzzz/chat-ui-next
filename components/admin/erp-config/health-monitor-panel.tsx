"use client"

/**
 * Health Monitor Panel Component
 * Task 17.5 - Monitoramento de saude do ERP
 *
 * Exibe:
 * - Status atual (healthy/degraded/down)
 * - Uptime 24h
 * - Latencia media
 * - Historico recente de checks
 *
 * Funcionalidades:
 * - Auto-refresh a cada 60s
 * - Botao de health check manual
 *
 * Referencia: PRD RF-006, Task #17
 */

import { FC, useContext, useEffect, useState, useCallback } from "react"
import { ChatbotUIContext } from "@/context/context"
import {
  IconLoader,
  IconRefresh,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconActivity,
  IconHeartbeat,
  IconClock,
  IconChartLine,
  IconCircleCheck,
  IconCircleX,
  IconAlertCircle
} from "@tabler/icons-react"

// =============================================================================
// TYPES
// =============================================================================

interface HealthStatus {
  currentStatus: "healthy" | "degraded" | "down" | "unknown"
  lastCheck: string | null
  latencyMs: number | null
  uptime24h: number
  avgLatency24h: number
  checksLast24h: number
  successRate24h: number
  recentChecks: Array<{
    id: string
    timestamp: string
    status: "healthy" | "degraded" | "down"
    latency_ms: number | null
    error_details: string | null
  }>
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface StatusIndicatorProps {
  status: "healthy" | "degraded" | "down" | "unknown"
  size?: "sm" | "md" | "lg"
}

const StatusIndicator: FC<StatusIndicatorProps> = ({ status, size = "md" }) => {
  const sizes = {
    sm: { icon: 16, text: "text-xs" },
    md: { icon: 20, text: "text-sm" },
    lg: { icon: 32, text: "text-lg" }
  }

  const config = {
    healthy: {
      color: "text-green-500",
      bg: "bg-green-500/10",
      border: "border-green-500/30",
      icon: IconCircleCheck,
      label: "Saudavel"
    },
    degraded: {
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      icon: IconAlertCircle,
      label: "Degradado"
    },
    down: {
      color: "text-red-500",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      icon: IconCircleX,
      label: "Indisponivel"
    },
    unknown: {
      color: "text-gray-500",
      bg: "bg-gray-500/10",
      border: "border-gray-500/30",
      icon: IconAlertCircle,
      label: "Desconhecido"
    }
  }

  const { color, bg, border, icon: Icon, label } = config[status]

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${bg} ${border}`}
    >
      <Icon size={sizes[size].icon} className={color} />
      <span className={`font-medium ${sizes[size].text} ${color}`}>
        {label}
      </span>
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: "up" | "down" | "neutral"
}

const MetricCard: FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend
}) => {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">{title}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        {trend && trend !== "neutral" && (
          <span
            className={`text-xs ${
              trend === "up" ? "text-green-500" : "text-red-500"
            }`}
          >
            {trend === "up" ? "↑" : "↓"}
          </span>
        )}
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

export const HealthMonitorPanel: FC = () => {
  const { selectedWorkspace } = useContext(ChatbotUIContext)

  // State
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Load health status
  const loadHealth = useCallback(async () => {
    if (!selectedWorkspace) return

    try {
      setError(null)

      const response = await fetch(
        `/api/admin/erp-config/health?workspaceId=${selectedWorkspace.id}`
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to load health status")
      }

      const data = await response.json()
      setHealth(data)
      setLastRefresh(new Date())
    } catch (err: any) {
      console.error("Error loading health status:", err)
      setError(err.message || "Failed to load health status")
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace])

  // Initial load
  useEffect(() => {
    loadHealth()
  }, [loadHealth])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadHealth()
    }, 60000)

    return () => clearInterval(interval)
  }, [loadHealth])

  // Manual health check
  const handleManualCheck = async () => {
    if (!selectedWorkspace) return

    try {
      setChecking(true)
      setError(null)

      const response = await fetch(
        `/api/admin/erp-config/health?workspaceId=${selectedWorkspace.id}`,
        { method: "POST" }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to execute health check")
      }

      // Reload health data
      await loadHealth()
    } catch (err: any) {
      console.error("Error executing health check:", err)
      setError(err.message || "Failed to execute health check")
    } finally {
      setChecking(false)
    }
  }

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  }

  // Format time ago
  const formatTimeAgo = (dateString: string | null): string => {
    if (!dateString) return "Nunca"
    const diff = Date.now() - new Date(dateString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "Agora"
    if (minutes < 60) return `${minutes}min atras`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h atras`
    const days = Math.floor(hours / 24)
    return `${days}d atras`
  }

  // Render loading
  if (loading && !health) {
    return (
      <div className="flex items-center justify-center p-8">
        <IconLoader className="animate-spin" size={32} />
        <span className="ml-2">Carregando status de saude...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconHeartbeat size={24} className="text-primary" />
          <h2 className="text-xl font-bold">Monitor de Saude ERP</h2>
          {lastRefresh && (
            <span className="text-muted-foreground text-xs">
              Atualizado: {formatDate(lastRefresh.toISOString())}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadHealth()}
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
          <button
            onClick={handleManualCheck}
            disabled={checking}
            className="flex items-center gap-1 rounded border border-blue-500 px-3 py-1.5 text-sm text-blue-500 hover:bg-blue-500/10"
          >
            {checking ? (
              <IconLoader size={14} className="animate-spin" />
            ) : (
              <IconActivity size={14} />
            )}
            Verificar Agora
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-destructive/10 border-destructive flex items-center gap-2 rounded border p-3">
          <IconAlertTriangle size={16} className="text-destructive" />
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {/* Current Status */}
      {health && (
        <div className="flex items-center gap-4">
          <StatusIndicator status={health.currentStatus} size="lg" />
          <div className="text-muted-foreground text-sm">
            <p>Ultimo check: {formatTimeAgo(health.lastCheck)}</p>
            {health.latencyMs && <p>Latencia: {health.latencyMs}ms</p>}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      {health && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            title="Uptime 24h"
            value={`${health.uptime24h.toFixed(1)}%`}
            subtitle="Disponibilidade"
            icon={<IconChartLine size={20} />}
            trend={
              health.uptime24h >= 99
                ? "up"
                : health.uptime24h >= 95
                  ? "neutral"
                  : "down"
            }
          />
          <MetricCard
            title="Latencia Media"
            value={`${Math.round(health.avgLatency24h)}ms`}
            subtitle="Ultimas 24h"
            icon={<IconClock size={20} />}
            trend={
              health.avgLatency24h <= 1000
                ? "up"
                : health.avgLatency24h <= 2000
                  ? "neutral"
                  : "down"
            }
          />
          <MetricCard
            title="Checks 24h"
            value={health.checksLast24h}
            subtitle="Verificacoes realizadas"
            icon={<IconActivity size={20} />}
          />
          <MetricCard
            title="Taxa de Sucesso"
            value={`${health.successRate24h}%`}
            subtitle="Checks bem sucedidos"
            icon={<IconCircleCheck size={20} />}
            trend={
              health.successRate24h >= 95
                ? "up"
                : health.successRate24h >= 80
                  ? "neutral"
                  : "down"
            }
          />
        </div>
      )}

      {/* Recent Checks History */}
      {health && health.recentChecks.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <IconClock size={16} />
              Verificacoes Recentes
            </h3>
          </div>
          <div className="divide-y">
            {health.recentChecks.map(check => (
              <div
                key={check.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <StatusIndicator status={check.status} size="sm" />
                  <span className="text-muted-foreground text-sm">
                    {formatDate(check.timestamp)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {check.latency_ms && (
                    <span
                      className={
                        check.latency_ms > 3000
                          ? "text-red-500"
                          : check.latency_ms > 1000
                            ? "text-yellow-500"
                            : "text-green-500"
                      }
                    >
                      {check.latency_ms}ms
                    </span>
                  )}
                  {check.error_details && (
                    <span
                      className="max-w-[200px] cursor-help truncate text-red-500"
                      title={check.error_details}
                    >
                      {check.error_details}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {health && health.recentChecks.length === 0 && (
        <div className="bg-muted/50 rounded-lg border p-8 text-center">
          <IconActivity className="text-muted-foreground mx-auto" size={32} />
          <p className="text-muted-foreground mt-2 text-sm">
            Nenhuma verificacao realizada ainda
          </p>
          <button
            onClick={handleManualCheck}
            disabled={checking}
            className="mt-4 rounded border border-blue-500 px-4 py-2 text-sm text-blue-500 hover:bg-blue-500/10"
          >
            {checking ? "Verificando..." : "Executar Primeira Verificacao"}
          </button>
        </div>
      )}

      {/* Auto-refresh notice */}
      <div className="text-muted-foreground text-center text-xs">
        Auto-refresh a cada 60 segundos
      </div>
    </div>
  )
}
