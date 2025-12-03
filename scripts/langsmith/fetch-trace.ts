/**
 * LangSmith Trace Fetcher
 *
 * Este script coleta todas as runs de um trace específico do LangSmith
 * e salva os dados organizados em arquivos JSON para análise posterior.
 *
 * Uso:
 *   npx tsx scripts/langsmith/fetch-trace.ts <TRACE_ID>
 *
 * Exemplo:
 *   npx tsx scripts/langsmith/fetch-trace.ts 019ae160-3d81-7000-8000-0653eb0edc78
 *
 * Output:
 *   - scripts/langsmith/traces/trace-<LAST_4_DIGITS>.json (dados completos)
 *   - scripts/langsmith/traces/trace-<LAST_4_DIGITS>-summary.json (resumo)
 */

import { Client, Run } from "langsmith";
import * as fs from "fs";
import * as path from "path";

// Configuração
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY;
const OUTPUT_DIR = path.join(__dirname, "traces");

interface RunSummary {
  id: string;
  name: string;
  runType: string;
  status: string;
  parentId: string | null;
  startTime: string;
  endTime: string;
  latencySeconds: number | null;
  tokens: {
    total: number;
    prompt: number;
    completion: number;
  } | null;
  error: string | null;
  finishReason: string | null;
  model: string | null;
}

interface TraceSummary {
  traceId: string;
  shortId: string;
  fetchedAt: string;
  totalRuns: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalDurationSeconds: number;
  status: string;
  problems: {
    truncatedResponses: string[];
    errors: string[];
  };
  hierarchy: string[];
  runs: RunSummary[];
}

function getShortId(traceId: string): string {
  return traceId.slice(-4);
}

function getLatency(run: Run): number | null {
  if (run.start_time && run.end_time) {
    const start = new Date(run.start_time).getTime();
    const end = new Date(run.end_time).getTime();
    return (end - start) / 1000;
  }
  return null;
}

function getFinishReason(run: Run): string | null {
  const outputs = run.outputs as any;
  return outputs?.choices?.[0]?.finish_reason || null;
}

function getModel(run: Run): string | null {
  const inputs = run.inputs as any;
  const outputs = run.outputs as any;
  return inputs?.model || outputs?.model || null;
}

function buildHierarchy(runs: Run[]): string[] {
  const runMap = new Map(runs.map((r) => [r.id, r]));
  const lines: string[] = [];

  function printTree(run: Run, indent: number = 0): void {
    const prefix = "  ".repeat(indent) + (indent > 0 ? "├── " : "");
    const finishReason = getFinishReason(run);
    const statusIcon = run.error
      ? "❌"
      : finishReason === "length"
        ? "⚠️"
        : "✅";
    const latency = getLatency(run);
    const latencyStr = latency ? `${latency.toFixed(2)}s` : "?s";
    const model = getModel(run);
    const modelStr = model ? ` [${model}]` : "";

    lines.push(`${prefix}${statusIcon} ${run.name} (${run.run_type})${modelStr} - ${latencyStr}`);

    const children = runs.filter((r) => r.parent_run_id === run.id);
    children.forEach((child) => printTree(child, indent + 1));
  }

  const rootRuns = runs.filter((r) => !r.parent_run_id);
  rootRuns.forEach((root) => printTree(root));

  return lines;
}

function createRunSummary(run: Run): RunSummary {
  return {
    id: run.id,
    name: run.name,
    runType: run.run_type,
    status: run.status || "unknown",
    parentId: run.parent_run_id || null,
    startTime: run.start_time?.toString() || "",
    endTime: run.end_time?.toString() || "",
    latencySeconds: getLatency(run),
    tokens:
      run.total_tokens
        ? {
            total: run.total_tokens,
            prompt: run.prompt_tokens || 0,
            completion: run.completion_tokens || 0,
          }
        : null,
    error: run.error ? JSON.stringify(run.error) : null,
    finishReason: getFinishReason(run),
    model: getModel(run),
  };
}

