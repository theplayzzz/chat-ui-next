"use client"

/**
 * ERP Config Page Component
 * Task 17.5 - Pagina principal com Tabs
 *
 * Integra todos os componentes de configuracao ERP:
 * - Configuracao (ERPConfigForm)
 * - Cache (CacheStatsDashboard)
 * - Historico (APICallHistory)
 * - Saude (HealthMonitorPanel)
 *
 * Referencia: PRD RF-006, Task #17
 */

import { FC, useContext, useState } from "react"
import { ChatbotUIContext } from "@/context/context"
import {
  IconSettings,
  IconDatabase,
  IconHistory,
  IconHeartbeat,
  IconShield,
  IconPlugConnected
} from "@tabler/icons-react"

import { ERPConfigForm } from "./erp-config-form"
import { CacheStatsDashboard } from "./cache-stats-dashboard"
import { APICallHistory } from "./api-call-history"
import { HealthMonitorPanel } from "./health-monitor-panel"

// =============================================================================
// TYPES
// =============================================================================

type TabType = "config" | "cache" | "history" | "health"

interface TabConfig {
  id: TabType
  label: string
  icon: React.ReactNode
  description: string
}

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

const TABS: TabConfig[] = [
  {
    id: "config",
    label: "Configuracao",
    icon: <IconSettings size={18} />,
    description: "Configure a integracao com o ERP"
  },
  {
    id: "health",
    label: "Saude",
    icon: <IconHeartbeat size={18} />,
    description: "Monitore o status da conexao ERP"
  },
  {
    id: "cache",
    label: "Cache",
    icon: <IconDatabase size={18} />,
    description: "Estatisticas e gestao do cache"
  },
  {
    id: "history",
    label: "Historico",
    icon: <IconHistory size={18} />,
    description: "Logs de chamadas API"
  }
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ERPConfigPage: FC = () => {
  const { profile, selectedWorkspace } = useContext(ChatbotUIContext)
  const [activeTab, setActiveTab] = useState<TabType>("config")

  // Check if user is logged in
  const isAuthenticated = !!profile?.user_id

  // Access denied screen
  if (!isAuthenticated) {
    return (
      <div className="flex size-full flex-col items-center justify-center p-8">
        <div className="bg-destructive/10 border-destructive max-w-md rounded-lg border p-6 text-center">
          <IconShield size={48} className="text-destructive mx-auto mb-4" />
          <h2 className="text-destructive mb-2 text-xl font-bold">
            Acesso Negado
          </h2>
          <p className="text-muted-foreground">
            Voce precisa estar autenticado e ter privilegios de administrador
            para acessar esta pagina.
          </p>
        </div>
      </div>
    )
  }

  // No workspace selected
  if (!selectedWorkspace) {
    return (
      <div className="flex size-full flex-col items-center justify-center p-8">
        <div className="bg-muted/50 max-w-md rounded-lg border p-6 text-center">
          <IconPlugConnected
            size={48}
            className="text-muted-foreground mx-auto mb-4"
          />
          <h2 className="mb-2 text-xl font-bold">Selecione um Workspace</h2>
          <p className="text-muted-foreground">
            Por favor, selecione um workspace para configurar a integracao ERP.
          </p>
        </div>
      </div>
    )
  }

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "config":
        return <ERPConfigForm />
      case "health":
        return <HealthMonitorPanel />
      case "cache":
        return <CacheStatsDashboard />
      case "history":
        return <APICallHistory />
      default:
        return null
    }
  }

  return (
    <div className="flex size-full flex-col">
      {/* Page Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <IconPlugConnected size={28} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Integracao ERP</h1>
            <p className="text-muted-foreground text-sm">
              Configure e monitore a integracao com o sistema ERP externo
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b px-6">
        <nav className="-mb-px flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:border-muted hover:text-foreground border-transparent"
              }`}
              title={tab.description}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">{renderTabContent()}</div>
      </div>
    </div>
  )
}
