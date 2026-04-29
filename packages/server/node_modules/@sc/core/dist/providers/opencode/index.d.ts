import { type Message } from "../../domain/message.js";
import type { SessionProvider } from "../interface.js";
export declare function loadMessages(filePath: string, sessionId: string): Promise<Message[]>;
export declare function mapOpenCodeRow(row: Record<string, unknown>, sessId: string, dbPath: string): Message;
export declare const OpenCodeProvider: SessionProvider;
//# sourceMappingURL=index.d.ts.map