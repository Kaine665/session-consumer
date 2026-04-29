import * as fs from "node:fs";
import { createInterface } from "node:readline";
import type { ContentBlock, Message, MessageType, SystemSubtype, ToolUse } from "../domain/message.js";

// ─── JSONL parsing ──────────────────────────────────────────────────────────

export async function parseJsonl(
  filePath: string,
  onLine: (entry: Record<string, unknown>) => void,
): Promise<number> {
  let count = 0;
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      onLine(JSON.parse(trimmed));
      count++;
    } catch {
      // Skip malformed lines
    }
  }
  return count;
}

export async function readJsonl(filePath: string): Promise<Record<string, unknown>[]> {
  const entries: Record<string, unknown>[] = [];
  await parseJsonl(filePath, (e) => entries.push(e));
  return entries;
}

// ─── Content normalization ──────────────────────────────────────────────────

export function normalizeContent(raw: unknown): ContentBlock[] {
  if (!raw) return [];

  if (typeof raw === "string") {
    return [{ type: "text", text: raw }];
  }

  if (Array.isArray(raw)) {
    return raw.map((block: Record<string, unknown>) => {
      switch (block.type) {
        case "text":
          return { type: "text", text: (block.text as string) || "" } as ContentBlock;
        case "thinking":
          return { type: "thinking", thinking: (block.thinking as string) || "" } as ContentBlock;
        case "tool_use":
          return {
            type: "tool_use",
            id: (block.id as string) || "",
            name: (block.name as string) || "",
            input: (block.input as Record<string, unknown>) || {},
          } as ContentBlock;
        case "tool_result":
          return {
            type: "tool_result",
            tool_use_id: (block.tool_use_id as string) || "",
            content: block.content as string | Array<{ type: string; text?: string }>,
            is_error: block.is_error as boolean | undefined,
          } as ContentBlock;
        default:
          return { type: "text", text: JSON.stringify(block) } as ContentBlock;
      }
    }).filter(Boolean);
  }

  return [{ type: "text", text: JSON.stringify(raw) }];
}

// ─── Timestamp ──────────────────────────────────────────────────────────────

export function normalizeTs(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  try {
    return new Date(String(ts)).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// ─── Message type ───────────────────────────────────────────────────────────

const VALID_TYPES = new Set<MessageType>(["user", "assistant", "system"]);

export function normalizeType(t: string): MessageType {
  if (VALID_TYPES.has(t as MessageType)) return t as MessageType;
  return "system";
}

// ─── System subtype ─────────────────────────────────────────────────────────

const VALID_SUBTYPES = new Set<SystemSubtype>([
  "init", "compact_boundary", "microcompact_boundary", "stop_hook_summary",
  "turn_duration", "error", "file_history_snapshot", "queue_operation",
  "custom_title", "agent_name", "agent_setting", "permission_mode",
  "pr_link", "last_prompt", "progress", "attachment", "summary",
]);

export function normalizeSubtype(s: string): SystemSubtype | null {
  if (VALID_SUBTYPES.has(s as SystemSubtype)) return s as SystemSubtype;
  return null;
}

// ─── Tool use extraction ────────────────────────────────────────────────────

export function extractToolUses(content: ContentBlock[]): ToolUse[] {
  return content
    .filter((b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use")
    .map((b) => ({
      name: b.name,
      input: b.input,
      toolUseId: b.id,
    }));
}

/** Extract text content from ContentBlock[] as a single string. */
export function extractText(content: { type: string; text?: string }[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text" && "text" in b)
    .map((b) => b.text)
    .join(" ");
}

// ─── Merge tool results into assistant messages ─────────────────────────────
// Codex stores tool_use and tool_result as separate messages.
// Claude Code stores them together. We normalize to the Claude Code style.

export function mergeToolResults(messages: Message[]): Message[] {
  const merged: Message[] = [];
  const pending = new Map<string, ContentBlock[]>();

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg.type !== "assistant") {
      const toolResults = msg.content.filter((b) => b.type === "tool_result");
      const other = msg.content.filter((b) => b.type !== "tool_result");

      for (const tr of toolResults) {
        const existing = pending.get(tr.tool_use_id) ?? [];
        existing.push(tr);
        pending.set(tr.tool_use_id, existing);
      }

      // Drop the message only if it was purely a tool_result carrier.
      // Preserve messages that genuinely have no content (e.g. system events).
      const hadOnlyToolResults = toolResults.length > 0 && other.length === 0;
      if (!hadOnlyToolResults) {
        merged.unshift({ ...msg, content: other });
      }
      continue;
    }

    // Assistant message — attach pending tool results
    const resultsToAttach: ContentBlock[] = [];
    for (const tu of msg.toolUses) {
      const prs = pending.get(tu.toolUseId);
      if (prs) {
        resultsToAttach.push(...prs);
        pending.delete(tu.toolUseId);
      }
    }

    merged.unshift(
      resultsToAttach.length > 0
        ? { ...msg, content: [...msg.content, ...resultsToAttach] }
        : msg,
    );
  }

  return merged;
}
