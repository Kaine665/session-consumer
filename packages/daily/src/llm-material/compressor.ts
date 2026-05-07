import type { SelectedDay, SelectedSession } from "./selector.js";

/** Compression (truncation) strategies for reducing message volume. */
export type CompressionStrategy = "head" | "headTail" | "sample";

export interface CompressionConfig {
  strategy: CompressionStrategy;
  /** For "head": keep first N. Default 5. */
  headCount?: number;
  /** For "headTail": keep last N. Default 2. */
  tailCount?: number;
  /** For "sample": keep every Nth message. Default 3. */
  sampleEvery?: number;
}

export interface CompressedSession extends SelectedSession {
  /** userMessages after compression. */
  userMessages: string[];
  /** assistantThinking after compression. */
  assistantThinking: string[];
  /** assistantText after compression. */
  assistantText: string[];
  /** assistantTools after compression. */
  assistantTools: string[];
}

export interface CompressedDay {
  date: string;
  sessions: CompressedSession[];
  totalMessages: number;
  providers: string[];
}

const DEFAULTS = { headCount: 5, tailCount: 2, sampleEvery: 3 };

function compressMessages(msgs: string[], config: CompressionConfig): string[] {
  const s = config.strategy;
  if (s === "head") {
    return msgs.slice(0, config.headCount ?? DEFAULTS.headCount);
  }
  if (s === "headTail") {
    const head = config.headCount ?? DEFAULTS.headCount;
    const tail = config.tailCount ?? DEFAULTS.tailCount;
    if (msgs.length <= head + tail) return msgs;
    const headPart = msgs.slice(0, head);
    const tailPart = msgs.slice(-tail);
    const overlap = head + tail - msgs.length;
    if (overlap > 0) return msgs;
    return [...headPart, `…${msgs.length - head - tail} entries skipped…`, ...tailPart];
  }
  // sample
  const every = config.sampleEvery ?? DEFAULTS.sampleEvery;
  return msgs.filter((_, i) => i % every === 0);
}

function compressSession(s: SelectedSession, config: CompressionConfig): CompressedSession {
  return {
    ...s,
    userMessages: compressMessages(s.userMessages, config),
    assistantThinking: compressMessages(s.assistantThinking, config),
    assistantText: compressMessages(s.assistantText, config),
    assistantTools: compressMessages(s.assistantTools, config),
  };
}

/** Apply compression to selected day data. Applies same strategy to all four layers. */
export function compressDay(day: SelectedDay, config?: CompressionConfig): CompressedDay {
  const cfg: CompressionConfig = config ?? { strategy: "head", headCount: 5 };

  return {
    ...day,
    sessions: day.sessions.map((s) => compressSession(s, cfg)),
  };
}
