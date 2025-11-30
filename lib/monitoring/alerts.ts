/**
 * Alerts System
 *
 * Provides alert management for performance and error monitoring.
 * All alerts are logged in structured format for log aggregation tools.
 *
 * Alert flow:
 * 1. Define alert rules with thresholds
 * 2. Check metrics against rules
 * 3. Generate alerts when thresholds are exceeded
 * 4. Log alerts in structured JSON format
 * 5. Track alert history for analysis
 *
 * Referência: PRD RF-013, Task #14.7
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Alert severity levels
 */
export type AlertSeverity = "info" | "warning" | "critical"

/**
 * Alert categories
 */
export type AlertCategory =
  | "latency"
  | "cost"
  | "tokens"
  | "error_rate"
  | "availability"
  | "business"

/**
 * Alert status
 */
export type AlertStatus = "active" | "resolved" | "acknowledged"

/**
 * Alert definition
 */
export interface Alert {
  id: string
  timestamp: string
  severity: AlertSeverity
  category: AlertCategory
  title: string
  message: string
  metric: string
  currentValue: number
  threshold: number
  correlationId?: string
  sessionId?: string
  workspaceId?: string
  metadata?: Record<string, any>
  status: AlertStatus
  resolvedAt?: string
  acknowledgedAt?: string
  acknowledgedBy?: string
}

/**
 * Alert rule definition
 */
export interface AlertRule {
  id: string
  name: string
  description: string
  enabled: boolean
  severity: AlertSeverity
  category: AlertCategory
  metric: string
  operator: "gt" | "gte" | "lt" | "lte" | "eq"
  threshold: number
  /** Cooldown period in ms to prevent alert spam */
  cooldownMs: number
  /** Custom message template */
  messageTemplate?: string
}

/**
 * Alert check result
 */
export interface AlertCheckResult {
  triggered: boolean
  alert?: Alert
  suppressed?: boolean
  suppressReason?: string
}

// =============================================================================
// DEFAULT ALERT RULES
// =============================================================================

/**
 * Default alert rules for health plan workflow
 */
export const DEFAULT_ALERT_RULES: AlertRule[] = [
  // Latency alerts
  {
    id: "latency-step-warning",
    name: "High Step Latency",
    description: "Step execution taking longer than expected",
    enabled: true,
    severity: "warning",
    category: "latency",
    metric: "step_latency_ms",
    operator: "gt",
    threshold: 20000,
    cooldownMs: 60000,
    messageTemplate:
      "Step latency ({value}ms) exceeded threshold ({threshold}ms)"
  },
  {
    id: "latency-step-critical",
    name: "Critical Step Latency",
    description: "Step execution critically slow",
    enabled: true,
    severity: "critical",
    category: "latency",
    metric: "step_latency_ms",
    operator: "gt",
    threshold: 45000,
    cooldownMs: 30000,
    messageTemplate:
      "Critical step latency: {value}ms (threshold: {threshold}ms)"
  },
  {
    id: "latency-llm-warning",
    name: "High LLM Latency",
    description: "LLM call taking longer than expected",
    enabled: true,
    severity: "warning",
    category: "latency",
    metric: "llm_latency_ms",
    operator: "gt",
    threshold: 10000,
    cooldownMs: 60000
  },
  {
    id: "latency-session-warning",
    name: "High Session Latency",
    description: "Total session time exceeding threshold",
    enabled: true,
    severity: "warning",
    category: "latency",
    metric: "session_latency_ms",
    operator: "gt",
    threshold: 90000,
    cooldownMs: 120000
  },
  {
    id: "latency-session-critical",
    name: "Critical Session Latency",
    description: "Session timeout risk",
    enabled: true,
    severity: "critical",
    category: "latency",
    metric: "session_latency_ms",
    operator: "gt",
    threshold: 150000,
    cooldownMs: 60000
  },

  // Cost alerts
  {
    id: "cost-session-warning",
    name: "High Session Cost",
    description: "Session cost exceeding budget",
    enabled: true,
    severity: "warning",
    category: "cost",
    metric: "session_cost_usd",
    operator: "gt",
    threshold: 0.25,
    cooldownMs: 300000,
    messageTemplate: "Session cost ${value} exceeded budget ${threshold}"
  },
  {
    id: "cost-session-critical",
    name: "Critical Session Cost",
    description: "Session cost critically high",
    enabled: true,
    severity: "critical",
    category: "cost",
    metric: "session_cost_usd",
    operator: "gt",
    threshold: 0.75,
    cooldownMs: 120000
  },

  // Token alerts
  {
    id: "tokens-session-warning",
    name: "High Token Usage",
    description: "Token usage exceeding expected",
    enabled: true,
    severity: "warning",
    category: "tokens",
    metric: "session_tokens",
    operator: "gt",
    threshold: 30000,
    cooldownMs: 300000
  },
  {
    id: "tokens-session-critical",
    name: "Critical Token Usage",
    description: "Token usage critically high",
    enabled: true,
    severity: "critical",
    category: "tokens",
    metric: "session_tokens",
    operator: "gt",
    threshold: 75000,
    cooldownMs: 120000
  },

  // Business alerts
  {
    id: "business-no-plans",
    name: "No Plans Found",
    description: "Search returned no health plans",
    enabled: true,
    severity: "warning",
    category: "business",
    metric: "plans_found",
    operator: "eq",
    threshold: 0,
    cooldownMs: 60000,
    messageTemplate: "No health plans found for client query"
  },
  {
    id: "business-low-completeness",
    name: "Low Client Info",
    description: "Client information completeness is low",
    enabled: true,
    severity: "info",
    category: "business",
    metric: "client_completeness",
    operator: "lt",
    threshold: 50,
    cooldownMs: 60000,
    messageTemplate: "Client info completeness is only {value}%"
  }
]

