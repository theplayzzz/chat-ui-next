import * as fs from "fs";

const data = JSON.parse(fs.readFileSync("/root/chatbot-ui/chatbot-ui/scripts/trace-data.json", "utf-8"));

console.log("=" .repeat(100));
console.log("📊 ANÁLISE COMPLETA DO TRACE: 019ae160-3d81-7000-8000-0653eb0edc78");
console.log("=".repeat(100));

console.log("\n## RESUMO GERAL\n");
console.log(`- Total de runs: ${data.length}`);

const totalTokens = data.reduce((acc: number, run: any) => acc + (run.total_tokens || 0), 0);
const totalPromptTokens = data.reduce((acc: number, run: any) => acc + (run.prompt_tokens || 0), 0);
const totalCompletionTokens = data.reduce((acc: number, run: any) => acc + (run.completion_tokens || 0), 0);

console.log(`- Total de tokens: ${totalTokens.toLocaleString()}`);
console.log(`  - Prompt tokens: ${totalPromptTokens.toLocaleString()}`);
console.log(`  - Completion tokens: ${totalCompletionTokens.toLocaleString()}`);

const rootRun = data.find((r: any) => !r.parent_run_id);
if (rootRun) {
  const startTime = new Date(rootRun.start_time);
  const endTime = new Date(rootRun.end_time);
  const duration = (endTime.getTime() - startTime.getTime()) / 1000;
  console.log(`- Duração total: ${duration.toFixed(2)}s`);
  console.log(`- Status: ${rootRun.status}`);
}

console.log("\n## DETALHES POR RUN\n");

// Ordenar por start_time
data.sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

for (const run of data) {
  console.log("-".repeat(100));
  console.log(`\n### ${run.name} (${run.run_type})`);
  console.log(`- ID: ${run.id}`);
  console.log(`- Parent: ${run.parent_run_id || "ROOT"}`);
  console.log(`- Status: ${run.status}`);
  console.log(`- Start: ${run.start_time}`);
  console.log(`- End: ${run.end_time}`);

  if (run.total_tokens) {
    console.log(`- Tokens: ${run.total_tokens} (prompt: ${run.prompt_tokens}, completion: ${run.completion_tokens})`);
  }

  if (run.error) {
    console.log(`- ❌ ERROR: ${JSON.stringify(run.error)}`);
  }

  // Para LLM runs, mostrar detalhes específicos
  if (run.run_type === "llm") {
    const inputs = run.inputs || {};
    const outputs = run.outputs || {};

    console.log("\n#### Model Info:");
    console.log(`- Model: ${inputs.model || outputs.model || "N/A"}`);

    if (outputs.choices?.[0]?.finish_reason) {
      console.log(`- Finish Reason: ${outputs.choices[0].finish_reason}`);
      if (outputs.choices[0].finish_reason === "length") {
        console.log("  ⚠️ AVISO: Resposta foi cortada por limite de tokens!");
      }
    }

    // Mostrar resumo das mensagens
    if (inputs.messages) {
      console.log(`\n#### Messages (${inputs.messages.length} total):`);
      for (let i = 0; i < inputs.messages.length; i++) {
        const msg = inputs.messages[i];
        const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        console.log(`  [${i}] ${msg.role}: ${content.substring(0, 200)}${content.length > 200 ? "..." : ""}`);
      }
    }

    // Mostrar resposta
    if (outputs.choices?.[0]?.message?.content) {
      const content = outputs.choices[0].message.content;
      console.log(`\n#### Response Preview:`);
      console.log(`  ${content.substring(0, 500)}${content.length > 500 ? "..." : ""}`);
    }
  }

  // Para chain/retriever, mostrar inputs/outputs resumidos
  if (run.run_type === "chain" || run.run_type === "retriever") {
    console.log("\n#### Inputs Preview:");
    const inputStr = JSON.stringify(run.inputs, null, 2);
    console.log(`  ${inputStr.substring(0, 300).replace(/\n/g, "\n  ")}${inputStr.length > 300 ? "..." : ""}`);

    console.log("\n#### Outputs Preview:");
    const outputStr = JSON.stringify(run.outputs, null, 2);
    console.log(`  ${outputStr.substring(0, 500).replace(/\n/g, "\n  ")}${outputStr.length > 500 ? "..." : ""}`);
  }
}

console.log("\n\n" + "=".repeat(100));
console.log("## 🔍 PROBLEMAS IDENTIFICADOS");
console.log("=".repeat(100));

// Verificar finish_reason = length
const truncatedResponses = data.filter((r: any) =>
  r.outputs?.choices?.[0]?.finish_reason === "length"
);
if (truncatedResponses.length > 0) {
  console.log(`\n### ⚠️ ${truncatedResponses.length} respostas truncadas por limite de tokens:`);
  for (const run of truncatedResponses) {
    console.log(`- ${run.name} (ID: ${run.id})`);
    console.log(`  Tokens: ${run.total_tokens} (completion: ${run.completion_tokens})`);
  }
}

// Verificar generateRecommendation error
const genRecRun = data.find((r: any) => r.name === "generateRecommendation");
if (genRecRun?.outputs?.error) {
  console.log(`\n### ❌ Erro em generateRecommendation:`);
  console.log(`  ${genRecRun.outputs.error}`);
}

// Verificar se há erros em algum run
const errorRuns = data.filter((r: any) => r.error);
if (errorRuns.length > 0) {
  console.log(`\n### ❌ ${errorRuns.length} runs com erros:`);
  for (const run of errorRuns) {
    console.log(`- ${run.name}: ${JSON.stringify(run.error)}`);
  }
}

console.log("\n");
