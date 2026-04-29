import { createMessage, type Message } from "../../domain/message.js";
import {
  normalizeContent,
  normalizeTs,
  normalizeType,
  normalizeSubtype,
  extractToolUses,
  mergeToolResults,
} from "../../services/normalizer.js";
import { readJsonl } from "../../services/normalizer.js";

export async function loadMessages(filePath: string, sessionId: string): Promise<Message[]> {
  const raw = await readJsonl(filePath);
  const messages = raw.map((entry) => mapEntry(entry, filePath, sessionId));
  return mergeToolResults(messages);
}

function mapEntry(
  entry: Record<string, unknown>,
  sourceFile: string,
  sessionId: string,
): Message {
  const type = normalizeType((entry.type as string) || "system");
  const content = normalizeContent(entry.message ? (entry.message as Record<string, unknown>).content : entry.content);
  const toolUses = extractToolUses(content);

  return createMessage({
    id: (entry.uuid as string) || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parentId: (entry.parentUuid as string) ?? null,
    sessionId: (entry.sessionId as string) || sessionId,
    sourceFile,
    provider: "claude-code",
    type,
    timestamp: normalizeTs(entry.timestamp),
    content,
    toolUses,
    usage: extractUsage(entry),
    model: extractModel(entry),
    stopReason: (entry.stopReason as string) ?? null,
    costUSD: (entry.costUSD as number) ?? null,
    durationMs: (entry.durationMs as number) ?? null,
    cwd: (entry.cwd as string) ?? null,
    isSidechain: (entry.isSidechain as boolean) || false,
    isMeta: (entry.isMeta as boolean) || false,
    subtype: (entry.subtype as string)
      ? normalizeSubtype(entry.subtype as string)
      : (type === "system" && !entry.subtype ? "init" : null),
    level: (entry.level as Message["level"]) ?? null,
    hookCount: (entry.hookCount as number) ?? null,
    preventedContinuation: (entry.preventedContinuation as boolean) || false,
    compactMetadata: entry.compactMetadata
      ? (entry.compactMetadata as Message["compactMetadata"])
      : null,
    snapshot: entry.snapshot ?? null,
    isSnapshotUpdate: (entry.isSnapshotUpdate as boolean) || false,
    progressData: entry.data ?? null,
    toolUseId: (entry.toolUseID as string) ?? null,
    parentToolUseId: (entry.parentToolUseID as string) ?? null,
    operation: (entry.operation as Message["operation"]) ?? null,
    summary: (entry.summary as string) ?? null,
    leafUuid: (entry.leafUuid as string) ?? null,
  });
}

// ─── Claude Code specific extraction ────────────────────────────────────────

export function extractUsage(entry: Record<string, unknown>): Message["usage"] {
  // Claude Code v2025+: usage is in message.usage
  const msg = entry.message as Record<string, unknown> | undefined;
  const usage = (msg?.usage || entry.usage) as Record<string, unknown> | undefined;
  if (!usage) return null;

  return {
    inputTokens: usage.input_tokens as number | undefined,
    outputTokens: usage.output_tokens as number | undefined,
    cacheCreationInputTokens: usage.cache_creation_input_tokens as number | undefined,
    cacheReadInputTokens: usage.cache_read_input_tokens as number | undefined,
    serviceTier: usage.service_tier as string | undefined,
  };
}

export function extractModel(entry: Record<string, unknown>): string | null {
  // model is inside message object
  const msg = entry.message as Record<string, unknown> | undefined;
  return (msg?.model as string) ?? (entry.model as string) ?? null;
}
