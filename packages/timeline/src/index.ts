import {
  SessionGateway,
  type Project,
  type Session,
  type ProviderId,
} from "@sc/core";
import {
  buildTimeline,
  filterTimeline,
  groupTimeline,
  timelineStats,
  type GroupBy,
  type TimelineEntry,
  type TimelineGroup,
  type TimelineStats,
} from "./timeline.js";
import { diagnoseJoin, type JoinDiagnostic } from "./diagnostics.js";

// Re-export pure functions and types for advanced use
export {
  buildTimeline,
  filterTimeline,
  groupTimeline,
  timelineStats,
} from "./timeline.js";
export type {
  TimelineEntry,
  TimelineGroup,
  TimelineStats,
  GroupBy,
  FilterOptions,
} from "./timeline.js";
export { diagnoseJoin } from "./diagnostics.js";
export type { JoinDiagnostic, LossDetail } from "./diagnostics.js";

// ─── Service types ─────────────────────────────────────────────────────────

export interface TimelineOptions {
  projectName?: string;
  providers?: ProviderId[];
  since?: string;
  until?: string;
  groupBy?: GroupBy;
}

export interface TimelineResult {
  projects: Project[];
  sessions: Session[];
  entries: TimelineEntry[];
  groups: TimelineGroup[];
  stats: TimelineStats;
  diagnostic: JoinDiagnostic;
}

// ─── Service ───────────────────────────────────────────────────────────────

export class TimelineService {
  constructor(private gw: SessionGateway) {}

  async execute(opts: TimelineOptions = {}): Promise<TimelineResult> {
    const groupBy = opts.groupBy || "day";

    const { projects, sessions, messages } = await this.gw.loadProjectData({
      projectName: opts.projectName,
    });

    // Process
    let entries = buildTimeline(messages, sessions, projects);
    entries = filterTimeline(entries, {
      since: opts.since,
      until: opts.until,
      providers: opts.providers,
    });

    const groups = groupTimeline(entries, groupBy);
    const stats = timelineStats(entries);
    const diagnostic = diagnoseJoin(messages, sessions, projects);

    return { projects, sessions, entries, groups, stats, diagnostic };
  }
}
