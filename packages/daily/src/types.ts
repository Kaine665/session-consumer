import type { ProviderId } from "@sc/core";

export interface SessionDigest {
  /** 1-based index within the day, for cross-referencing with TaskItem.sessionRefs. */
  index: number;
  sessionId: string;
  provider: ProviderId;
  /** Cleaned user messages (complete, not truncated). */
  userMessages: string[];
  /** AI's thinking/reasoning blocks. */
  assistantThinking: string[];
  /** AI's text responses to the user. */
  assistantText: string[];
  /** AI's tool calls — name + key input summary. */
  assistantTools: string[];
  messageCount: number;
  firstMessageTime: string;
  /** Session duration in minutes, or null if unknown. */
  durationMinutes: number | null;
}

export interface DayDigest {
  date: string;
  sessions: SessionDigest[];
  totalMessages: number;
  providers: ProviderId[];
}

export interface TaskItem {
  description: string;
  sessionCount: number;
  messageCount: number;
  /** Indices of sessions this task aggregates (1-based, matching SessionDigest.index). */
  sessionRefs: number[];
}

export interface DayReport {
  date: string;
  summary: string;
  tasks: TaskItem[];
  sessions: SessionDigest[];
  totalMessages: number;
  sessionCount: number;
  providers: ProviderId[];
}

export interface DailyReport {
  dateRange: { first: string; last: string };
  days: DayReport[];
}

export interface DailyReportOptions {
  projectName?: string;
  providers?: ProviderId[];
  since?: string;
  until?: string;
  /** Skip sub-agent sessions (default: true). Only meaningful for providers that detect sub-agents (Claude Code). */
  skipSubAgents?: boolean;
}
