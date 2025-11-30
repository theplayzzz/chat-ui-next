/**
 * Alerts System Tests
 *
 * Tests for alert management and rule evaluation.
 *
 * Referência: Task #14.7
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  AlertManager,
  createAlertManager,
  checkLatencyAlert,
  checkCostAlert,
  checkTokenAlert,
  checkBusinessAlert,
  formatAlert,
  formatAlertSummary,
  DEFAULT_ALERT_RULES,
  type AlertRule
} from "../alerts"

describe("AlertManager", () => {
  let manager: AlertManager

  beforeEach(() => {
    manager = createAlertManager(
      "corr-123",
      "session-456",
      "workspace-789",
      undefined,
      false // Don't log to console during tests
    )
  })

  describe("initialization", () => {
    it("should create manager with default rules", () => {
      const rules = manager.getRules()
      expect(rules.length).toBeGreaterThan(0)
      expect(rules.find(r => r.id === "latency-step-warning")).toBeDefined()
    })

    it("should allow custom rules", () => {
      const customRule: AlertRule = {
        id: "custom-rule",
        name: "Custom Rule",
        description: "Test rule",
        enabled: true,
        severity: "warning",
        category: "latency",
        metric: "custom_metric",
        operator: "gt",
        threshold: 100,
        cooldownMs: 1000
      }

      const customManager = createAlertManager(
        "corr",
        "sess",
        "ws",
        [customRule],
        false
      )

      const rules = customManager.getRules()
      expect(rules.find(r => r.id === "custom-rule")).toBeDefined()
    })
  })

  describe("checkMetric", () => {
    it("should trigger alert when threshold exceeded", () => {
      const results = manager.checkMetric("step_latency_ms", 25000)

      const triggered = results.filter(r => r.triggered && r.alert)
      expect(triggered.length).toBeGreaterThan(0)

      const alert = triggered[0].alert!
      expect(alert.severity).toBe("warning")
      expect(alert.metric).toBe("step_latency_ms")
      expect(alert.currentValue).toBe(25000)
    })

    it("should not trigger alert when below threshold", () => {
      const results = manager.checkMetric("step_latency_ms", 5000)

      const triggered = results.filter(r => r.triggered && r.alert)
      expect(triggered).toHaveLength(0)
    })

    it("should trigger critical alert for high values", () => {
      const results = manager.checkMetric("step_latency_ms", 50000)

      const criticalAlerts = results.filter(
        r => r.triggered && r.alert?.severity === "critical"
      )
      expect(criticalAlerts.length).toBeGreaterThan(0)
    })

    it("should suppress alerts during cooldown", () => {
      // First check - should trigger
      const results1 = manager.checkMetric("step_latency_ms", 25000)
      const triggered1 = results1.filter(r => r.triggered && r.alert)
      expect(triggered1.length).toBeGreaterThan(0)

      // Second check - should be suppressed
      const results2 = manager.checkMetric("step_latency_ms", 26000)
      const suppressed = results2.filter(r => r.suppressed)
      expect(suppressed.length).toBeGreaterThan(0)
      expect(suppressed[0].suppressReason).toContain("Cooldown")
    })

    it("should include metadata in alert", () => {
      const results = manager.checkMetric("step_latency_ms", 25000, {
        stepName: "extractClientInfo",
        stepNumber: 1
      })

      const alert = results.find(r => r.alert)?.alert
      expect(alert?.metadata?.stepName).toBe("extractClientInfo")
      expect(alert?.metadata?.stepNumber).toBe(1)
    })
  })

  describe("rule evaluation operators", () => {
    beforeEach(() => {
      manager.clearAlerts()
    })

    it("should evaluate gt operator", () => {
      manager.addRule({
        id: "test-gt",
        name: "Test GT",
        description: "Test",
        enabled: true,
        severity: "info",
        category: "latency",
        metric: "test_metric",
        operator: "gt",
        threshold: 100,
        cooldownMs: 0
      })

      expect(manager.checkMetric("test_metric", 101).some(r => r.alert)).toBe(
        true
      )
      expect(manager.checkMetric("test_metric", 100).some(r => r.alert)).toBe(
        false
      )
      expect(manager.checkMetric("test_metric", 99).some(r => r.alert)).toBe(
        false
      )
    })

    it("should evaluate gte operator", () => {
      manager.addRule({
        id: "test-gte",
        name: "Test GTE",
        description: "Test",
        enabled: true,
        severity: "info",
        category: "latency",
        metric: "test_gte",
        operator: "gte",
        threshold: 100,
        cooldownMs: 0
      })

      expect(manager.checkMetric("test_gte", 101).some(r => r.alert)).toBe(true)
      expect(manager.checkMetric("test_gte", 100).some(r => r.alert)).toBe(true)
      expect(manager.checkMetric("test_gte", 99).some(r => r.alert)).toBe(false)
    })

    it("should evaluate lt operator", () => {
      manager.addRule({
        id: "test-lt",
        name: "Test LT",
        description: "Test",
        enabled: true,
        severity: "info",
        category: "business",
        metric: "test_lt",
        operator: "lt",
        threshold: 50,
        cooldownMs: 0
      })

      expect(manager.checkMetric("test_lt", 49).some(r => r.alert)).toBe(true)
      expect(manager.checkMetric("test_lt", 50).some(r => r.alert)).toBe(false)
      expect(manager.checkMetric("test_lt", 51).some(r => r.alert)).toBe(false)
    })

    it("should evaluate eq operator", () => {
      manager.addRule({
        id: "test-eq",
        name: "Test EQ",
        description: "Test",
        enabled: true,
        severity: "info",
        category: "business",
        metric: "test_eq",
        operator: "eq",
        threshold: 0,
        cooldownMs: 0
      })

      expect(manager.checkMetric("test_eq", 0).some(r => r.alert)).toBe(true)
      expect(manager.checkMetric("test_eq", 1).some(r => r.alert)).toBe(false)
    })
  })

  describe("alert management", () => {
    beforeEach(() => {
      // Trigger an alert
      manager.checkMetric("step_latency_ms", 50000)
    })

    it("should store alerts", () => {
      const alerts = manager.getAlerts()
      expect(alerts.length).toBeGreaterThan(0)
    })

    it("should acknowledge alert", () => {
      const alerts = manager.getAlerts()
      const alertId = alerts[0].id

      const result = manager.acknowledgeAlert(alertId, "test-user")
      expect(result).toBe(true)

      const acknowledged = manager.getAlertsByStatus("acknowledged")
      expect(acknowledged).toHaveLength(1)
      expect(acknowledged[0].acknowledgedBy).toBe("test-user")
    })

    it("should resolve alert", () => {
      const alerts = manager.getAlerts()
      const alertId = alerts[0].id

      const result = manager.resolveAlert(alertId)
      expect(result).toBe(true)

      const resolved = manager.getAlertsByStatus("resolved")
      expect(resolved).toHaveLength(1)
      expect(resolved[0].resolvedAt).toBeTruthy()
    })

    it("should return false for non-existent alert", () => {
      expect(manager.acknowledgeAlert("non-existent")).toBe(false)
      expect(manager.resolveAlert("non-existent")).toBe(false)
    })
  })

  describe("filtering", () => {
    beforeEach(() => {
      manager.clearAlerts()
      // Trigger various alerts
      manager.checkMetric("step_latency_ms", 50000) // critical latency
      manager.checkMetric("session_cost_usd", 1.0) // critical cost
    })

    it("should filter by severity", () => {
      const critical = manager.getAlertsBySeverity("critical")
      expect(critical.length).toBeGreaterThan(0)
      expect(critical.every(a => a.severity === "critical")).toBe(true)
    })

    it("should filter by category", () => {
      const latencyAlerts = manager.getAlertsByCategory("latency")
      expect(latencyAlerts.every(a => a.category === "latency")).toBe(true)

      const costAlerts = manager.getAlertsByCategory("cost")
      expect(costAlerts.every(a => a.category === "cost")).toBe(true)
    })

    it("should filter by status", () => {
      const active = manager.getAlertsByStatus("active")
      expect(active.length).toBeGreaterThan(0)
      expect(active.every(a => a.status === "active")).toBe(true)
    })
  })

  describe("summary", () => {
    it("should generate summary with empty alerts", () => {
      manager.clearAlerts()
      const summary = manager.getSummary()

      expect(summary.total).toBe(0)
      expect(summary.active).toBe(0)
      expect(summary.bySeverity.critical).toBe(0)
    })

    it("should generate summary with alerts", () => {
      manager.clearAlerts()
      manager.checkMetric("step_latency_ms", 50000) // triggers warning + critical
      manager.checkMetric("session_cost_usd", 1.0) // triggers warning + critical

      const summary = manager.getSummary()

      expect(summary.total).toBeGreaterThan(0)
      expect(summary.active).toBeGreaterThan(0)
      expect(summary.bySeverity.critical).toBeGreaterThan(0)
    })

    it("should track acknowledged and resolved counts", () => {
      manager.clearAlerts()
      manager.checkMetric("step_latency_ms", 50000)

      const alerts = manager.getAlerts()
      manager.acknowledgeAlert(alerts[0].id)
      if (alerts.length > 1) {
        manager.resolveAlert(alerts[1].id)
      }

      const summary = manager.getSummary()
      expect(summary.acknowledged).toBeGreaterThanOrEqual(1)
    })
  })

  describe("rule management", () => {
    it("should add new rule", () => {
      const initialCount = manager.getRules().length

      manager.addRule({
        id: "new-rule",
        name: "New Rule",
        description: "Test",
        enabled: true,
        severity: "info",
        category: "business",
        metric: "new_metric",
        operator: "gt",
        threshold: 50,
        cooldownMs: 1000
      })

      expect(manager.getRules().length).toBe(initialCount + 1)
    })

    it("should remove rule", () => {
      manager.addRule({
        id: "temp-rule",
        name: "Temp",
        description: "Temp",
        enabled: true,
        severity: "info",
        category: "business",
        metric: "temp",
        operator: "gt",
        threshold: 50,
        cooldownMs: 1000
      })

      const result = manager.removeRule("temp-rule")
      expect(result).toBe(true)

      const rules = manager.getRules()
      expect(rules.find(r => r.id === "temp-rule")).toBeUndefined()
    })

    it("should enable/disable rule", () => {
      const ruleId = "latency-step-warning"

      manager.setRuleEnabled(ruleId, false)
      const disabledRule = manager.getRules().find(r => r.id === ruleId)
      expect(disabledRule?.enabled).toBe(false)

      manager.setRuleEnabled(ruleId, true)
      const enabledRule = manager.getRules().find(r => r.id === ruleId)
      expect(enabledRule?.enabled).toBe(true)
    })

    it("should not check disabled rules", () => {
      manager.clearAlerts()
      manager.setRuleEnabled("latency-step-warning", false)
      manager.setRuleEnabled("latency-step-critical", false)

      const results = manager.checkMetric("step_latency_ms", 50000)
      const triggered = results.filter(r => r.alert)

      // Only session latency rules should trigger, not step latency
      expect(triggered.every(t => !t.alert?.title.includes("Step"))).toBe(true)
    })
  })

  describe("getActiveAlertCount", () => {
    it("should return count of active alerts", () => {
      manager.clearAlerts()
      // Add a test rule with 0 cooldown to ensure it always triggers
      manager.addRule({
        id: "test-active-count",
        name: "Test Active Count",
        description: "Test rule",
        enabled: true,
        severity: "warning",
        category: "latency",
        metric: "test_active_metric",
        operator: "gt",
        threshold: 100,
        cooldownMs: 0
      })

      expect(manager.getActiveAlertCount()).toBe(0)

      manager.checkMetric("test_active_metric", 500)
      expect(manager.getActiveAlertCount()).toBeGreaterThan(0)

      const alerts = manager.getAlerts()
      manager.resolveAlert(alerts[0].id)

      const activeAfterResolve = manager.getActiveAlertCount()
      expect(activeAfterResolve).toBe(alerts.length - 1)
    })
  })
})

describe("DEFAULT_ALERT_RULES", () => {
  it("should have latency rules", () => {
    const latencyRules = DEFAULT_ALERT_RULES.filter(
      r => r.category === "latency"
    )
    expect(latencyRules.length).toBeGreaterThanOrEqual(4)
  })

  it("should have cost rules", () => {
    const costRules = DEFAULT_ALERT_RULES.filter(r => r.category === "cost")
    expect(costRules.length).toBeGreaterThanOrEqual(2)
  })

  it("should have token rules", () => {
    const tokenRules = DEFAULT_ALERT_RULES.filter(r => r.category === "tokens")
    expect(tokenRules.length).toBeGreaterThanOrEqual(2)
  })

  it("should have business rules", () => {
    const businessRules = DEFAULT_ALERT_RULES.filter(
      r => r.category === "business"
    )
    expect(businessRules.length).toBeGreaterThanOrEqual(2)
  })

  it("should have valid structure", () => {
    for (const rule of DEFAULT_ALERT_RULES) {
      expect(rule.id).toBeTruthy()
      expect(rule.name).toBeTruthy()
      expect(rule.metric).toBeTruthy()
      expect(rule.threshold).toBeDefined()
      expect(rule.cooldownMs).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("Convenience Functions", () => {
  let manager: AlertManager

  beforeEach(() => {
    // Create manager with custom rules that have 0 cooldown for reliable testing
    const testRules: AlertRule[] = [
      {
        id: "test-step-latency",
        name: "Test Step Latency",
        description: "Test",
        enabled: true,
        severity: "warning",
        category: "latency",
        metric: "step_latency_ms",
        operator: "gt",
        threshold: 20000,
        cooldownMs: 0
      },
      {
        id: "test-llm-latency",
        name: "Test LLM Latency",
        description: "Test",
        enabled: true,
        severity: "warning",
        category: "latency",
        metric: "llm_latency_ms",
        operator: "gt",
        threshold: 10000,
        cooldownMs: 0
      },
      {
        id: "test-session-latency",
        name: "Test Session Latency",
        description: "Test",
        enabled: true,
        severity: "warning",
        category: "latency",
        metric: "session_latency_ms",
        operator: "gt",
        threshold: 90000,
        cooldownMs: 0
      },
      {
        id: "test-cost",
        name: "Test Cost",
        description: "Test",
        enabled: true,
        severity: "warning",
        category: "cost",
        metric: "session_cost_usd",
        operator: "gt",
        threshold: 0.25,
        cooldownMs: 0
      },
      {
        id: "test-tokens",
        name: "Test Tokens",
        description: "Test",
        enabled: true,
        severity: "warning",
        category: "tokens",
        metric: "session_tokens",
        operator: "gt",
        threshold: 30000,
        cooldownMs: 0
      },
      {
        id: "test-plans",
        name: "Test Plans",
        description: "Test",
        enabled: true,
        severity: "warning",
        category: "business",
        metric: "plans_found",
        operator: "eq",
        threshold: 0,
        cooldownMs: 0
      },
      {
        id: "test-completeness",
        name: "Test Completeness",
        description: "Test",
        enabled: true,
        severity: "info",
        category: "business",
        metric: "client_completeness",
        operator: "lt",
        threshold: 50,
        cooldownMs: 0
      }
    ]
    manager = createAlertManager("corr", "sess", "ws", testRules, false)
  })

  describe("checkLatencyAlert", () => {
    it("should check step latency", () => {
      const results = checkLatencyAlert(manager, "step", 50000)
      expect(results.some(r => r.alert)).toBe(true)
    })

    it("should check llm latency", () => {
      const results = checkLatencyAlert(manager, "llm", 15000)
      expect(results.some(r => r.alert)).toBe(true)
    })

    it("should check session latency", () => {
      const results = checkLatencyAlert(manager, "session", 100000)
      expect(results.some(r => r.alert)).toBe(true)
    })
  })

  describe("checkCostAlert", () => {
    it("should check cost", () => {
      const results = checkCostAlert(manager, 0.5)
      expect(results.some(r => r.alert)).toBe(true)
    })
  })

  describe("checkTokenAlert", () => {
    it("should check tokens", () => {
      const results = checkTokenAlert(manager, 50000)
      expect(results.some(r => r.alert)).toBe(true)
    })
  })

  describe("checkBusinessAlert", () => {
    it("should check plans_found", () => {
      const results = checkBusinessAlert(manager, "plans_found", 0)
      expect(results.some(r => r.alert)).toBe(true)
    })

    it("should check client_completeness", () => {
      const results = checkBusinessAlert(manager, "client_completeness", 30)
      expect(results.some(r => r.alert)).toBe(true)
    })
  })
})

describe("formatAlert", () => {
  it("should format critical alert", () => {
    const alert = {
      id: "test",
      timestamp: new Date().toISOString(),
      severity: "critical" as const,
      category: "latency" as const,
      title: "High Latency",
      message: "Latency exceeded",
      metric: "step_latency_ms",
      currentValue: 50000,
      threshold: 30000,
      status: "active" as const
    }

    const formatted = formatAlert(alert)
    expect(formatted).toContain("[!!!]")
    expect(formatted).toContain("High Latency")
  })

  it("should format warning alert", () => {
    const alert = {
      id: "test",
      timestamp: new Date().toISOString(),
      severity: "warning" as const,
      category: "cost" as const,
      title: "Cost Warning",
      message: "Cost exceeded",
      metric: "session_cost_usd",
      currentValue: 0.5,
      threshold: 0.25,
      status: "active" as const
    }

    const formatted = formatAlert(alert)
    expect(formatted).toContain("[!]")
  })

  it("should format info alert", () => {
    const alert = {
      id: "test",
      timestamp: new Date().toISOString(),
      severity: "info" as const,
      category: "business" as const,
      title: "Info",
      message: "Info message",
      metric: "test",
      currentValue: 10,
      threshold: 50,
      status: "active" as const
    }

    const formatted = formatAlert(alert)
    expect(formatted).toContain("[i]")
  })
})

describe("formatAlertSummary", () => {
  it("should format summary", () => {
    const manager = createAlertManager("corr", "sess", "ws", undefined, false)
    manager.checkMetric("step_latency_ms", 50000)

    const summary = formatAlertSummary(manager)

    expect(summary).toContain("ALERT SUMMARY")
    expect(summary).toContain("Total:")
    expect(summary).toContain("Active:")
    expect(summary).toContain("By Severity:")
    expect(summary).toContain("Critical:")
  })
})
