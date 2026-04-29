import { type Message } from "../../domain/message.js";
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
export declare function loadMessages(filePath: string, sessionId: string): Promise<Message[]>;
//# sourceMappingURL=loader.d.ts.map