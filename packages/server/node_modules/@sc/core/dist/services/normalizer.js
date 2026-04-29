import * as fs from "node:fs";
import { createInterface } from "node:readline";
// ─── JSONL parsing ──────────────────────────────────────────────────────────
export async function parseJsonl(filePath, onLine) {
    let count = 0;
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            onLine(JSON.parse(trimmed));
            count++;
        }
        catch {
            // Skip malformed lines
        }
    }
    return count;
}
export async function readJsonl(filePath) {
    const entries = [];
    await parseJsonl(filePath, (e) => entries.push(e));
    return entries;
}
// ─── Content normalization ──────────────────────────────────────────────────
export function normalizeContent(raw) {
    if (!raw)
        return [];
    if (typeof raw === "string") {
        return [{ type: "text", text: raw }];
    }
    if (Array.isArray(raw)) {
        return raw.map((block) => {
            switch (block.type) {
                case "text":
                    return { type: "text", text: block.text || "" };
                case "thinking":
                    return { type: "thinking", thinking: block.thinking || "" };
                case "tool_use":
                    return {
                        type: "tool_use",
                        id: block.id || "",
                        name: block.name || "",
                        input: block.input || {},
                    };
                case "tool_result":
                    return {
                        type: "tool_result",
                        tool_use_id: block.tool_use_id || "",
                        content: block.content,
                        is_error: block.is_error,
                    };
                default:
                    return { type: "text", text: JSON.stringify(block) };
            }
        }).filter(Boolean);
    }
    return [{ type: "text", text: JSON.stringify(raw) }];
}
// ─── Timestamp ──────────────────────────────────────────────────────────────
export function normalizeTs(ts) {
    if (!ts)
        return new Date().toISOString();
    try {
        return new Date(String(ts)).toISOString();
    }
    catch {
        return new Date().toISOString();
    }
}
// ─── Message type ───────────────────────────────────────────────────────────
const VALID_TYPES = new Set(["user", "assistant", "system"]);
export function normalizeType(t) {
    if (VALID_TYPES.has(t))
        return t;
    return "system";
}
// ─── System subtype ─────────────────────────────────────────────────────────
const VALID_SUBTYPES = new Set([
    "init", "compact_boundary", "microcompact_boundary", "stop_hook_summary",
    "turn_duration", "error", "file_history_snapshot", "queue_operation",
    "custom_title", "agent_name", "agent_setting", "permission_mode",
    "pr_link", "last_prompt", "progress", "attachment", "summary",
]);
export function normalizeSubtype(s) {
    if (VALID_SUBTYPES.has(s))
        return s;
    return null;
}
// ─── Tool use extraction ────────────────────────────────────────────────────
export function extractToolUses(content) {
    return content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
        name: b.name,
        input: b.input,
        toolUseId: b.id,
    }));
}
/** Extract text content from ContentBlock[] as a single string. */
export function extractText(content) {
    return content
        .filter((b) => b.type === "text" && "text" in b)
        .map((b) => b.text)
        .join(" ");
}
// ─── Merge tool results into assistant messages ─────────────────────────────
// Codex stores tool_use and tool_result as separate messages.
// Claude Code stores them together. We normalize to the Claude Code style.
export function mergeToolResults(messages) {
    const merged = [];
    const pending = new Map();
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
        const resultsToAttach = [];
        for (const tu of msg.toolUses) {
            const prs = pending.get(tu.toolUseId);
            if (prs) {
                resultsToAttach.push(...prs);
                pending.delete(tu.toolUseId);
            }
        }
        merged.unshift(resultsToAttach.length > 0
            ? { ...msg, content: [...msg.content, ...resultsToAttach] }
            : msg);
    }
    return merged;
}
//# sourceMappingURL=normalizer.js.map