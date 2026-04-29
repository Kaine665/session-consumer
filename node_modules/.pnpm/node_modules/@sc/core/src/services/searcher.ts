import type { Message } from "../domain/message.js";
import type { SearchQuery, SearchResult } from "../domain/search.js";
import type { SessionProvider } from "../providers/interface.js";
import { detectAvailable } from "../providers/interface.js";
import { extractText } from "./normalizer.js";

/**
 * Simple cross-provider full-text search.
 *
 * For now, uses in-memory case-insensitive matching.
 * This is sufficient for typical usage (a few thousand messages).
 * Later: SQLite FTS5 for sub-100ms search across 100K+ messages.
 */
export async function searchAllProviders(
  query: SearchQuery,
  providers: SessionProvider[],
): Promise<SearchResult[]> {
  const available = detectAvailable(providers);
  const targetProviders = query.providers
    ? available.filter((p) => query.providers!.includes(p.id))
    : available;

  const allResults: SearchResult[] = [];
  const q = query.query.toLowerCase();

  for (const provider of targetProviders) {
    let messages: Message[];
    try {
      messages = await provider.search(query.query, query.limit * 2);
    } catch {
      continue;
    }

    for (const msg of messages) {
      if (allResults.length >= query.limit) break;

      // Apply filters
      if (query.messageType && msg.type !== query.messageType) continue;
      if (query.hasToolUse && msg.toolUses.length === 0) continue;
      if (query.model && msg.model !== query.model) continue;
      if (query.dateFrom && msg.timestamp < query.dateFrom) continue;
      if (query.dateTo && msg.timestamp > query.dateTo) continue;

      // Score by substring match count
      const textContent = extractText(msg.content);
      const score = countMatches(textContent.toLowerCase(), q);

      if (score > 0) {
        allResults.push({
          message: msg,
          context: [],
          score,
        });
      }
    }
  }

  allResults.sort((a, b) => b.score - a.score);
  return allResults.slice(0, query.limit);
}

function countMatches(text: string, query: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(query, idx)) !== -1) {
    count++;
    idx += query.length;
  }
  return count;
}
