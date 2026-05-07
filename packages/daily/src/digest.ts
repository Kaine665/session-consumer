import type { Message, Session, ProviderId } from "@sc/core";
import type { DayDigest, SessionDigest } from "./types.js";

/** Built-in noise patterns — messages matching these are excluded from reports. */
export const DEFAULT_NOISE_PATTERNS: RegExp[] = [
  /^> /,                                                          // prompt template fragments
  /^\[Image\]$/i,                                                 // image-only messages
  /^<cursor_commands>/,                                           // Cursor system commands
  /^<external_links>/,                                            // Cursor external links
  /^Native CLI binary/,                                           // CLI error messages
  /^DOM Path:/,                                                   // UI debug output
  /^This session is being continued from a previous conversation/, // context compaction
];

/** Extract tool call descriptions from assistant messages. */
function extractTools(msgs: Message[]): string[] {
  const seen = new Set<string>();
  const tools: string[] = [];

  for (const m of msgs) {
    if (m.type !== "assistant") continue;

    // Content blocks
    for (const block of m.content) {
      if (block.type === "tool_use") {
        let desc = "";
        if (block.name === "Write" || block.name === "Edit") {
          const fp = (block.input as any)?.file_path || "";
          if (fp) desc = `写了 ${fp.split("/").pop() || fp.split("\\").pop() || fp}`;
        } else if (block.name === "Bash") {
          const cmd = String((block.input as any)?.command || "").slice(0, 80).replace(/\n/g, " ");
          if (cmd) desc = `执行 ${cmd}`;
        } else {
          desc = `调用 ${block.name}`;
        }
        if (desc && !seen.has(desc)) {
          seen.add(desc);
          tools.push(desc);
        }
      }
    }

    // Top-level toolUses as fallback
    for (const tu of m.toolUses) {
      let desc = "";
      if (tu.name === "Write" || tu.name === "Edit") {
        const fp = (tu.input as any)?.file_path || "";
        if (fp) desc = `写了 ${fp.split("/").pop() || fp.split("\\").pop() || fp}`;
      } else if (tu.name === "Bash") {
        const cmd = String(tu.input?.command || "").slice(0, 80).replace(/\n/g, " ");
        if (cmd) desc = `执行 ${cmd}`;
      } else {
        desc = `调用 ${tu.name}`;
      }
      if (desc && !seen.has(desc)) {
        seen.add(desc);
        tools.push(desc);
      }
    }
  }

  return tools;
}

/** Extract thinking blocks from assistant messages (Claude Code, MyAgents). */
function extractThinking(msgs: Message[]): string[] {
  const thoughts: string[] = [];
  for (const m of msgs) {
    if (m.type !== "assistant") continue;
    for (const block of m.content) {
      if (block.type === "thinking" && "thinking" in block && block.thinking) {
        const t = block.thinking.trim();
        if (t.length > 10) thoughts.push(t.length > 300 ? t.slice(0, 300) + "…" : t);
      }
    }
  }
  return thoughts;
}

/** Extract text responses from assistant messages. */
function extractAssistantText(msgs: Message[]): string[] {
  const texts: string[] = [];
  for (const m of msgs) {
    if (m.type !== "assistant") continue;
    for (const block of m.content) {
      if (block.type === "text" && "text" in block && block.text) {
        const t = block.text.trim();
        if (t.length > 10) texts.push(t.length > 300 ? t.slice(0, 300) + "…" : t);
      }
    }
  }
  return texts;
}

/** Compute session duration in minutes from message timestamps. */
function computeDuration(msgs: Message[]): number | null {
  if (msgs.length < 2) return null;
  const times = msgs.map((m) => new Date(m.timestamp).getTime()).filter((t) => !isNaN(t));
  if (times.length < 2) return null;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const diff = max - min;
  return diff > 60000 ? Math.round(diff / 60000) : null;
}

/** Extract and clean user messages.
 *  @param extraPatterns — additional noise patterns to filter (caller-provided). */
export function cleanUserMessage(text: string, extraPatterns?: RegExp[]): string | null {
  if (!text) return null;

  // Remove <user_query> wrapper
  let cleaned = text.replace(/<user_query>\s*/g, "").replace(/\s*<\/user_query>/g, "");

  // Remove XML/CDATA wrappers
  cleaned = cleaned.replace(/<!\[CDATA\[.*?\]\]>/g, "").trim();

  if (cleaned.startsWith("<?xml")) return null;
  if (cleaned.length < 3) return null;

  const patterns = extraPatterns
    ? DEFAULT_NOISE_PATTERNS.concat(extraPatterns)
    : DEFAULT_NOISE_PATTERNS;
  if (patterns.some((p) => p.test(cleaned))) return null;

  // Keep full message for Extract layer — no truncation here
  return cleaned;
}

/** Build digested sessions grouped by day.
 *  Extract layer: produces four-layer SessionLayers from ContentBlock, no truncation. */
export function groupByDay(
  sessions: Session[],
  rawMessages: Message[],
  since?: string,
  until?: string,
  extraNoisePatterns?: RegExp[],
  skipSubAgents = true,
): DayDigest[] {
  // Index messages by session
  const msgBySession = new Map<string, Message[]>();
  for (const m of rawMessages) {
    const list = msgBySession.get(m.sessionId) || [];
    list.push(m);
    msgBySession.set(m.sessionId, list);
  }

  const dayMap = new Map<string, { digest: DayDigest; nextIndex: number }>();

  for (const s of sessions) {
    if (skipSubAgents && s.isSubAgent) continue;

    const date = (s.firstMessageTime || s.lastModified || "").slice(0, 10);
    if (!date) continue;
    if (since && date < since) continue;
    if (until && date > until) continue;

    const msgs = msgBySession.get(s.id) || [];

    // Extract user messages from ContentBlock
    const userMsgs = msgs
      .filter((m) => m.type === "user")
      .flatMap((m) => {
        const texts: string[] = [];
        for (const block of m.content) {
          if (block.type === "text" && "text" in block && block.text) {
            texts.push(block.text);
          }
        }
        if (texts.length === 0) {
          // Fallback: some providers put text outside content blocks
          const fb = m.content
            .filter((c) => c.type === "text" && "text" in c)
            .map((c) => (c as { text: string }).text)
            .join("\n");
          if (fb) texts.push(fb);
        }
        return texts;
      })
      .map((t) => cleanUserMessage(t, extraNoisePatterns))
      .filter((t): t is string => t !== null);

    if (userMsgs.length === 0) continue;

    if (!dayMap.has(date)) {
      dayMap.set(date, {
        digest: {
          date,
          sessions: [],
          totalMessages: 0,
          providers: [],
        },
        nextIndex: 1,
      });
    }
    const entry = dayMap.get(date)!;
    entry.digest.totalMessages += s.messageCount || 0;

    const provider = s.provider as ProviderId;
    if (!entry.digest.providers.includes(provider)) entry.digest.providers.push(provider);

    const assistantThinking = extractThinking(msgs);
    const assistantText = extractAssistantText(msgs);
    const assistantTools = extractTools(msgs);
    const durationMinutes = computeDuration(msgs);

    entry.digest.sessions.push({
      index: entry.nextIndex++,
      sessionId: s.id,
      provider,
      userMessages: userMsgs,
      assistantThinking,
      assistantText,
      assistantTools,
      messageCount: s.messageCount || 0,
      firstMessageTime: s.firstMessageTime || s.lastModified || "",
      durationMinutes,
    });
  }

  return [...dayMap.values()]
    .map((e) => e.digest)
    .sort((a, b) => a.date.localeCompare(b.date));
}
