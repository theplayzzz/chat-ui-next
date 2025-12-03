import { Client } from "langsmith";

const TRACE_ID = "019ae160-3d81-7000-8000-0653eb0edc78";

async function fetchTraceRuns() {
  const client = new Client({
    apiKey: process.env.LANGSMITH_API_KEY,
  });

  console.log("=== Buscando todas as runs do trace ===");
  console.log(`Trace ID: ${TRACE_ID}\n`);

  try {
    // Método 1: Usar trace_id diretamente
    const runs: any[] = [];

    for await (const run of client.listRuns({
      traceId: TRACE_ID,
    })) {
      runs.push(run);
    }

    console.log(`Total de runs encontradas: ${runs.length}\n`);

    // Ordenar por hierarquia (root primeiro, depois por start_time)
    runs.sort((a, b) => {
      // Root runs primeiro
      if (!a.parent_run_id && b.parent_run_id) return -1;
      if (a.parent_run_id && !b.parent_run_id) return 1;
      // Depois por start_time
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });

    // Mostrar resumo de cada run
    for (const run of runs) {
      console.log("─".repeat(80));
      console.log(`\n📍 Run: ${run.name}`);
      console.log(`   ID: ${run.id}`);
      console.log(`   Type: ${run.run_type}`);
      console.log(`   Status: ${run.status}`);
      console.log(`   Parent ID: ${run.parent_run_id || "ROOT"}`);
      console.log(`   Start: ${run.start_time}`);
      console.log(`   End: ${run.end_time}`);

      if (run.latency) {
        console.log(`   Latency: ${run.latency.toFixed(2)}s`);
      }

      if (run.total_tokens) {
        console.log(`   Tokens: ${run.total_tokens} (prompt: ${run.prompt_tokens}, completion: ${run.completion_tokens})`);
      }

      if (run.error) {
        console.log(`   ❌ Error: ${run.error}`);
      }

      // Inputs (resumido)
      if (run.inputs) {
        console.log(`\n   📥 Inputs:`);
        const inputStr = JSON.stringify(run.inputs, null, 2);
        const truncatedInput = inputStr.length > 500 ? inputStr.substring(0, 500) + "..." : inputStr;
        console.log(`   ${truncatedInput.replace(/\n/g, "\n   ")}`);
      }

      // Outputs (resumido)
      if (run.outputs) {
        console.log(`\n   📤 Outputs:`);
        const outputStr = JSON.stringify(run.outputs, null, 2);
        const truncatedOutput = outputStr.length > 500 ? outputStr.substring(0, 500) + "..." : outputStr;
        console.log(`   ${truncatedOutput.replace(/\n/g, "\n   ")}`);
      }

      console.log();
    }

    // Mostrar árvore de hierarquia
    console.log("\n" + "=".repeat(80));
    console.log("📊 HIERARQUIA DO TRACE:");
    console.log("=".repeat(80));

    const runMap = new Map(runs.map(r => [r.id, r]));
    const rootRuns = runs.filter(r => !r.parent_run_id);

    function printTree(run: any, indent = 0) {
      const prefix = "  ".repeat(indent) + (indent > 0 ? "├── " : "");
      const statusIcon = run.error ? "❌" : "✅";
      console.log(`${prefix}${statusIcon} ${run.name} (${run.run_type}) - ${run.latency?.toFixed(2) || "?"}s`);

      const children = runs.filter(r => r.parent_run_id === run.id);
      children.forEach(child => printTree(child, indent + 1));
    }

    rootRuns.forEach(root => printTree(root));

    // Exportar JSON completo
    console.log("\n" + "=".repeat(80));
    console.log("💾 Exportando dados completos para trace-data.json...");

    const fs = await import("fs");
    fs.writeFileSync(
      "/root/chatbot-ui/chatbot-ui/scripts/trace-data.json",
      JSON.stringify(runs, null, 2)
    );
    console.log("✅ Dados exportados com sucesso!");

  } catch (error) {
    console.error("Erro ao buscar runs:", error);
  }
}

fetchTraceRuns();