// =============================================================================
// ALERT MANAGER
// =============================================================================

/**
 * Alert Manager
 *
 * Manages alert rules, checks, and history
 */
export class AlertManager {
  private rules: Map<string, AlertRule> = new Map()
  private alerts: Alert[] = []
  private lastAlertTimes: Map<string, number> = new Map()
  private correlationId: string
  private sessionId: string
  private workspaceId: string
  private logToConsole: boolean

  constructor(
    correlationId: string,
    sessionId: string,
    workspaceId: string,
    customRules?: AlertRule[],
    logToConsole: boolean = true
  ) {
    this.correlationId = correlationId
    this.sessionId = sessionId
    this.workspaceId = workspaceId
    this.logToConsole = logToConsole

    // Load default rules
    for (const rule of DEFAULT_ALERT_RULES) {
      this.rules.set(rule.id, rule)
    }

    // Override with custom rules
    if (customRules) {
      for (const rule of customRules) {
        this.rules.set(rule.id, rule)
      }
    }
  }

  /**
   * Checks a metric value against all matching rules
   *
   * @param metric - Metric name to check
   * @param value - Current value
   * @param metadata - Additional metadata
   * @returns Array of alert check results
   */
  checkMetric(
    metric: string,
    value: number,
    metadata?: Record<string, any>
  ): AlertCheckResult[] {
    const results: AlertCheckResult[] = []

    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.metric !== metric) {
        continue
      }

      const triggered = this.evaluateRule(rule, value)

