import { randomUUID } from "node:crypto";
import type { DayDigest, DayReport } from "../types.js";
import { prepareMaterial, DEFAULT_SUMMARIZE_PROMPT, type MaterialOptions } from "../llm-material/index.js";
import { checkReport } from "./scorer.js";
import { ExperimentStore, type ExperimentRun } from "./store.js";

export { ExperimentStore, type ExperimentRun } from "./store.js";
export { checkReport, formatCheck, type CheckResult } from "./scorer.js";
export { compareRuns, formatComparison, compareSeries, formatSeriesComparison, type Comparison, type ComparisonEntry, type SeriesComparison, type SeriesMatrixEntry } from "./compare.js";

/** Function signature for calling an LLM: takes system prompt + user content, returns raw text. */
export type LLMRunner = (systemPrompt: string, userContent: string) => Promise<string>;

/** Run one material config against the LLM and build a run record.
 *  If maxRetries > 0, uses a ReAct loop: checks coverage after each attempt
 *  and tells the LLM which sessions are missing, up to maxRetries times. */
async function runSingle(
  day: DayDigest,
  seriesId: string,
  config: MaterialOptions,
  runLLM: LLMRunner,
  maxRetries = 0,
): Promise<ExperimentRun> {
  const material = prepareMaterial(day, config);
  let rawOutput = await runLLM(DEFAULT_SUMMARIZE_PROMPT, material);
  let parsed = extractReport(rawOutput, day);

  // ReAct loop: coverage < 100% → tell LLM what's missing → retry
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const allIndices = day.sessions.map((s) => s.index);
    const covered = new Set(parsed.tasks.flatMap((t: any) => t.sessionRefs || []));
    const missing = allIndices.filter((i) => !covered.has(i));
    if (missing.length === 0) break;

    const missingInfo = missing.map((i) => {
      const s = day.sessions.find((ss) => ss.index === i);
      const preview = s?.userMessages.slice(0, 2).join(" | ") || "(no data)";
      return `  #${i}: ${preview}`;
    }).join("\n");

    const fixPrompt = `Your previous report missed ${missing.length} session(s). Every session MUST be in exactly one task. Please fix:

Missing sessions:
${missingInfo}

Return the complete corrected JSON (not just the missing sessions). Do NOT drop any sessions that were already covered.`;
    rawOutput = await runLLM(DEFAULT_SUMMARIZE_PROMPT, material + "\n\n" + fixPrompt);
    parsed = extractReport(rawOutput, day);
  }
  const report: DayReport = {
    date: day.date,
    summary: parsed.summary,
    tasks: parsed.tasks.map((t) => ({
      description: t.description,
      sessionCount: t.sessionCount,
      messageCount: t.messageCount,
      sessionRefs: t.sessionRefs,
    })),
    sessions: day.sessions,
    totalMessages: day.totalMessages,
    sessionCount: day.sessions.length,
    providers: day.providers,
  };

  return {
    id: randomUUID(),
    date: day.date,
    seriesId,
    config,
    material,
    report,
    check: checkReport(report, material.length),
    timestamp: new Date().toISOString(),
  };
}

/** Parse LLM output into report shape, with the same tolerance as LLMSummarizer. */
function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : text;
}

function extractReport(
  raw: string,
  day: DayDigest,
): { summary: string; tasks: Array<{ description: string; sessionCount: number; messageCount: number; sessionRefs: number[] }> } {
  try {
    const json = extractJson(raw);
    const parsed = JSON.parse(json);
    return {
      summary: parsed.summary || "",
      tasks: parsed.tasks || [],
    };
  } catch {
    return {
      summary: `(parse error)`,
      tasks: day.sessions.map((s) => ({
        description: s.userMessages[0] || "(no text)",
        sessionCount: 1,
        messageCount: s.messageCount,
        sessionRefs: [s.index],
      })),
    };
  }
}

/**
 * Run an experiment: for each config, prepare material, call LLM, and record the result.
 * Runs are persisted to the store. Use store.annotate() to add human review.
 *
 * @param seriesId — label for this experiment batch. Same data + different configs = one series.
 *   After diagnosing issues and making changes, run a new series with a new seriesId.
 */
export async function runExperiment(
  day: DayDigest,
  configs: MaterialOptions[],
  runLLM: LLMRunner,
  store: ExperimentStore,
  seriesId?: string,
  maxRetries?: number,
): Promise<ExperimentRun[]> {
  const sid = seriesId ?? `series-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 6)}`;
  const runs: ExperimentRun[] = [];
  for (const config of configs) {
    const run = await runSingle(day, sid, config, runLLM, maxRetries);
    store.save(run);
    runs.push(run);
  }
  return runs;
}
