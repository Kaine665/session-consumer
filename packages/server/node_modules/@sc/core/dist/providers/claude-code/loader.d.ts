import { type Message } from "../../domain/message.js";
export declare function loadMessages(filePath: string, sessionId: string): Promise<Message[]>;
export declare function extractUsage(entry: Record<string, unknown>): Message["usage"];
export declare function extractModel(entry: Record<string, unknown>): string | null;
//# sourceMappingURL=loader.d.ts.map