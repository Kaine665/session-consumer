import { createMessage, type Message } from "../../domain/message.js";
import {
  normalizeContent,
  normalizeTs,
  normalizeType,
  extractToolUses,
  mergeToolResults,
} from "../../services/normalizer.js";
import { readJsonl } from "../../services/normalizer.js";

/**
 * Load and normalize Codex messages.
 *
 * Codex format differences from Claude Code:
 * 1. Uses `role` instead of `type` for message classification
 * 2. `role` can be: user, assistant, system, tool_call, tool_result
 * 3. tool_use and tool_result are stored as SEPARATE messages
 *    (we merge them in the normalizer layer afterwards)
 * 4. Content is always an array of content blocks
 * 5. Has `tool_calls` array on assistant messages for OpenAI-style tool calling
 */
export async function loadMessages(
  filePath: string,
  sessionId: string,
): Promise<Message[]> {
  const raw = await readJsonl(filePath);
  const messages = raw.map((entry) => mapEntry(entry, filePath, sessionId));
  return mergeToolResults(messages);
}

function mapEntry(
  entry: Record<string, unknown>,
  sourceFile: string,
  sessionId: string,
): Message {
  const role = (entry.role as string) || "system";

  // Codex stores content as an array directly
  const rawContent = entry.content ?? entry.message;
  const content = normalizeContent(rawContent);

  // Codex uses OpenAI-style tool_calls on assistant messages
  const toolCalls = entry.tool_calls as Array<Record<string, unknown>> | undefined;
  const toolUses = toolCalls
    ? toolCalls.map((tc) => ({
        name: (tc.function as Record<string, unknown>)?.name as string || tc.name as string || "unknown",
        input: ((tc.function as Record<string, unknown>)?.arguments
          ? safeJsonParse((tc.function as Record<string, unknown>).arguments as string)
          : tc.input ?? {}) as Record<string, unknown>,
        toolUseId: tc.id as string || tc.tool_use_id as string || "",
      }))
    : extractToolUses(content);

  // Map Codex role to our message type
  let type = mapRole(role);

  // tool_result becomes its own message type for merging
  if (role === "tool_result" || entry.type === "tool_result") {
    type = "user"; // Will be merged into assistant later
  }

  return createMessage({
    id: (entry.uuid as string) ||
        (entry.id as string) ||
        `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parentId: (entry.parent_uuid as string) ?? (entry.parentUuid as string) ?? null,
    sessionId: (entry.session_id as string) || (entry.sessionId as string) || sessionId,
    sourceFile,
    provider: "codex",
    type,
    timestamp: normalizeTs(entry.timestamp || entry.created_at || entry.created),
    content,
    toolUses,
    usage: extractUsage(entry),
    model: (entry.model as string) ?? null,
    stopReason: (entry.stop_reason as string) ?? (entry.finish_reason as string) ?? null,
    costUSD: (entry.cost_usd as number) ?? (entry.costUSD as number) ?? null,
    durationMs: (entry.duration_ms as number) ?? (entry.durationMs as number) ?? null,
    cwd: (entry.cwd as string) ?? (entry.working_directory as string) ?? null,
    isSidechain: false,
    isMeta: false,
    subtype: (entry.subtype as string) ? (entry.subtype as Message["subtype"]) : null,
    level: null,
    hookCount: null,
    compactMetadata: null,
    snapshot: null,
    progressData: null,
    toolUseId: null,
    parentToolUseId: null,
    operation: null,
    summary: (entry.summary as string) ?? null,
    leafUuid: null,
  });
}

function mapRole(role: string): Message["type"] {
  switch (role) {
    case "user": return "user";
    case "assistant": return "assistant";
    case "tool_call":
    case "tool_use": return "assistant";
    case "tool_result":
    case "tool": return "user"; // Will be merged
    case "system": return "system";
    default: return "system";
  }
}

function extractUsage(entry: Record<string, unknown>): Message["usage"] {
  // Codex stores usage at top level or inside response
  const resp = entry.response as Record<string, unknown> | undefined;
  const usage = (resp?.usage || entry.usage || entry.token_usage) as Record<string, unknown> | undefined;
  if (!usage) return null;

  return {
    inputTokens: (usage.input_tokens || usage.prompt_tokens) as number | undefined,
    outputTokens: (usage.output_tokens || usage.completion_tokens) as number | undefined,
    cacheCreationInputTokens: usage.cache_creation_input_tokens as number | undefined,
    cacheReadInputTokens: (usage.cache_read_input_tokens || usage.cached_tokens) as number | undefined,
    serviceTier: usage.service_tier as string | undefined,
  };
}

function safeJsonParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; }
  catch { return {}; }
}
