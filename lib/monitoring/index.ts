/**
 * Monitoring Module
 *
 * Centralized exports for all monitoring and observability features.
 *
 * Referência: PRD RF-013, Task #14
 */

// =============================================================================
// LANGSMITH SETUP (RECOMMENDED - Nova API)
// =============================================================================

export {
  // Cliente OpenAI com tracing
  createTracedOpenAI,
  createSimpleTracedOpenAI,
  // Traceable e helpers
  traceable,
  getCurrentRunTree,
  RunTree,
  wrapOpenAI,
  // Helpers para steps
  createStepTraceOptions,
  addRunMetadata,
  addRunTags,
  setSessionId,
  // Configuração
  checkLangSmithConfig,
  validateAndLogConfig,
  // Constantes
  WORKFLOW_STEP_NAMES,
  STEP_RUN_TYPES,
  LANGSMITH_DEFAULTS,
  // Types
  type LangSmithRunType,
  type TraceableOptions,
  type ConfigCheckResult,
  type TracedOpenAIConfig,
  type TracedOpenAIClient
} from "./langsmith-setup"

// =============================================================================
// LANGSMITH CONFIG (Legacy - manter para compatibilidade)
// =============================================================================

// LangSmith configuration
export {
  getLangSmithClient,
  isLangSmithEnabled,
  checkLangSmithHealth,
  generateRunId,
  generateChildRunId,
  LANGSMITH_CONFIG,
  Client as LangSmithClient,
  type HealthCheckResult
} from "./langsmith-config"

// =============================================================================
// DEPRECATED - Use langsmith-setup.ts instead
// =============================================================================
// The following modules are deprecated:
// - openai-tracer.ts - Use wrapOpenAI from langsmith-setup
// - traced-openai.ts - Use createTracedOpenAI from langsmith-setup
// - orchestrator-tracer.ts - Use traceable wrappers on individual functions
//
// Migration: See langsmith-setup.ts for the new pattern using official SDK

// Correlation ID management
export {
  generateCorrelationId,
  generateDomainCorrelationId,
  isValidCorrelationId,
  createTracingContext,
  createChildContext,
  getCorrelationHeaders,
  extractCorrelationFromHeaders,
  getLogPrefix,
  getLogMetadata,
  getLangSmithMetadata,
  getLangSmithTags,
  storeContext,
  getStoredContext,
  clearStoredContext,
  getContextStoreSize,
  mergeCorrelationMetadata,
  createCorrelatedError,
  type TracingContext as CorrelationTracingContext,
  type CorrelationHeaders
} from "./correlation"

// Metrics collection
export {
  MetricsCollector,
  createMetricsCollector,
  calculateCost,
  getModelPricing,
  formatCost,
  formatLatency,
  formatTokens,
  formatMetricsSummary,
  MODEL_PRICING,
  type ModelPricing,
  type TokenUsage as MetricsTokenUsage,
  type LatencyMetrics,
  type CostMetrics,
  type LLMCallMetrics,
  type StepMetrics,
  type BusinessMetrics,
  type SessionMetrics
} from "./metrics-collector"

// Performance dashboard
export {
  PerformanceDashboard,
  createPerformanceDashboard,
  calculateStats,
  generatePerformanceReport,
  generateJSONReport,
  DEFAULT_THRESHOLDS,
  type PerformanceLogLevel,
  type PerformanceEventType,
  type PerformanceLogEntry,
  type PerformanceThresholds,
  type MetricStats
} from "./performance-dashboard"

// Alerts system
export {
  AlertManager,
  createAlertManager,
  checkLatencyAlert,
  checkCostAlert,
  checkTokenAlert,
  checkBusinessAlert,
  formatAlert,
  formatAlertSummary,
  DEFAULT_ALERT_RULES,
  type AlertSeverity,
  type AlertCategory,
  type AlertStatus,
  type Alert,
  type AlertRule,
  type AlertCheckResult
} from "./alerts"
