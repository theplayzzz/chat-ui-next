/**
 * Monitoring Module
 *
 * Centralized exports for all monitoring and observability features.
 *
 * Referência: PRD RF-013, Task #14
 */

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

// OpenAI tracing
export {
  OpenAITracer,
  tracedOpenAICall,
  createOpenAITracer,
  type RunType,
  type ToolName,
  type TraceMetadata,
  type TraceResult
} from "./openai-tracer"

// Traced OpenAI client
export {
  createTracedOpenAI,
  traceOpenAICall,
  extractTokenUsage,
  type TracingContext,
  type TokenUsage,
  type CallMetrics
} from "./traced-openai"

// Orchestrator tracing
export {
  OrchestratorTracer,
  createOrchestratorTracer,
  traceStep,
  STEP_NAMES,
  type WorkflowStepName,
  type WorkflowBusinessContext,
  type StepTraceResult,
  type SessionTraceSummary
} from "./orchestrator-tracer"

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