async function fetchTrace(traceId: string): Promise<void> {
  if (!LANGSMITH_API_KEY) {
    console.error("❌ Erro: LANGSMITH_API_KEY não configurada");
    console.error("   Configure a variável de ambiente ou adicione ao .env.local");
    process.exit(1);
  }

  const shortId = getShortId(traceId);
  console.log("═".repeat(80));
  console.log(`📊 LangSmith Trace Fetcher`);
  console.log("═".repeat(80));
  console.log(`\nTrace ID: ${traceId}`);
  console.log(`Short ID: ${shortId}`);
  console.log(`\nBuscando runs...`);

  const client = new Client({
    apiKey: LANGSMITH_API_KEY,
  });

  try {
    const runs: Run[] = [];

    for await (const run of client.listRuns({
      traceId: traceId,
    })) {
      runs.push(run);
    }

    if (runs.length === 0) {
      console.error(`\n❌ Nenhuma run encontrada para o trace ${traceId}`);
      console.error("   Verifique se o trace_id está correto e se você tem acesso ao projeto.");
      process.exit(1);
    }

    console.log(`✅ ${runs.length} runs encontradas\n`);

    // Ordenar por start_time
    runs.sort(
      (a, b) =>
        new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime()
    );

    // Calcular métricas
    const totalTokens = runs.reduce((acc, r) => acc + (r.total_tokens || 0), 0);
    const promptTokens = runs.reduce((acc, r) => acc + (r.prompt_tokens || 0), 0);
    const completionTokens = runs.reduce((acc, r) => acc + (r.completion_tokens || 0), 0);

    const rootRun = runs.find((r) => !r.parent_run_id);
    const totalDuration = rootRun ? getLatency(rootRun) || 0 : 0;

    // Identificar problemas
    const truncatedResponses = runs
      .filter((r) => getFinishReason(r) === "length")
      .map((r) => `${r.name} (${r.id})`);

    const errors = runs
      .filter((r) => r.error || (r.outputs as any)?.error)
      .map((r) => {
        const errorMsg = r.error || (r.outputs as any)?.error;
        return `${r.name}: ${typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg)}`;
      });

    // Criar resumo
    const summary: TraceSummary = {
      traceId,
      shortId,
      fetchedAt: new Date().toISOString(),
      totalRuns: runs.length,
      totalTokens,
      promptTokens,
      completionTokens,
      totalDurationSeconds: totalDuration,
      status: rootRun?.status || "unknown",
      problems: {
        truncatedResponses,
        errors,
      },
      hierarchy: buildHierarchy(runs),
      runs: runs.map(createRunSummary),
    };

    // Garantir que o diretório existe
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Salvar arquivos
    const fullDataPath = path.join(OUTPUT_DIR, `trace-${shortId}.json`);
    const summaryPath = path.join(OUTPUT_DIR, `trace-${shortId}-summary.json`);

    fs.writeFileSync(fullDataPath, JSON.stringify(runs, null, 2));
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Exibir resumo no console
    console.log("─".repeat(80));
    console.log("📈 RESUMO DO TRACE");
    console.log("─".repeat(80));
    console.log(`\nTotal de runs: ${runs.length}`);
    console.log(`Total de tokens: ${totalTokens.toLocaleString()}`);
    console.log(`  - Prompt: ${promptTokens.toLocaleString()}`);
    console.log(`  - Completion: ${completionTokens.toLocaleString()}`);
    console.log(`Duração total: ${totalDuration.toFixed(2)}s`);
    console.log(`Status: ${rootRun?.status || "unknown"}`);

    console.log("\n─".repeat(80));
    console.log("🌳 HIERARQUIA");
    console.log("─".repeat(80));
    summary.hierarchy.forEach((line) => console.log(line));

    if (truncatedResponses.length > 0 || errors.length > 0) {
      console.log("\n─".repeat(80));
      console.log("⚠️ PROBLEMAS IDENTIFICADOS");
      console.log("─".repeat(80));

      if (truncatedResponses.length > 0) {
        console.log(`\n🔸 ${truncatedResponses.length} respostas truncadas:`);
        truncatedResponses.forEach((r) => console.log(`   - ${r}`));
      }

      if (errors.length > 0) {
        console.log(`\n🔸 ${errors.length} erros:`);
        errors.forEach((e) => console.log(`   - ${e}`));
      }
    }

    console.log("\n─".repeat(80));
    console.log("💾 ARQUIVOS GERADOS");
    console.log("─".repeat(80));
    console.log(`\n✅ Dados completos: ${fullDataPath}`);
    console.log(`✅ Resumo: ${summaryPath}`);
    console.log();
  } catch (error) {
    console.error("\n❌ Erro ao buscar trace:", error);
    process.exit(1);
  }
}

// Main
const traceId = process.argv[2];

if (!traceId) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                         LangSmith Trace Fetcher                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Uso:                                                                        ║
║    npx tsx scripts/langsmith/fetch-trace.ts <TRACE_ID>                       ║
║                                                                              ║
║  Exemplo:                                                                    ║
║    npx tsx scripts/langsmith/fetch-trace.ts 019ae160-3d81-7000-8000-0653eb0edc78 ║
║                                                                              ║
║  Requisitos:                                                                 ║
║    - LANGSMITH_API_KEY configurada no ambiente ou .env.local                 ║
║                                                                              ║
║  Output:                                                                     ║
║    - traces/trace-<XXXX>.json        (dados completos)                       ║
║    - traces/trace-<XXXX>-summary.json (resumo estruturado)                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

fetchTrace(traceId);
