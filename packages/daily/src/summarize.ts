import type { DayDigest, DayReport } from "./types.js";

/** Summarizer converts raw day digests into readable daily reports. */
export interface Summarizer {
  summarizeDay(day: DayDigest): Promise<DayReport>;
}

/** A no-LLM fallback: returns the first user message of each session as a task item. */
export class NoopSummarizer implements Summarizer {
  async summarizeDay(day: DayDigest): Promise<DayReport> {
    const tasks = day.sessions.map((s) => ({
      description: s.userMessages[0] || "(no text)",
      sessionCount: 1,
      messageCount: s.messageCount,
      sessionRefs: [s.index],
    }));

    return {
      date: day.date,
      summary: `${day.sessions.length} sessions, ${day.totalMessages} messages across ${day.providers.join(", ")}`,
      tasks,
      sessions: day.sessions,
      totalMessages: day.totalMessages,
      sessionCount: day.sessions.length,
      providers: day.providers,
    };
  }
}
