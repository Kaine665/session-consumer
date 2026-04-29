import type { SearchQuery, SearchResult } from "../domain/search.js";
import type { SessionProvider } from "../providers/interface.js";
/**
 * Simple cross-provider full-text search.
 *
 * For now, uses in-memory case-insensitive matching.
 * This is sufficient for typical usage (a few thousand messages).
 * Later: SQLite FTS5 for sub-100ms search across 100K+ messages.
 */
export declare function searchAllProviders(query: SearchQuery, providers: SessionProvider[]): Promise<SearchResult[]>;
//# sourceMappingURL=searcher.d.ts.map