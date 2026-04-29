import { createSearchQuery, searchAllProviders, extractText, } from "@sc/core";
export async function searchCommand(providers, query, opts) {
    const limit = parseInt(opts.limit || "20", 10);
    const searchQuery = createSearchQuery(query, {
        limit,
        providers: opts.provider
            ? opts.provider.split(",")
            : undefined,
        messageType: opts.type,
    });
    const results = await searchAllProviders(searchQuery, providers);
    console.log(`\nSearch: "${query}" — ${results.length} results\n`);
    console.log(`${"─".repeat(80)}\n`);
    for (const result of results) {
        const msg = result.message;
        const ts = msg.timestamp.slice(0, 19).replace("T", " ");
        const textContent = extractText(msg.content);
        // Highlight matching text
        const snippet = textContent.length > 300
            ? textContent.slice(0, 300) + "..."
            : textContent;
        console.log(`[${msg.provider}] ${msg.type} — ${ts} (score: ${result.score})`);
        console.log(`${snippet}\n`);
        console.log(`  session: ${msg.sessionId}`);
        console.log();
    }
}
//# sourceMappingURL=search.js.map