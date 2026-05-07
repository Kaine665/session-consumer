import { SessionGateway } from "@sc/core";
import { groupByDay } from "@sc/daily";
import * as store from "../report-store.js";
import type { SavedReport } from "../report-store.js";

const gw = new SessionGateway();

// ─── Tool: list_projects ───────────────────────────────────────────────────

export async function listProjects(): Promise<{
  projects: Array<{ name: string; path: string; providers: string[] }>;
}> {
  const projects = await gw.listProjects();
  return {
    projects: projects.map((p) => ({
      name: p.name,
      path: p.path,
      providers: p.providers,
    })),
  };
}

// ─── Tool: get_days ────────────────────────────────────────────────────────

export async function getDays(args: {
  projectName: string;
  since?: string;
  until?: string;
}): Promise<{
  projectName: string;
  days: Array<{ date: string; sessionCount: number; messageCount: number; providers: string[] }>;
}> {
  const { sessions, messages } = await gw.loadProjectData({
    projectName: args.projectName,
  });

  const digests = groupByDay(sessions, messages, args.since, args.until);

  return {
    projectName: args.projectName,
    days: digests.map((d) => ({
      date: d.date,
      sessionCount: d.sessions.length,
      messageCount: d.totalMessages,
      providers: d.providers,
    })),
  };
}

// ─── Tool: get_day_sessions ────────────────────────────────────────────────

export async function getDaySessions(args: {
  projectName: string;
  date: string;
}): Promise<unknown> {
  const { sessions, messages } = await gw.loadProjectData({
    projectName: args.projectName,
  });

  const digests = groupByDay(
    sessions,
    messages,
    args.date,
    args.date, // since & until both set to the date = single day
  );

  const day = digests.find((d) => d.date === args.date);
  if (!day) {
    return { date: args.date, sessions: [], message: "No sessions found for this date." };
  }

  // Return sessions with their four-layer data
  return {
    date: day.date,
    totalMessages: day.totalMessages,
    providers: day.providers,
    sessionCount: day.sessions.length,
    sessions: day.sessions.map((s) => ({
      index: s.index,
      sessionId: s.sessionId,
      provider: s.provider,
      messageCount: s.messageCount,
      durationMinutes: s.durationMinutes,
      firstMessageTime: s.firstMessageTime,
      userMessages: s.userMessages,
      assistantThinking: s.assistantThinking,
      assistantText: s.assistantText,
      assistantTools: s.assistantTools,
    })),
  };
}

// ─── Tool: get_session_detail ──────────────────────────────────────────────

export async function getSessionDetail(args: {
  sessionId: string;
}): Promise<unknown> {
  const result = await gw.findSession(args.sessionId);
  if (!result) {
    return { error: `Session not found: ${args.sessionId}` };
  }

  const messages = await gw.loadMessages(result.session);

  return {
    session: {
      id: result.session.id,
      provider: result.session.provider,
      messageCount: result.session.messageCount,
      firstMessageTime: result.session.firstMessageTime,
      lastModified: result.session.lastModified,
    },
    project: {
      name: result.project.name,
      path: result.project.path,
    },
    messages: messages.map((m) => ({
      type: m.type,
      timestamp: m.timestamp,
      content: m.content,
    })),
  };
}

// ─── Tool: save_daily_report ───────────────────────────────────────────────

export async function saveDailyReport(args: {
  projectName: string;
  date: string;
  summary: string;
  tasks: Array<{
    description: string;
    sessionCount: number;
    messageCount: number;
    sessionRefs: number[];
  }>;
  fullText: string;
}): Promise<{ saved: boolean; path: string }> {
  const report: SavedReport = {
    date: args.date,
    projectName: args.projectName,
    summary: args.summary,
    tasks: args.tasks,
    fullText: args.fullText,
    savedAt: new Date().toISOString(),
  };

  store.saveReport(report);
  return { saved: true, path: `~/.sc/reports/${args.projectName}__${args.date}.json` };
}

// ─── Tool: get_recent_reports ──────────────────────────────────────────────

export async function getRecentReports(args?: {
  projectName?: string;
  limit?: number;
}): Promise<{ reports: Array<{ date: string; projectName: string; summary: string; savedAt: string }> }> {
  const all = store.listReports(args?.projectName);
  const limited = args?.limit ? all.slice(0, args.limit) : all;
  return {
    reports: limited.map((r) => ({
      date: r.date,
      projectName: r.projectName,
      summary: r.summary,
      savedAt: r.savedAt,
    })),
  };
}

/** Get a single saved report by date + project. */
export async function getReport(args: {
  projectName: string;
  date: string;
}): Promise<SavedReport | { error: string }> {
  const report = store.getReport(args.projectName, args.date);
  if (!report) {
    return { error: `No report found for ${args.projectName} on ${args.date}` };
  }
  return report;
}
