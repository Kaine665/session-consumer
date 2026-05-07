import type { ExperimentRun } from "./store.js";
import { formatCheck, type CheckResult } from "./scorer.js";

/** A side-by-side entry for comparison. */
export interface ComparisonEntry {
  id: string;
  configLabel: string;
  summary: string;
  tasks: string[];
  check: CheckResult;
}

/** Side-by-side comparison of multiple experiment runs. */
export interface Comparison {
  date: string;
  entries: ComparisonEntry[];
}

function labelConfig(run: ExperimentRun): string {
  const c = run.config.compression;
  const strategy = c?.strategy ?? "head";

  let desc: string;
  if (strategy === "headTail") {
    const h = c?.headCount ?? 3;
    const t = c?.tailCount ?? 2;
    desc = `headTail(${h},${t})`;
  } else if (strategy === "sample") {
    const every = c?.sampleEvery ?? 3;
    desc = `sample(${every})`;
  } else {
    const n = c?.headCount ?? 5;
    desc = `head(${n})`;
  }
  return desc;
}

/** Build a comparison from runs for the same date. */
export function compareRuns(runs: ExperimentRun[]): Comparison | null {
  if (runs.length === 0) return null;

  return {
    date: runs[0].date,
    entries: runs.map((r) => ({
      id: r.id,
      configLabel: labelConfig(r),
      summary: r.report.summary,
      tasks: r.report.tasks.map((t) => t.description),
      check: r.check,
    })),
  };
}

/** Render a comparison as readable text. */
export function formatComparison(c: Comparison): string {
  const lines = [`Date: ${c.date}`, `Runs: ${c.entries.length}`, ""];

  for (let i = 0; i < c.entries.length; i++) {
    const e = c.entries[i];
    lines.push(`── Config ${i + 1}: ${e.configLabel}`);
    lines.push(`   Summary: ${e.summary}`);
    lines.push(`   Tasks (${e.tasks.length}):`);
    for (const t of e.tasks) {
      lines.push(`     - ${t}`);
    }
    lines.push(`   ${formatCheck(e.check)}`);
    lines.push("");
  }

  const reviewed = c.entries.filter((e) => e.check.assessment);
  if (reviewed.length === 0) {
    lines.push("No reviews yet. Use store.annotate('<runId>', 'your assessment') to add notes.");
  } else {
    lines.push(`Reviewed: ${reviewed.length}/${c.entries.length}`);
  }

  return lines.join("\n");
}

// ─── Cross-series comparison ──────────────────────────────────────────────────

/** Track one config across multiple experiment series. */
export interface SeriesMatrixEntry {
  configLabel: string;
  /** Results for this config in each series (same order as seriesLabels). */
  results: {
    seriesLabel: string;
    summary: string;
    taskCount: number;
    hasReview: boolean;
    diagnosis: string;
  }[];
}

/** Cross-series comparison. */
export interface SeriesComparison {
  seriesLabels: string[];
  entries: SeriesMatrixEntry[];
}

/** Build a cross-series comparison.
 *  seriesMap: { "系列1": runs, "系列2": runs, ... } */
export function compareSeries(seriesMap: Record<string, ExperimentRun[]>): SeriesComparison | null {
  const labels = Object.keys(seriesMap);
  if (labels.length === 0) return null;

  // Collect unique config labels across all series
  const configSet = new Map<string, SeriesMatrixEntry>();
  for (const [seriesLabel, runs] of Object.entries(seriesMap)) {
    for (const r of runs) {
      const cl = labelConfig(r);
      if (!configSet.has(cl)) {
        configSet.set(cl, { configLabel: cl, results: [] });
      }
    }
  }

  // Fill results
  for (const [cl, entry] of configSet) {
    for (const [seriesLabel, runs] of Object.entries(seriesMap)) {
      const run = runs.find((r) => labelConfig(r) === cl);
      entry.results.push({
        seriesLabel,
        summary: run?.report.summary ?? "(not run)",
        taskCount: run?.report.tasks.length ?? 0,
        hasReview: !!run?.check.assessment,
        diagnosis: run?.check.diagnosis ?? "",
      });
    }
  }

  return { seriesLabels: labels, entries: [...configSet.values()] };
}

/** Render cross-series comparison. */
export function formatSeriesComparison(c: SeriesComparison): string {
  const lines = [`Cross-Series Comparison (${c.seriesLabels.length} series)`, ""];

  // Build a simple table
  const colW = Math.max(30, ...c.entries.map((e) => e.configLabel.length)) + 2;
  const header = "".padEnd(colW) + c.seriesLabels.map((s) => s.padEnd(50)).join("");
  lines.push(header);
  lines.push("─".repeat(colW + c.seriesLabels.length * 50));

  for (const entry of c.entries) {
    lines.push(entry.configLabel.padEnd(colW) +
      entry.results.map((r) => {
        const status = r.hasReview ? "✓" : "○";
        const diag = r.diagnosis ? ` [${r.diagnosis}]` : "";
        return `${status} ${r.taskCount}tasks${diag}`.padEnd(50);
      }).join(""));
  }

  lines.push("");
  lines.push("✓ = reviewed  ○ = not reviewed");
  return lines.join("\n");
}
