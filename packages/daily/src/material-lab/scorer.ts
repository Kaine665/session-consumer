import type { DayReport } from "../types.js";

/** Automated metrics + human review for a single experiment run. */
export interface CheckResult {
  /** Session coverage 0-1 (auto). */
  coverage: number;
  /** Material text length in characters. */
  materialLength: number;
  /** Number of tasks produced. */
  taskCount: number;
  /** Human assessment — free text. Empty = not yet reviewed. */
  assessment: string;
  /** Problem classification (e.g. "数据模型缺AI输出", "prompt引导不够"). */
  diagnosis: string;
  /** Suggested fix direction (e.g. "扩展SessionDigest", "强化覆盖指令"). */
  suggestedFix: string;
}

/** Compute automated metrics from a report. */
export function checkReport(report: DayReport, materialLength: number): CheckResult {
  const allIndices = report.sessions.map((s) => s.index);
  const covered = new Set(report.tasks.flatMap((t) => t.sessionRefs));
  const coverage =
    allIndices.length > 0
      ? allIndices.filter((i) => covered.has(i)).length / allIndices.length
      : 1;

  return {
    coverage,
    materialLength,
    taskCount: report.tasks.length,
    assessment: "",
    diagnosis: "",
    suggestedFix: "",
  };
}

/** Format a CheckResult into a compact line for comparison. */
export function formatCheck(c: CheckResult): string {
  const cov = Math.round(c.coverage * 100);
  const covMark = cov < 100 ? ` ⚠ coverage ${cov}%` : ` coverage ${cov}%`;
  const base = `${c.materialLength} chars | ${c.taskCount} tasks |${covMark}`;
  const parts: string[] = [base];
  if (c.assessment) parts.push(`    评估: ${c.assessment}`);
  if (c.diagnosis) parts.push(`    诊断: ${c.diagnosis}`);
  if (c.suggestedFix) parts.push(`    修复方向: ${c.suggestedFix}`);
  if (!c.assessment && !c.diagnosis) parts.push("    (not reviewed)");
  return parts.join("\n");
}
