import { type Message } from "../../domain/message.js";
import type { SessionProvider } from "../interface.js";
export declare function loadMessages(filePath: string, sessionId: string): Promise<Message[]>;
export declare function mapCursorMessage(row: Record<string, unknown>, convId: string, dbPath: string): Message;
export declare const CursorProvider: SessionProvider;
//# sourceMappingURL=index.d.ts.map