import { createMessage } from "../../domain/message.js";
import { normalizeContent, normalizeTs, normalizeType, normalizeSubtype, extractToolUses, mergeToolResults, } from "../../services/normalizer.js";
import { readJsonl } from "../../services/normalizer.js";
export async function loadMessages(filePath, sessionId) {
    const raw = await readJsonl(filePath);
    const messages = raw.map((entry) => mapEntry(entry, filePath, sessionId));
    return mergeToolResults(messages);
}
function mapEntry(entry, sourceFile, sessionId) {
    const type = normalizeType(entry.type || "system");
    const content = normalizeContent(entry.message ? entry.message.content : entry.content);
    const toolUses = extractToolUses(content);
    return createMessage({
        id: entry.uuid || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        parentId: entry.parentUuid ?? null,
        sessionId: entry.sessionId || sessionId,
        sourceFile,
        provider: "claude-code",
        type,
        timestamp: normalizeTs(entry.timestamp),
        content,
        toolUses,
        usage: extractUsage(entry),
        model: extractModel(entry),
        stopReason: entry.stopReason ?? null,
        costUSD: entry.costUSD ?? null,
        durationMs: entry.durationMs ?? null,
        cwd: entry.cwd ?? null,
        isSidechain: entry.isSidechain || false,
        isMeta: entry.isMeta || false,
        subtype: entry.subtype
            ? normalizeSubtype(entry.subtype)
            : (type === "system" && !entry.subtype ? "init" : null),
        level: entry.level ?? null,
        hookCount: entry.hookCount ?? null,
        preventedContinuation: entry.preventedContinuation || false,
        compactMetadata: entry.compactMetadata
            ? entry.compactMetadata
            : null,
        snapshot: entry.snapshot ?? null,
        isSnapshotUpdate: entry.isSnapshotUpdate || false,
        progressData: entry.data ?? null,
        toolUseId: entry.toolUseID ?? null,
        parentToolUseId: entry.parentToolUseID ?? null,
        operation: entry.operation ?? null,
        summary: entry.summary ?? null,
        leafUuid: entry.leafUuid ?? null,
    });
}
// ─── Claude Code specific extraction ────────────────────────────────────────
export function extractUsage(entry) {
    // Claude Code v2025+: usage is in message.usage
    const msg = entry.message;
    const usage = (msg?.usage || entry.usage);
    if (!usage)
        return null;
    return {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens,
        serviceTier: usage.service_tier,
    };
}
export function extractModel(entry) {
    // model is inside message object
    const msg = entry.message;
    return msg?.model ?? entry.model ?? null;
}
//# sourceMappingURL=loader.js.map