      if (triggered) {
        const result = this.processTriggeredRule(rule, value, metadata)
        results.push(result)
      }
    }

    return results
  }

  /**
   * Evaluates if a rule is triggered
   */
  private evaluateRule(rule: AlertRule, value: number): boolean {
    switch (rule.operator) {
      case "gt":
        return value > rule.threshold
      case "gte":
        return value >= rule.threshold
      case "lt":
        return value < rule.threshold
      case "lte":
        return value <= rule.threshold
      case "eq":
        return value === rule.threshold
      default:
        return false
    }
  }

  /**
   * Processes a triggered rule
   */
  private processTriggeredRule(
    rule: AlertRule,
    value: number,
    metadata?: Record<string, any>
  ): AlertCheckResult {
    // Check cooldown
    const lastAlertTime = this.lastAlertTimes.get(rule.id)
    const now = Date.now()

    if (lastAlertTime && now - lastAlertTime < rule.cooldownMs) {
      return {
        triggered: true,
        suppressed: true,
        suppressReason: `Cooldown active (${Math.round((rule.cooldownMs - (now - lastAlertTime)) / 1000)}s remaining)`
      }
    }

    // Create alert
    const alert = this.createAlert(rule, value, metadata)

    // Update cooldown
    this.lastAlertTimes.set(rule.id, now)

    // Store and log alert
    this.alerts.push(alert)
    this.logAlert(alert)

    return {
      triggered: true,
      alert
    }
  }

  /**
   * Creates an alert from a rule
   */
  private createAlert(
    rule: AlertRule,
    value: number,
    metadata?: Record<string, any>
  ): Alert {
    const message = rule.messageTemplate
      ? rule.messageTemplate
          .replace("{value}", String(value))
          .replace("{threshold}", String(rule.threshold))
      : `${rule.name}: ${rule.metric} = ${value} (threshold: ${rule.threshold})`

    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      severity: rule.severity,
      category: rule.category,
      title: rule.name,
      message,
      metric: rule.metric,
      currentValue: value,
      threshold: rule.threshold,
      correlationId: this.correlationId,
      sessionId: this.sessionId,
      workspaceId: this.workspaceId,
      metadata,
      status: "active"
    }
  }

  /**
   * Logs an alert in structured format
   */
  private logAlert(alert: Alert): void {
    if (!this.logToConsole) return

    const logEntry = {
      timestamp: alert.timestamp,
      level:
        alert.severity === "critical"
          ? "error"
          : alert.severity === "warning"
            ? "warn"
            : "info",
      type: "alert",
      alert: {
        id: alert.id,
        severity: alert.severity,
        category: alert.category,
        title: alert.title,
        message: alert.message,
        metric: alert.metric,
        value: alert.currentValue,
        threshold: alert.threshold
      },
      context: {
        correlationId: alert.correlationId,
        sessionId: alert.sessionId,
        workspaceId: alert.workspaceId
      },
      metadata: alert.metadata,
      tags: ["health-plan", "alert", alert.severity, alert.category]
    }

    const logMethod =
      alert.severity === "critical"
        ? console.error
        : alert.severity === "warning"
          ? console.warn
          : console.info

    logMethod(JSON.stringify(logEntry))
  }

  /**
   * Acknowledges an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy?: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId)
    if (!alert) return false

    alert.status = "acknowledged"
    alert.acknowledgedAt = new Date().toISOString()
    alert.acknowledgedBy = acknowledgedBy

    return true
  }

  /**
   * Resolves an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId)
    if (!alert) return false

    alert.status = "resolved"
    alert.resolvedAt = new Date().toISOString()

    return true
  }

  /**
   * Gets all alerts
   */
  getAlerts(): Alert[] {
    return [...this.alerts]
  }

  /**
   * Gets alerts by status
   */
  getAlertsByStatus(status: AlertStatus): Alert[] {
    return this.alerts.filter(a => a.status === status)
  }

  /**
   * Gets alerts by severity
   */
  getAlertsBySeverity(severity: AlertSeverity): Alert[] {
    return this.alerts.filter(a => a.severity === severity)
  }

  /**
   * Gets alerts by category
   */
  getAlertsByCategory(category: AlertCategory): Alert[] {
    return this.alerts.filter(a => a.category === category)
  }

  /**
   * Gets active alert count
   */
  getActiveAlertCount(): number {
    return this.alerts.filter(a => a.status === "active").length
  }

  /**
   * Gets alert summary
   */
  getSummary(): {
    total: number
    active: number
    acknowledged: number
    resolved: number
    bySeverity: Record<AlertSeverity, number>
    byCategory: Record<AlertCategory, number>
  } {
    const summary = {
      total: this.alerts.length,
      active: 0,
      acknowledged: 0,
      resolved: 0,
      bySeverity: { info: 0, warning: 0, critical: 0 } as Record<
        AlertSeverity,
        number
      >,
      byCategory: {
        latency: 0,
        cost: 0,
        tokens: 0,
        error_rate: 0,
        availability: 0,
        business: 0
      } as Record<AlertCategory, number>
    }

    for (const alert of this.alerts) {
      // Status counts
      if (alert.status === "active") summary.active++
      else if (alert.status === "acknowledged") summary.acknowledged++
      else if (alert.status === "resolved") summary.resolved++

      // Severity counts
      summary.bySeverity[alert.severity]++

      // Category counts
      summary.byCategory[alert.category]++
    }

    return summary
  }

  /**
   * Adds a custom rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule)
  }

  /**
   * Removes a rule
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId)
  }

  /**
   * Enables/disables a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId)
    if (!rule) return false
    rule.enabled = enabled
    return true
  }

  /**
   * Gets all rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values())
  }

  /**
   * Clears all alerts (for testing)
   */
  clearAlerts(): void {
    this.alerts = []
    this.lastAlertTimes.clear()
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a new alert manager
 */
export function createAlertManager(
  correlationId: string,
  sessionId: string,
  workspaceId: string,
  customRules?: AlertRule[],
  logToConsole: boolean = true
): AlertManager {
  return new AlertManager(
    correlationId,
    sessionId,
    workspaceId,
    customRules,
    logToConsole
  )
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick check for latency alerts
 */
export function checkLatencyAlert(
  manager: AlertManager,
  type: "step" | "llm" | "session",
  latencyMs: number,
  metadata?: Record<string, any>
): AlertCheckResult[] {
  const metric = `${type}_latency_ms`
  return manager.checkMetric(metric, latencyMs, metadata)
}

/**
 * Quick check for cost alerts
 */
export function checkCostAlert(
  manager: AlertManager,
  costUSD: number,
  metadata?: Record<string, any>
): AlertCheckResult[] {
  return manager.checkMetric("session_cost_usd", costUSD, metadata)
}

/**
 * Quick check for token alerts
 */
export function checkTokenAlert(
  manager: AlertManager,
  tokens: number,
  metadata?: Record<string, any>
): AlertCheckResult[] {
  return manager.checkMetric("session_tokens", tokens, metadata)
}

/**
 * Quick check for business alerts
 */
export function checkBusinessAlert(
  manager: AlertManager,
  metric: "plans_found" | "client_completeness",
  value: number,
  metadata?: Record<string, any>
): AlertCheckResult[] {
  return manager.checkMetric(metric, value, metadata)
}

/**
 * Formats an alert for display
 */
export function formatAlert(alert: Alert): string {
  const severityIcon =
    alert.severity === "critical"
      ? "[!!!]"
      : alert.severity === "warning"
        ? "[!]"
        : "[i]"

  return `${severityIcon} ${alert.title}: ${alert.message} (${alert.metric}=${alert.currentValue})`
}

/**
 * Formats alert summary for display
 */
export function formatAlertSummary(manager: AlertManager): string {
  const summary = manager.getSummary()
  const lines: string[] = []

  lines.push("ALERT SUMMARY")
  lines.push("-".repeat(40))
  lines.push(`Total: ${summary.total}`)
  lines.push(`  Active: ${summary.active}`)
  lines.push(`  Acknowledged: ${summary.acknowledged}`)
  lines.push(`  Resolved: ${summary.resolved}`)
  lines.push("")
  lines.push("By Severity:")
  lines.push(`  Critical: ${summary.bySeverity.critical}`)
  lines.push(`  Warning: ${summary.bySeverity.warning}`)
  lines.push(`  Info: ${summary.bySeverity.info}`)

  return lines.join("\n")
}
