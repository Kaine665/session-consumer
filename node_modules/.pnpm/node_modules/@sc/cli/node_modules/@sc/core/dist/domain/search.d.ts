import type { MessageType } from "./message.js";
import type { ProviderId } from "./provider.js";
import type { Message } from "./message.js";
export interface SearchQuery {
    /** Free-text query string */
    readonly query: string;
    /** Which provider(s) to search. Undefined = all. */
    readonly providers?: ProviderId[];
    /** Filter by project name */
    readonly projectName?: string;
    /** Filter by message type */
    readonly messageType?: MessageType;
    /** ISO date range */
    readonly dateFrom?: string;
    readonly dateTo?: string;
    /** Only messages with tool use */
    readonly hasToolUse?: boolean;
    /** Filter by model */
    readonly model?: string;
    /** Max results */
    readonly limit: number;
}
export interface SearchResult {
    readonly message: Message;
    /** Surrounding context messages */
    readonly context: Message[];
    /** Relevance score (for ranked results) */
    readonly score: number;
}
/** Default query */
export declare function createSearchQuery(query: string, overrides?: Partial<SearchQuery>): SearchQuery;
//# sourceMappingURL=search.d.ts.map