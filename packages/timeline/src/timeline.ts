import type { Message, Session, Project, ProviderId } from "@sc/core";

// ─── Timeline types ─────────────────────────────────────────────────────────

/** A message placed in context — which session and project it belongs to. */
export interface TimelineEntry {
  readonly message: Message;
  readonly session: Session;
  readonly project: Project;
}

export interface FilterOptions {
  since?: string;
  until?: string;
  providers?: ProviderId[];
  projectPaths?: string[];
}

export type GroupBy = "day" | "session" | "project";

export interface TimelineGroup {
  label: string;
  entries: TimelineEntry[];
}

export interface TimelineStats {
  totalEntries: number;
  providerCount: number;
  projectCount: number;
  dayCount: number;
  userMessages: number;
  assistantMessages: number;
  toolUses: number;
  dateRange: {
    first: string | null;
    last: string | null;
  };
}

// ─── Build ──────────────────────────────────────────────────────────────────

export function buildTimeline(
  messages: Message[],
  sessions: Session[],
  projects: Project[],
): TimelineEntry[] {
  const sessionMap = new Map<string, Session>();
  for (const s of sessions) sessionMap.set(s.id, s);

  const projectMap = new Map<string, Project>();
  for (const p of projects) projectMap.set(p.path, p);

  const entries: TimelineEntry[] = [];
  for (const msg of messages) {
    const session = sessionMap.get(msg.sessionId);
    if (!session) continue;
    const project = projectMap.get(session.projectPath);
    if (!project) continue;
    entries.push({ message: msg, session, project });
  }

  entries.sort((a, b) =>
    (a.message.timestamp || "").localeCompare(b.message.timestamp || ""),
  );
  return entries;
}

// ─── Filter ─────────────────────────────────────────────────────────────────

export function filterTimeline(
  entries: TimelineEntry[],
  options: FilterOptions,
): TimelineEntry[] {
  return entries.filter((e) => {
    const ts = e.message.timestamp;
    if (options.since && ts < options.since) return false;
    if (options.until && ts > options.until) return false;
    if (options.providers && !options.providers.includes(e.session.provider))
      return false;
    if (
      options.projectPaths &&
      !options.projectPaths.includes(e.project.path)
    )
      return false;
    return true;
  });
}

// ─── Group ──────────────────────────────────────────────────────────────────

export function groupTimeline(
  entries: TimelineEntry[],
  by: GroupBy,
): TimelineGroup[] {
  const groups = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    const key = groupKey(entry, by);
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  }

  const result: TimelineGroup[] = [];
  for (const [label, groupEntries] of groups) {
    result.push({ label, entries: groupEntries });
  }
  result.sort((a, b) => a.label.localeCompare(b.label));
  return result;
}

function groupKey(entry: TimelineEntry, by: GroupBy): string {
  switch (by) {
    case "day":
      return (entry.message.timestamp || "").slice(0, 10) || "unknown";
    case "session":
      return entry.session.id;
    case "project":
      return entry.project.path;
  }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export function timelineStats(entries: TimelineEntry[]): TimelineStats {
  const providers = new Set<ProviderId>();
  const projects = new Set<string>();
  const days = new Set<string>();
  let toolUseCount = 0;
  let assistantCount = 0;
  let userCount = 0;

  for (const { message, session } of entries) {
    providers.add(session.provider);
    projects.add(session.projectPath);
    days.add((message.timestamp || "").slice(0, 10));
    if (message.type === "assistant") assistantCount++;
    if (message.type === "user") userCount++;
    if (message.toolUses && message.toolUses.length > 0) {
      toolUseCount += message.toolUses.length;
    }
  }

  return {
    totalEntries: entries.length,
    providerCount: providers.size,
    projectCount: projects.size,
    dayCount: days.size,
    userMessages: userCount,
    assistantMessages: assistantCount,
    toolUses: toolUseCount,
    dateRange: {
      first: entries[0]?.message.timestamp || null,
      last: entries[entries.length - 1]?.message.timestamp || null,
    },
  };
}
