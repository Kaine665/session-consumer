import { SessionGateway } from "@sc/core";
import { groupByDay } from "./digest.js";
import type { Summarizer } from "./summarize.js";
import { NoopSummarizer } from "./summarize.js";
import type {
  DayDigest,
  DayReport,
  DailyReport,
  DailyReportOptions,
} from "./types.js";

// Re-export pure functions and types
export { groupByDay, cleanUserMessage } from "./digest.js";
export { prepareMaterial, DEFAULT_SUMMARIZE_PROMPT } from "./llm-material/index.js";
export type { MaterialOptions, SelectionConfig, CompressionConfig, CompressionStrategy, InfoType } from "./llm-material/index.js";

// material-lab (experiment module)
export { runExperiment, ExperimentStore, checkReport, formatCheck, compareRuns, formatComparison, compareSeries, formatSeriesComparison } from "./material-lab/index.js";
export type { LLMRunner, ExperimentRun, CheckResult, Comparison, ComparisonEntry, SeriesComparison, SeriesMatrixEntry } from "./material-lab/index.js";
export type { Summarizer } from "./summarize.js";
export { NoopSummarizer } from "./summarize.js";
export type {
  SessionDigest,
  DayDigest,
  TaskItem,
  DayReport,
  DailyReport,
  DailyReportOptions,
} from "./types.js";

// ─── Service ─────────────────────────────────────────────────────────────────

export class DailyReportService {
  constructor(
    private gw: SessionGateway,
    private summarizer: Summarizer = new NoopSummarizer(),
  ) {}

  async execute(opts: DailyReportOptions = {}): Promise<DailyReport> {
    const { sessions, messages } = await this.gw.loadProjectData({
      projectName: opts.projectName,
    });

    // Process
    const digests = groupByDay(sessions, messages, opts.since, opts.until, undefined, opts.skipSubAgents);

    // Summarize each day
    const reports: DayReport[] = [];
    for (const digest of digests) {
      reports.push(await this.summarizer.summarizeDay(digest));
    }

    const first = reports[0]?.date || "";
    const last = reports[reports.length - 1]?.date || "";

    return { dateRange: { first, last }, days: reports };
  }
}
