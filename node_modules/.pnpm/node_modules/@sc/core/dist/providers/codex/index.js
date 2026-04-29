import { detect, getBasePath } from "./detector.js";
import { scanProjects, loadSessions } from "./scanner.js";
import { loadMessages } from "./loader.js";
export const CodexProvider = {
    id: "codex",
    displayName: "Codex CLI",
    detect,
    getBasePath,
    scanProjects,
    loadSessions: async (projectPath) => {
        // Codex groups by date directories, filter sessions that match
        const all = await loadSessions();
        return all.filter((s) => s.projectPath === projectPath);
    },
    loadMessages,
    search: async (query, maxResults = 50) => {
        const sessions = await loadSessions();
        const results = [];
        const q = query.toLowerCase();
        for (const session of sessions) {
            if (results.length >= maxResults)
                break;
            try {
                const messages = await loadMessages(session.filePath, session.id);
                for (const msg of messages) {
                    if (results.length >= maxResults)
                        break;
                    const text = msg.content
                        .filter((b) => b.type === "text" && "text" in b)
                        .map((b) => b.text)
                        .join(" ");
                    if (text.toLowerCase().includes(q)) {
                        results.push(msg);
                    }
                }
            }
            catch { /* skip unreadable */ }
        }
        return results;
    },
};
//# sourceMappingURL=index.js.map