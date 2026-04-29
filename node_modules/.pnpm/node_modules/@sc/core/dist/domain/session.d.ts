import type { Message } from "./message.js";
import type { ProviderId } from "./provider.js";
export interface Session {
    /** Stable ID derived from file path */
    readonly id: string;
    /** The session ID found inside the messages (may differ from id) */
    readonly actualSessionId: string;
    /** Absolute path to the source file */
    readonly filePath: string;
    readonly provider: ProviderId;
    readonly projectName: string;
    readonly projectPath: string;
    readonly messageCount: number;
    readonly firstMessageTime: string;
    readonly lastMessageTime: string;
    readonly lastModified: string;
    readonly hasToolUse: boolean;
    readonly hasErrors: boolean;
    /** Summary from compaction or first user message */
    readonly summary: string | null;
    readonly isRenamed: boolean;
    /** Source format */
    readonly storageType: "jsonl" | "sqlite" | "markdown";
}
export interface MessagePage {
    readonly messages: Message[];
    readonly totalCount: number;
    readonly hasMore: boolean;
    readonly nextOffset: number;
}
//# sourceMappingURL=session.d.ts.map