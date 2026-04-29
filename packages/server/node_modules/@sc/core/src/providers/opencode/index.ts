import * as fs from "node:fs";
import * as path from "node:path";
import { createMessage, type Message } from "../../domain/message.js";
import type { Project } from "../../domain/project.js";
import type { Session } from "../../domain/session.js";
import type { SessionProvider } from "../interface.js";
import { normalizeTs } from "../../services/normalizer.js";

/**
 * OpenCode provider.
 *
 * OpenCode stores data at ~/.local/share/opencode/
 *   opencode.db          — SQLite database (sessions + messages)
 *   storage/session/     — JSON session files
 *   storage/message/     — JSON message files
 *
 * We try SQLite first, fall back to JSON files.
 */

function detect(): boolean {
  const base = getBasePath();
  return base !== null && fs.existsSync(base);
}

function getBasePath(): string | null {
  // OpenCode uses XDG data dir
  const xdgData = process.env.XDG_DATA_HOME ||
    (process.env.HOME ? path.join(process.env.HOME, ".local", "share") : null) ||
    (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : null);
  if (!xdgData) return null;

  const p = path.join(xdgData, "opencode");
  return fs.existsSync(p) ? p : null;
}

async function scanProjects(): Promise<Project[]> {
  const base = getBasePath();
  if (!base) return [];

  let sessionCount = 0;
  let messageCount = 0;
  let lastModified = "";

  // Try reading from SQLite first
  const dbPath = path.join(base, "opencode.db");
  if (fs.existsSync(dbPath)) {
    try {
      const { default: Database } = await import("better-sqlite3");
      const db = new Database(dbPath, { readonly: true });

      try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
        const tableNames = tables.map((t) => t.name);

        if (tableNames.includes("session")) {
          const sessions = db.prepare("SELECT COUNT(*) as cnt FROM session").get() as { cnt: number };
          sessionCount = sessions.cnt;
        }
        if (tableNames.includes("message")) {
          const msgs = db.prepare("SELECT COUNT(*) as cnt FROM message").get() as { cnt: number };
          messageCount = msgs.cnt;
        }
      } finally {
        db.close();
      }
    } catch { /* fall through to JSON file scan */ }
  }

  // Also scan JSON storage
  const storageDir = path.join(base, "storage");
  const sessionDir = path.join(storageDir, "session");
  const messageDir = path.join(storageDir, "message");

  if (fs.existsSync(sessionDir)) {
    const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".json"));
    if (sessionCount === 0) sessionCount = files.length;
    for (const f of files) {
      const stat = fs.statSync(path.join(sessionDir, f));
      if (stat.mtime.toISOString() > lastModified) lastModified = stat.mtime.toISOString();
    }
  }

  if (fs.existsSync(messageDir)) {
    const files = fs.readdirSync(messageDir).filter((f) => f.endsWith(".json"));
    if (messageCount === 0) messageCount = files.length;
    for (const f of files) {
      const stat = fs.statSync(path.join(messageDir, f));
      if (stat.mtime.toISOString() > lastModified) lastModified = stat.mtime.toISOString();
    }
  }

  if (sessionCount === 0 && messageCount === 0) return [];

  return [{
    name: "opencode",
    path: base,
    providers: ["opencode"],
    sessionCount,
    messageCount,
    lastModified: lastModified || new Date().toISOString(),
    gitInfo: null,
  }];
}

async function loadSessions(projectPath: string): Promise<Session[]> {
  if (!fs.existsSync(projectPath)) return [];

  const sessions: Session[] = [];
  const dbPath = path.join(projectPath, "opencode.db");

  if (fs.existsSync(dbPath)) {
    try {
      const { default: Database } = await import("better-sqlite3");
      const db = new Database(dbPath, { readonly: true });

      try {
        const rows = db.prepare(
          "SELECT * FROM session ORDER BY updated_at DESC"
        ).all() as Array<Record<string, unknown>>;

        for (const row of rows) {
          sessions.push({
            id: `${dbPath}:${row.id}`,
            actualSessionId: row.id as string,
            filePath: dbPath,
            provider: "opencode",
            projectName: (row.name || row.title) as string || (row.id as string),
            projectPath,
            messageCount: (row.message_count as number) || 0,
            firstMessageTime: (row.created_at as string) || "",
            lastMessageTime: (row.updated_at as string) || "",
            lastModified: (row.updated_at as string) || new Date().toISOString(),
            hasToolUse: false,
            hasErrors: false,
            summary: (row.summary || row.name || row.title) as string ?? null,
            isRenamed: false,
            storageType: "sqlite",
          });
        }
      } finally {
        db.close();
      }
    } catch { /* fall through */ }
  }

  // Fallback: scan JSON storage files
  if (sessions.length === 0) {
    const sessionDir = path.join(projectPath, "storage", "session");
    if (fs.existsSync(sessionDir)) {
      for (const file of fs.readdirSync(sessionDir).filter((f) => f.endsWith(".json"))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), "utf-8")) as Record<string, unknown>;
          const stat = fs.statSync(path.join(sessionDir, file));

          sessions.push({
            id: path.join(sessionDir, file),
            actualSessionId: (data.id || file.replace(".json", "")) as string,
            filePath: path.join(sessionDir, file),
            provider: "opencode",
            projectName: "opencode",
            projectPath,
            messageCount: (data.message_count as number) || 0,
            firstMessageTime: (data.created_at as string) || stat.birthtime.toISOString(),
            lastMessageTime: (data.updated_at as string) || stat.mtime.toISOString(),
            lastModified: stat.mtime.toISOString(),
            hasToolUse: false,
            hasErrors: false,
            summary: (data.name || data.title) as string ?? null,
            isRenamed: false,
            storageType: "jsonl",
          });
        } catch { /* skip */ }
      }
    }
  }

  sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  return sessions;
}

