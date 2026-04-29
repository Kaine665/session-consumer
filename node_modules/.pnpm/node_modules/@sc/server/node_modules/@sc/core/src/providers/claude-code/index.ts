import type { Message } from "../../domain/message.js";
import type { SessionProvider } from "../interface.js";
import { detect, getBasePath } from "./detector.js";
import { scanProjects, loadSessions } from "./scanner.js";
import { loadMessages } from "./loader.js";

export const ClaudeCodeProvider: SessionProvider = {
  id: "claude-code",
  displayName: "Claude Code",

  detect,
  getBasePath,

  scanProjects: async () => {
    const base = getBasePath();
    if (!base) return [];
    return scanProjects(base);
  },

  loadSessions: async (projectPath: string) => {
    const base = getBasePath();
    if (!base) return [];
    return loadSessions(base, projectPath);
  },

  loadMessages,

  search: async (query: string, maxResults = 50): Promise<Message[]> => {
    // Simple search: scan all projects, grep each session
    // This is intentionally simple for MVP. Replace with FTS5 for scale.
    const base = getBasePath();
    if (!base) return [];

    const projects = await scanProjects(base);
    const results: Message[] = [];
    const q = query.toLowerCase();

    for (const project of projects) {
      if (results.length >= maxResults) break;
      const sessions = await loadSessions(base, project.path);

      for (const session of sessions) {
        if (results.length >= maxResults) break;
        const messages = await loadMessages(session.filePath, session.id);
        for (const msg of messages) {
          if (results.length >= maxResults) break;
          const text = msg.content
            .filter((b) => b.type === "text" && "text" in b)
            .map((b) => (b as { type: "text"; text: string }).text)
            .join(" ");
          if (text.toLowerCase().includes(q)) {
            results.push(msg);
          }
        }
      }
    }

    return results;
  },
};
