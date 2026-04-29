import { createMessage } from "../../domain/message.js";
import { normalizeContent, normalizeTs, extractToolUses, mergeToolResults, } from "../../services/normalizer.js";
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
export async function loadMessages(filePath, sessionId) {
    const raw = await readJsonl(filePath);
    const messages = raw.map((entry) => mapEntry(entry, filePath, sessionId));
    return mergeToolResults(messages);
}
function mapEntry(entry, sourceFile, sessionId) {
    const role = entry.role || "system";
    // Codex stores content as an array directly
    const rawContent = entry.content ?? entry.message;
    const content = normalizeContent(rawContent);
    // Codex uses OpenAI-style tool_calls on assistant messages
    const toolCalls = entry.tool_calls;
    const toolUses = toolCalls
        ? toolCalls.map((tc) => ({
            name: tc.function?.name || tc.name || "unknown",
            input: (tc.function?.arguments
                ? safeJsonParse(tc.function.arguments)
                : tc.input ?? {}),
            toolUseId: tc.id || tc.tool_use_id || "",
        }))
        : extractToolUses(content);
    // Map Codex role to our message type
    let type = mapRole(role);
    // tool_result becomes its own message type for merging
    if (role === "tool_result" || entry.type === "tool_result") {
        type = "user"; // Will be merged into assistant later
    }
    return createMessage({
        id: entry.uuid ||
            entry.id ||
            `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        parentId: entry.parent_uuid ?? entry.parentUuid ?? null,
        sessionId: entry.session_id || entry.sessionId || sessionId,
        sourceFile,
        provider: "codex",
        type,
        timestamp: normalizeTs(entry.timestamp || entry.created_at || entry.created),
        content,
        toolUses,
        usage: extractUsage(entry),
        model: entry.model ?? null,
        stopReason: entry.stop_reason ?? entry.finish_reason ?? null,
        costUSD: entry.cost_usd ?? entry.costUSD ?? null,
        durationMs: entry.duration_ms ?? entry.durationMs ?? null,
        cwd: entry.cwd ?? entry.working_directory ?? null,
        isSidechain: false,
        isMeta: false,
        subtype: entry.subtype ? entry.subtype : null,
        level: null,
        hookCount: null,
        compactMetadata: null,
        snapshot: null,
        progressData: null,
        toolUseId: null,
        parentToolUseId: null,
        operation: null,
        summary: entry.summary ?? null,
        leafUuid: null,
    });
}
function mapRole(role) {
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
function extractUsage(entry) {
    // Codex stores usage at top level or inside response
    const resp = entry.response;
    const usage = (resp?.usage || entry.usage || entry.token_usage);
    if (!usage)
        return null;
    return {
        inputTokens: (usage.input_tokens || usage.prompt_tokens),
        outputTokens: (usage.output_tokens || usage.completion_tokens),
        cacheCreationInputTokens: usage.cache_creation_input_tokens,
        cacheReadInputTokens: (usage.cache_read_input_tokens || usage.cached_tokens),
        serviceTier: usage.service_tier,
    };
}
function safeJsonParse(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return {};
    }
}
//# sourceMappingURL=loader.js.map