async function loadMessages(filePath: string, sessionId: string): Promise<Message[]> {
  const messages: Message[] = [];

  // Try SQLite
  if (filePath.endsWith(".db")) {
    const [dbPath, sessId] = sessionId.includes(":")
      ? [sessionId.split(":")[0], sessionId.split(":")[1]]
      : [filePath, sessionId];

    try {
      const { default: Database } = await import("better-sqlite3");
      const db = new Database(dbPath, { readonly: true });

      try {
        const rows = db.prepare(
          "SELECT * FROM message WHERE session_id = ? ORDER BY created_at"
        ).all(sessId) as Array<Record<string, unknown>>;

        for (const row of rows) {
          const role = (row.role || row.type) as string || "user";
          messages.push(createMessage({
            id: (row.id as string) || `opencode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            parentId: (row.parent_id as string) ?? null,
            sessionId: sessId,
            sourceFile: dbPath,
            provider: "opencode",
            type: role === "assistant" ? "assistant" : role === "system" ? "system" : "user",
            timestamp: normalizeTs(row.created_at || row.timestamp),
            content: typeof row.content === "string"
              ? [{ type: "text", text: row.content }]
              : row.content
                ? [JSON.parse(row.content as string)]
                : [],
            toolUses: [],
            usage: null,
            model: (row.model as string) ?? null,
            stopReason: null,
            costUSD: null,
            durationMs: null,
            cwd: null,
          }));
        }
      } finally {
        db.close();
      }
    } catch { /* fall through */ }
  }

  // Fallback: JSON message files
  if (messages.length === 0 && filePath.endsWith(".json")) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const msgs = (data.messages || []) as Array<Record<string, unknown>>;

      for (const entry of msgs) {
        const role = (entry.role || entry.type) as string || "user";
        messages.push(createMessage({
          id: (entry.id as string) || `opencode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parentId: null,
          sessionId,
          sourceFile: filePath,
          provider: "opencode",
          type: role === "assistant" ? "assistant" : role === "system" ? "system" : "user",
          timestamp: normalizeTs(entry.timestamp || entry.created_at),
          content: typeof entry.content === "string"
            ? [{ type: "text", text: entry.content }]
            : Array.isArray(entry.content)
              ? entry.content as Message["content"]
              : [{ type: "text", text: JSON.stringify(entry.content || "") }],
          toolUses: [],
          usage: null,
          model: (entry.model as string) ?? null,
          stopReason: null,
          costUSD: null,
          durationMs: null,
          cwd: null,
        }));
      }
    } catch { /* skip */ }
  }

  return messages;
}

async function search(query: string, maxResults = 50): Promise<Message[]> {
  const projects = await scanProjects();
  const results: Message[] = [];
  const q = query.toLowerCase();

  for (const project of projects) {
    if (results.length >= maxResults) break;
    const sessions = await loadSessions(project.path);
    for (const session of sessions) {
      if (results.length >= maxResults) break;
      try {
        const messages = await loadMessages(session.filePath, session.id);
        for (const msg of messages) {
          if (results.length >= maxResults) break;
          const text = msg.content
            .filter((b) => b.type === "text" && "text" in b)
            .map((b) => (b as { type: "text"; text: string }).text)
            .join(" ");
          if (text.toLowerCase().includes(q)) results.push(msg);
        }
      } catch { /* skip */ }
    }
  }

  return results;
}

export const OpenCodeProvider: SessionProvider = {
  id: "opencode",
  displayName: "OpenCode",
  detect,
  getBasePath,
  scanProjects,
  loadSessions,
  loadMessages,
  search,
};
