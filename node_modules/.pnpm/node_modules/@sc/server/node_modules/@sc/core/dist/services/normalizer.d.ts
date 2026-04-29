import type { ContentBlock, Message, MessageType, SystemSubtype, ToolUse } from "../domain/message.js";
export declare function parseJsonl(filePath: string, onLine: (entry: Record<string, unknown>) => void): Promise<number>;
export declare function readJsonl(filePath: string): Promise<Record<string, unknown>[]>;
export declare function normalizeContent(raw: unknown): ContentBlock[];
export declare function normalizeTs(ts: unknown): string;
export declare function normalizeType(t: string): MessageType;
export declare function normalizeSubtype(s: string): SystemSubtype | null;
export declare function extractToolUses(content: ContentBlock[]): ToolUse[];
/** Extract text content from ContentBlock[] as a single string. */
export declare function extractText(content: {
    type: string;
    text?: string;
}[]): string;
export declare function mergeToolResults(messages: Message[]): Message[];
//# sourceMappingURL=normalizer.d.ts.map