import * as fs from "node:fs";
import * as path from "node:path";
import type { DayReport } from "../types.js";
import type { MaterialOptions } from "../llm-material/index.js";
import type { CheckResult } from "./scorer.js";

/** A single experiment run record. */
export interface ExperimentRun {
  id: string;
  date: string;
  /** Experiment series identifier — runs sharing the same seriesId belong to the same experiment batch. */
  seriesId: string;
  config: MaterialOptions;
  /** The prepared material text fed to the LLM. */
  material: string;
  /** The LLM's output (parsed into DayReport). */
  report: DayReport;
  check: CheckResult;
  timestamp: string;
}

/** Persist and retrieve experiment run records. */
export class ExperimentStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Append a run to the JSONL file. */
  save(run: ExperimentRun): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(this.filePath, JSON.stringify(run) + "\n", "utf-8");
  }

  /** Load all runs. */
  list(): ExperimentRun[] {
    if (!fs.existsSync(this.filePath)) return [];
    const content = fs.readFileSync(this.filePath, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map((line) => JSON.parse(line) as ExperimentRun);
  }

  /** Get runs for a specific date. */
  listByDate(date: string): ExperimentRun[] {
    return this.list().filter((r) => r.date === date);
  }

  /** Get a single run by ID. */
  get(id: string): ExperimentRun | null {
    return this.list().find((r) => r.id === id) ?? null;
  }

  /** Get all runs belonging to a specific experiment series. */
  listBySeries(seriesId: string): ExperimentRun[] {
    return this.list().filter((r) => r.seriesId === seriesId);
  }

  /** List all distinct series IDs. */
  listSeries(): string[] {
    return [...new Set(this.list().map((r) => r.seriesId))];
  }

  /** Write human review for a run. */
  annotate(id: string, opts: { assessment: string; diagnosis?: string; suggestedFix?: string }): void {
    const all = this.list();
    const run = all.find((r) => r.id === id);
    if (!run) return;
    run.check.assessment = opts.assessment;
    if (opts.diagnosis !== undefined) run.check.diagnosis = opts.diagnosis;
    if (opts.suggestedFix !== undefined) run.check.suggestedFix = opts.suggestedFix;
    fs.writeFileSync(this.filePath, all.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
  }
}
