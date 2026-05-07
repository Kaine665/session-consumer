import { SessionGateway } from "@sc/core";
import { groupByDay, runExperiment, ExperimentStore, compareRuns, formatComparison } from "@sc/daily";
import type { MaterialOptions, LLMRunner } from "@sc/daily";

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const MODEL = process.env.SC_SUMMARIZE_MODEL || "deepseek-chat";

const runLLM: LLMRunner = async (systemPrompt, userContent) => {
  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  return data.content?.[0]?.text || "";
};

async function main() {
  const gw = new SessionGateway();

  console.log("Loading project data...");
  const { sessions, messages } = await gw.loadProjectData({ projectName: "project-pilot" });
  console.log(`Loaded ${sessions.length} sessions, ${messages.length} messages`);

  const digests = groupByDay(sessions, messages);
  console.log(`${digests.length} days found\n`);

  const target = digests.find((d) => d.date === "2026-04-03");
  if (!target) {
    console.log("Target day 2026-04-03 not found.");
    console.log("Available days:", digests.map(d => d.date).join(", "));
    return;
  }
  console.log(`Target day: ${target.date} (${target.sessions.length} sessions, ${target.totalMessages} msgs)\n`);

  const configs: MaterialOptions[] = [
    { compression: { strategy: "head", headCount: 5 } },
    { compression: { strategy: "head", headCount: 10 } },
  ];

  const store = new ExperimentStore("./data/experiment-runs.jsonl");

  const seriesId = `2026-04-03-head5-vs-head10`;

  console.log(`Running experiment series "${seriesId}" with 3 configs...\n`);
  const runs = await runExperiment(target, configs, runLLM, store, seriesId, 3);

  // Show raw results
  for (const run of runs) {
    console.log(`─── ${run.id.slice(0, 8)} ───`);
    const s = run.config.compression;
    let label = "default";
    if (s) {
      if (s.strategy === "head") label = `前${s.headCount ?? 5}条`;
      else if (s.strategy === "headTail") label = `前${s.headCount ?? 3}条+后${s.tailCount ?? 2}条`;
      else if (s.strategy === "sample") label = `每${s.sampleEvery ?? 3}条取1条`;
    }
    console.log(`Config: ${label}`);
    console.log(`Material: ${run.material.length} chars`);
    console.log(`Summary: ${run.report.summary}`);
    console.log(`Tasks (${run.report.tasks.length}):`);
    for (const t of run.report.tasks) {
      console.log(`  - ${t.description} [sessions: ${t.sessionRefs.join(", ")}]`);
    }
    console.log(`Coverage: ${Math.round(run.check.coverage * 100)}%\n`);
  }

  // Comparison
  console.log("═══ Comparison ═══\n");
  const cmp = compareRuns(runs);
  if (cmp) {
    console.log(formatComparison(cmp));
  }

  console.log("\nTo annotate a run:");
  console.log("  store.annotate('<id>', {");
  console.log("    assessment: '你的评估',");
  console.log("    diagnosis: '问题分类',");
  console.log("    suggestedFix: '修复方向'");
  console.log("  });");
  console.log("\nTo compare across series:");
  console.log("  const s1 = store.listBySeries('test-2026-05-01');");
  console.log("  const s2 = store.listBySeries('test-2026-05-02');");
  console.log("  console.log(formatSeriesComparison(compareSeries({ '系列1': s1, '系列2': s2 })));");
}

main().catch((err) => {
  console.error("Experiment failed:", err);
  process.exit(1);
});
