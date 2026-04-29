import type { SessionProvider } from "../interface.js";
/**
 * MyAgents stores content blocks as a double-serialized JSON string.
 * The outer JSONL parse gives us a string — parse it again to get the block array.
 * Also reshapes MyAgents-specific {type:"tool_use", tool:{id,name,input}} → {type:"tool_use", id, name, input}.
 */
export declare function parseContent(raw: unknown): unknown;
export declare function normalizeMyAgentsBlock(block: unknown): unknown;
export declare const MyAgentsProvider: SessionProvider;
//# sourceMappingURL=index.d.ts.map