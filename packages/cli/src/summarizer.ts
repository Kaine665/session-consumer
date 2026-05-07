import type { Summarizer, DayDigest, DayReport, TaskItem } from "@sc/daily";
import { prepareMaterial, DEFAULT_SUMMARIZE_PROMPT } from "@sc/daily";

/** Extract JSON object from LLM output — handles markdown code fences and surrounding text. */
function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : text;
}

/** Ensure every session index is covered by at least one task. Add fallback tasks for uncovered sessions. */
function ensureCoverage(tasks: TaskItem[], allIndices: number[], day: DayDigest): TaskItem[] {
  const covered = new Set(tasks.flatMap((t) => t.sessionRefs));
  for (const idx of allIndices) {
    if (!covered.has(idx)) {
      const s = day.sessions.find((s) => s.index === idx);
      tasks.push({
        description: s?.userMessages[0] || "(no text)",
        sessionCount: 1,
        messageCount: s?.messageCount || 0,
        sessionRefs: [idx],
      });
    }
  }
  return tasks;
}

/**
 * Anthropic-API-compatible LLM summarizer.
 * Uses ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from env (falls back to default).
 */
export class LLMSummarizer implements Summarizer {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = opts?.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.baseUrl = opts?.baseUrl || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
    this.model = opts?.model || process.env.SC_SUMMARIZE_MODEL || "deepseek-chat";
  }

  async summarizeDay(day: DayDigest): Promise<DayReport> {
    if (!this.apiKey) {
      return this.fallback(day, "ANTHROPIC_API_KEY not set");
    }

    const userContent = prepareMaterial(day);

    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "x-api-key": this.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          system: DEFAULT_SUMMARIZE_PROMPT,
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return this.fallback(day, `API ${res.status}: ${errText.slice(0, 100)}`);
      }

      const data = (await res.json()) as any;
      const text = data.content?.[0]?.text || "";
      const json = extractJson(text);
      const parsed = JSON.parse(json) as { summary: string; tasks: Array<{ description: string; sessionCount: number; messageCount: number; sessionRefs: number[] }> };

      const allIndices = day.sessions.map((s) => s.index);
      const tasks = ensureCoverage(parsed.tasks || [], allIndices, day);

      return {
        date: day.date,
        summary: parsed.summary || "",
        tasks,
        sessions: day.sessions,
        totalMessages: day.totalMessages,
        sessionCount: day.sessions.length,
        providers: day.providers,
      };
    } catch (err) {
      return this.fallback(day, String(err).slice(0, 100));
    }
  }

  private fallback(day: DayDigest, reason: string): DayReport {
    const tasks = day.sessions.map((s) => ({
      description: s.userMessages[0] || "(no text)",
      sessionCount: 1,
      messageCount: s.messageCount,
      sessionRefs: [s.index],
    }));
    return {
      date: day.date,
      summary: `[fallback: ${reason}] ${day.sessions.length} sessions, ${day.totalMessages} msgs`,
      tasks,
      sessions: day.sessions,
      totalMessages: day.totalMessages,
      sessionCount: day.sessions.length,
      providers: day.providers,
    };
  }
}
