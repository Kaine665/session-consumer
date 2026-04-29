export type TextBlock = {
    type: "text";
    text: string;
};
export type ToolUseBlock = {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
};
export type ToolResultBlock = {
    type: "tool_result";
    tool_use_id: string;
    content: string | Array<{
        type: string;
        text?: string;
    }>;
    is_error?: boolean;
};
export type ThinkingBlock = {
    type: "thinking";
    thinking: string;
};
export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;
export type TokenUsage = {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    serviceTier?: string;
};
export type MessageType = "user" | "assistant" | "system";
export type SystemSubtype = "init" | "compact_boundary" | "microcompact_boundary" | "stop_hook_summary" | "turn_duration" | "error" | "file_history_snapshot" | "queue_operation" | "custom_title" | "agent_name" | "agent_setting" | "permission_mode" | "pr_link" | "last_prompt" | "progress" | "attachment" | "summary";
export interface Message {
    readonly id: string;
    readonly parentId: string | null;
    readonly sessionId: string;
    readonly sourceFile: string;
    readonly provider: string;
    readonly type: MessageType;
    readonly timestamp: string;
    readonly content: ContentBlock[];
    readonly toolUses: ToolUse[];
    readonly usage: TokenUsage | null;
    readonly model: string | null;
    readonly stopReason: string | null;
    readonly costUSD: number | null;
    readonly durationMs: number | null;
    readonly cwd: string | null;
    readonly isSidechain: boolean;
    readonly isMeta: boolean;
    readonly subtype: SystemSubtype | null;
    readonly level: "info" | "warn" | "error" | "suggestion" | null;
    readonly hookCount: number | null;
    readonly preventedContinuation: boolean;
    readonly compactMetadata: CompactMetadata | null;
    readonly snapshot: unknown;
    readonly isSnapshotUpdate: boolean;
    readonly progressData: unknown;
    readonly toolUseId: string | null;
    readonly parentToolUseId: string | null;
    readonly operation: QueueOperation | null;
    readonly summary: string | null;
    readonly leafUuid: string | null;
}
export interface ToolUse {
    readonly name: string;
    readonly input: Record<string, unknown>;
    readonly toolUseId: string;
}
export interface CompactMetadata {
    readonly trigger?: string;
    readonly preTokens?: number;
    readonly postTokens?: number;
}
export type QueueOperation = "enqueue" | "dequeue" | "cancel" | "promote";
type MessageFields = {
    id: string;
    parentId?: string | null;
    sessionId: string;
    sourceFile: string;
    provider: string;
    type: MessageType;
    timestamp: string;
    content?: ContentBlock[];
    toolUses?: ToolUse[];
    usage?: TokenUsage | null;
    model?: string | null;
    stopReason?: string | null;
    costUSD?: number | null;
    durationMs?: number | null;
    cwd?: string | null;
    isSidechain?: boolean;
    isMeta?: boolean;
    subtype?: SystemSubtype | null;
    level?: "info" | "warn" | "error" | "suggestion" | null;
    hookCount?: number | null;
    preventedContinuation?: boolean;
    compactMetadata?: CompactMetadata | null;
    snapshot?: unknown;
    isSnapshotUpdate?: boolean;
    progressData?: unknown;
    toolUseId?: string | null;
    parentToolUseId?: string | null;
    operation?: QueueOperation | null;
    summary?: string | null;
    leafUuid?: string | null;
};
export declare function createMessage(fields: MessageFields): Message;
export {};
//# sourceMappingURL=message.d.ts.map