"use client"

import { ERPConfigPage } from "@/components/admin/erp-config/erp-config-page"

/**
 * ERP Config Admin Page
 * Task #17 - Interface Administrativa ERP
 *
 * Route: /[locale]/[workspaceid]/admin/erp-config
 *
 * Pagina de administracao para configurar e monitorar
 * a integracao com o sistema ERP externo.
 *
 * Funcionalidades:
 * - Configuracao de credenciais e parametros
 * - Dashboard de cache com metricas
 * - Historico de chamadas API
 * - Monitor de saude com health checks
 *
 * Referencia: PRD RF-006, Task #17
 */
export default function ERPConfigAdminPage() {
  return <ERPConfigPage />
}
