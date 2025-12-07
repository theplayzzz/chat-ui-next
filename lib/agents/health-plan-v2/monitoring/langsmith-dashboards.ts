/**
 * LangSmith Dashboard Configuration
 *
 * Define dashboards e alertas para monitoramento do RAG.
 * Para aplicar no LangSmith UI, use os filtros e configurações abaixo.
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6D.4
 */

// =============================================================================
// DASHBOARD DEFINITIONS
// =============================================================================

/**
 * Dashboard 1: RAG Quality
 *
 * Métricas de qualidade do sistema RAG
 */
export const RAG_QUALITY_DASHBOARD = {
  name: "RAG Quality",
  description: "Métricas de qualidade do sistema de busca de planos",
  filters: {
    project: "health-plan-agent",
    run_type: "chain",
    name_contains: ["search-plans-graph", "gradeDocuments"]
  },
  charts: [
    {
      name: "Docs Relevantes por Busca",
      type: "line",
      metric: "outputs.searchMetadata.relevantDocs",
      aggregation: "avg",
      timeframe: "24h",
      target: 5,
      alertThreshold: 3
    },
    {
      name: "Taxa de Rewrite",
      type: "gauge",
      metric: "outputs.searchMetadata.rewriteCount",
      calculation: "count(rewriteCount > 0) / count(*)",
      target: 0.3,
      alertThreshold: 0.5
    },
    {
      name: "Score Médio de Grading",
      type: "bar",
      metric: "outputs.gradedDocs[*].gradeResult.score",
      breakdown: ["relevant", "partially_relevant", "irrelevant"],
      timeframe: "7d"
    },
    {
      name: "Distribuição de Scores",
      type: "pie",
      metric: "outputs.gradedDocs[*].gradeResult.score",
      groupBy: "score",
      timeframe: "24h"
    }
  ]
}

/**
 * Dashboard 2: RAG Performance
 *
 * Métricas de performance do sistema RAG
 */
export const RAG_PERFORMANCE_DASHBOARD = {
  name: "RAG Performance",
  description: "Métricas de latência e throughput do sistema de busca",
  filters: {
    project: "health-plan-agent",
    run_type: "chain",
    name_contains: "search-plans-graph"
  },
  charts: [
    {
      name: "Latência Total",
      type: "line",
      metric: "latency_ms",
      aggregation: "p50",
      secondaryAggregation: "p99",
      timeframe: "24h",
      target: 8000,
      alertThreshold: 12000
    },
    {
      name: "Latência por Nó",
      type: "stacked_bar",
      metric: "child_runs.latency_ms",
      groupBy: "name",
      breakdown: [
        "generateQueries",
        "retrieveHierarchical",
        "fusionResults",
        "gradeDocuments",
        "rewriteQuery",
        "formatResults"
      ],
      timeframe: "24h"
    },
    {
      name: "Throughput (buscas/min)",
      type: "line",
      metric: "count",
      aggregation: "rate",
      interval: "1m",
      timeframe: "1h"
    },
    {
      name: "Taxa de Erro",
      type: "line",
      metric: "error",
      aggregation: "rate",
      timeframe: "24h",
      alertThreshold: 0.05
    }
  ]
}

// =============================================================================
// ALERT DEFINITIONS
// =============================================================================

/**
 * Alertas configurados para o sistema RAG
 */
