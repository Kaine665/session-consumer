import type { DayDigest, SessionDigest } from "../types.js";

/** Information types that can be extracted from a session. */
export type InfoType = "userMessages" | "sessionMeta" | "assistantThinking" | "assistantText" | "assistantTools";

/** Configuration: which information fields to include. Selector only chooses WHAT, not HOW MANY. */
export interface SelectionConfig {
  infoTypes: InfoType[];
}

/** A single session's selected data. */
export interface SelectedSession {
  index: number;
  provider: string;
  userMessages: string[];
  assistantThinking: string[];
  assistantText: string[];
  assistantTools: string[];
  messageCount: number;
  firstMessageTime: string;
  durationMinutes: number | null;
}

/** A full day's selected data. */
export interface SelectedDay {
  date: string;
  sessions: SelectedSession[];
  totalMessages: number;
  providers: string[];
}

const DEFAULT_CONFIG = {
  infoTypes: ["userMessages", "sessionMeta", "assistantThinking", "assistantText", "assistantTools"] as InfoType[],
};

function selectSession(s: SessionDigest, config: typeof DEFAULT_CONFIG): SelectedSession {
  const result: SelectedSession = {
    index: s.index,
    provider: "",
    userMessages: [],
    assistantThinking: [],
    assistantText: [],
    assistantTools: [],
    messageCount: 0,
    firstMessageTime: "",
    durationMinutes: null,
  };

  if (config.infoTypes.includes("userMessages")) {
    result.userMessages = s.userMessages;
  }

  if (config.infoTypes.includes("sessionMeta")) {
    result.provider = s.provider;
    result.messageCount = s.messageCount;
    result.firstMessageTime = s.firstMessageTime;
    result.durationMinutes = s.durationMinutes;
  }

  if (config.infoTypes.includes("assistantThinking")) {
    result.assistantThinking = s.assistantThinking;
  }

  if (config.infoTypes.includes("assistantText")) {
    result.assistantText = s.assistantText;
  }

  if (config.infoTypes.includes("assistantTools")) {
    result.assistantTools = s.assistantTools;
  }

  return result;
}

/** Extract selected information from a day's sessions. No truncation — Compressor handles volume. */
export function selectFromDay(day: DayDigest, config?: SelectionConfig): SelectedDay {
  const cfg = { ...DEFAULT_CONFIG, ...config, infoTypes: config?.infoTypes ?? DEFAULT_CONFIG.infoTypes };

  return {
    date: day.date,
    totalMessages: day.totalMessages,
    providers: day.providers,
    sessions: day.sessions.map((s) => selectSession(s, cfg)),
  };
}
