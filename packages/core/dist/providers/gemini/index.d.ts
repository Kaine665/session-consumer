import { type Message } from "../../domain/message.js";
import type { SessionProvider } from "../interface.js";
export declare function loadMessages(filePath: string, sessionId: string): Promise<Message[]>;
export declare function mapType(t: string): Message["type"];
export declare function extractUsage(entry: Record<string, unknown>): Message["usage"];
export declare const GeminiProvider: SessionProvider;
//# sourceMappingURL=index.d.ts.map