export const RAG_ALERTS = {
  rag_latency_high: {
    name: "RAG Latência Alta",
    description: "Latência do RAG excedeu 12 segundos",
    condition: {
      metric: "latency_ms",
      operator: ">",
      threshold: 12000,
      window: "5m",
      minSamples: 3
    },
    severity: "warning",
    channels: ["slack", "email"],
    runbook: `
      ## Latência Alta no RAG

      ### Verificações imediatas:
      1. Verificar status do Supabase
      2. Verificar latência da OpenAI API (embeddings)
      3. Verificar se há muitos rewrites acontecendo

      ### Ações:
      1. Se Supabase lento: verificar conexões no pool
      2. Se muitos rewrites: verificar qualidade dos dados
      3. Se OpenAI lenta: considerar cache de embeddings
    `
  },
  rag_low_docs: {
    name: "RAG Poucos Docs Relevantes",
    description: "Busca retornando menos de 3 documentos relevantes",
    condition: {
      metric: "outputs.searchMetadata.relevantDocs",
      operator: "<",
      threshold: 3,
      window: "15m",
      minSamples: 5
    },
    severity: "warning",
    channels: ["slack"],
    runbook: `
      ## Poucos Documentos Relevantes

      ### Verificações:
      1. Verificar se há novos perfis de cliente não cobertos
      2. Verificar qualidade dos embeddings
      3. Verificar se plan_metadata está populado

      ### Ações:
      1. Revisar MULTI_QUERY_PROMPT
      2. Verificar índices de busca
      3. Considerar expandir dataset de planos
    `
  },
  rag_high_rewrite: {
    name: "RAG Taxa de Rewrite Alta",
    description: "Taxa de rewrite excedeu 50%",
    condition: {
      metric: "outputs.searchMetadata.rewriteCount",
      aggregation: "avg",
      operator: ">",
      threshold: 1, // média > 1 significa > 50% com pelo menos 1 rewrite
      window: "30m",
      minSamples: 10
    },
    severity: "info",
    channels: ["slack"],
    runbook: `
      ## Taxa de Rewrite Alta

      ### Verificações:
      1. Analisar tipos de queries que estão falhando
      2. Verificar se há padrão nos perfis problemáticos
      3. Revisar prompts de geração de queries

      ### Ações:
      1. Ajustar MULTI_QUERY_PROMPT
      2. Adicionar mais contexto regional
      3. Melhorar cobertura de casos edge
    `
  }
}

// =============================================================================
// EVALUATION METRICS
// =============================================================================

/**
 * Métricas de avaliação para LangSmith Evaluations
 */
export const EVALUATION_METRICS = {
  relevance: {
    name: "Relevance Score",
    description: "Docs retornados são relevantes ao perfil do cliente",
    type: "continuous",
    range: [0, 1],
    target: 0.7,
    weight: 0.4
  },
  groundedness: {
    name: "Groundedness Score",
    description: "Resposta está fundamentada nos documentos",
    type: "continuous",
    range: [0, 1],
    target: 0.7,
    weight: 0.3
  },
  retrieval_quality: {
    name: "Retrieval Quality Score",
    description: "Qualidade geral da busca (docs, rewrites, diversidade)",
    type: "continuous",
    range: [0, 1],
    target: 0.7,
    weight: 0.3
  }
}

// =============================================================================
// LANGSMITH FILTERS
// =============================================================================

/**
 * Filtros úteis para análise no LangSmith UI
 */
export const USEFUL_FILTERS = {
  // Todas as buscas de planos
  allSearches: {
    name: "search-plans-graph",
    run_type: "chain"
  },
  // Buscas com poucos resultados
  lowResults: {
    name: "search-plans-graph",
    "outputs.searchMetadata.relevantDocs": { $lt: 3 }
  },
  // Buscas com rewrites
  withRewrites: {
    name: "search-plans-graph",
    "outputs.searchMetadata.rewriteCount": { $gt: 0 }
  },
  // Buscas lentas
  slowSearches: {
    name: "search-plans-graph",
    latency_ms: { $gt: 8000 }
  },
  // Por categoria de cliente
  byAge: (ageRange: string) => ({
    name: "search-plans-graph",
    "inputs.clientInfo.age":
      ageRange === "jovem"
        ? { $lte: 35 }
        : ageRange === "adulto"
          ? { $gt: 35, $lt: 60 }
          : { $gte: 60 }
  }),
  // Por região
  byRegion: (state: string) => ({
    name: "search-plans-graph",
    "inputs.clientInfo.state": state
  })
}

// =============================================================================
// EXPORTS
// =============================================================================

export const LANGSMITH_DASHBOARDS = {
  quality: RAG_QUALITY_DASHBOARD,
  performance: RAG_PERFORMANCE_DASHBOARD
}

export const LANGSMITH_ALERTS = RAG_ALERTS
