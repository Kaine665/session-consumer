import { detectAvailable } from "../providers/interface.js";
/**
 * Cross-provider aggregation service.
 *
 * Given a set of providers, this:
 * 1. Scans all providers for projects
 * 2. Merges projects that share the same filesystem path (e.g., Claude Code + Codex
 *    both have sessions for /Users/jack/my-app)
 * 3. Returns a unified, deduplicated project list sorted by recency.
 */
export async function aggregateProjects(providers) {
    const available = detectAvailable(providers);
    const projectMap = new Map();
    for (const provider of available) {
        let projects;
        try {
            projects = await provider.scanProjects();
        }
        catch {
            continue;
        }
        for (const project of projects) {
            const key = project.path;
            const existing = projectMap.get(key);
            if (existing) {
                // Merge: combine providers, sum counts, keep latest modified
                const mergedProviders = [...new Set([...existing.providers, ...project.providers])];
                projectMap.set(key, {
                    ...existing,
                    providers: mergedProviders,
                    sessionCount: existing.sessionCount + project.sessionCount,
                    messageCount: existing.messageCount + project.messageCount,
                    lastModified: existing.lastModified > project.lastModified
                        ? existing.lastModified
                        : project.lastModified,
                    // Preserve git info from whichever has it
                    gitInfo: existing.gitInfo ?? project.gitInfo,
                });
            }
            else {
                projectMap.set(key, project);
            }
        }
    }
    return [...projectMap.values()].sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}
/**
 * Load sessions for a project from all providers that have data for it.
 */
export async function aggregateSessions(project, providers) {
    const available = detectAvailable(providers);
    const allSessions = [];
    for (const provider of available) {
        if (!project.providers.includes(provider.id))
            continue;
        try {
            const sessions = await provider.loadSessions(project.path);
            allSessions.push(...sessions);
        }
        catch {
            // Skip providers that fail to load
        }
    }
    allSessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return allSessions;
}
/**
 * Load messages for a session from the correct provider.
 */
export async function loadSessionMessages(session, providers) {
    const provider = providers.find((p) => p.id === session.provider);
    if (!provider)
        throw new Error(`No provider found for ${session.provider}`);
    return provider.loadMessages(session.filePath, session.id);
}
//# sourceMappingURL=aggregator.js.map