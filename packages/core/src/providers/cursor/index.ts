import * as fs from "node:fs";
import * as path from "node:path";
import { createMessage, type Message } from "../../domain/message.js";
import type { Project } from "../../domain/project.js";
import type { Session } from "../../domain/session.js";
import type { SessionProvider } from "../interface.js";
import { normalizeContent, normalizeTs } from "../../services/normalizer.js";

/**
 * Cursor provider.
 *
 * Cursor stores sessions in SQLite databases at:
 *   <project>/.cursor/chat.db
 *   <project>/.cursor/workspace.db
 *
 * On first implementation, we try to open the SQLite database.
 * Fall back gracefully if better-sqlite3 is not available.
 */
function detect(): boolean {
  // Cursor is per-project — we detect by scanning common project roots
  return true; // Always available as a scannable provider
}

function getBasePath(): string | null {
  return process.env.HOME || process.env.USERPROFILE || null;
}

async function scanProjects(): Promise<Project[]> {
  // Cursor sessions live inside project directories.
  // For now, scan from common roots: ~/projects, ~/code, ~/dev, ~/Desktop
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return [];

  const scanRoots = [
    path.join(home, "projects"),
    path.join(home, "code"),
    path.join(home, "dev"),
    path.join(home, "Desktop", "ProgrammingProjects"),
    path.join(home, "Documents"),
  ];

  const projects: Project[] = [];

  for (const root of scanRoots) {
    if (!fs.existsSync(root)) continue;
    for (const cursorDir of findCursorDirs(root)) {
      const projectPath = path.dirname(cursorDir);
      const sessions = await scanCursorSessions(cursorDir, projectPath);
      if (sessions.length > 0) {
        projects.push({
          name: path.basename(projectPath),
          path: projectPath,
          providers: ["cursor"],
          sessionCount: sessions.length,
          messageCount: sessions.reduce((sum, s) => sum + s.messageCount, 0),
          lastModified: sessions[0]?.lastModified || new Date().toISOString(),
          gitInfo: detectGit(projectPath),
        });
      }
    }
  }

  return projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

function findCursorDirs(root: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(root)) return results;

  function walk(dir: string, depth: number) {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const e of entries) {
      if (e.name === ".cursor" && e.isDirectory()) {
        results.push(path.join(dir, e.name));
      } else if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
        walk(path.join(dir, e.name), depth + 1);
      }
    }
  }
  walk(root, 0);
  return results;
}

async function scanCursorSessions(
  cursorDir: string,
  projectPath: string,
): Promise<Session[]> {
  const sessions: Session[] = [];

  // Try chat.db first
  const chatDb = path.join(cursorDir, "chat.db");
  if (fs.existsSync(chatDb)) {
    try {
      const cursorSessions = await readCursorDb(chatDb, projectPath);
      sessions.push(...cursorSessions);
    } catch { /* SQLite read may fail if better-sqlite3 not available */ }
  }

  // Also try workspace.db
  const workspaceDb = path.join(cursorDir, "workspace.db");
  if (fs.existsSync(workspaceDb)) {
    try {
      const wsSessions = await readCursorDb(workspaceDb, projectPath);
      for (const ws of wsSessions) {
        if (!sessions.find((s) => s.id === ws.id)) {
          sessions.push(ws);
        }
      }
    } catch { /* skip */ }
  }

  return sessions;
}

async function readCursorDb(dbPath: string, projectPath: string): Promise<Session[]> {
  let Database: any;
  try {
    const mod = await import("better-sqlite3");
    Database = mod.default;
  } catch {
    return []; // better-sqlite3 not available
  }

  const db = new Database(dbPath, { readonly: true });
  const sessions: Session[] = [];

  try {
    // Cursor chat.db schema: conversations table with id, title, created_at, updated_at
    // messages table with conversation_id, role, content, timestamp
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    if (tableNames.includes("conversations") || tableNames.includes("chat")) {
      const convTable = tableNames.includes("conversations") ? "conversations" : "chat";
      const msgTable = tableNames.includes("messages") ? "messages" : tableNames.includes("message") ? "message" : null;

      const conversations = db.prepare(
        `SELECT * FROM ${convTable} ORDER BY updated_at DESC`
      ).all() as Array<Record<string, unknown>>;

      for (const conv of conversations) {
        const convId = (conv.id || conv.conversation_id) as string;
        let msgCount = 0;
        let firstTs = "";
        let lastTs = "";

        if (msgTable) {
          // For Cursor's newer schema, messages have conversation_id FK
          try {
            const msgs = db.prepare(
              `SELECT * FROM ${msgTable} WHERE conversation_id = ? OR chat_id = ? ORDER BY timestamp`
            ).all(convId, convId) as Array<Record<string, unknown>>;
            msgCount = msgs.length;
            if (msgs.length > 0) {
              firstTs = (msgs[0].timestamp || msgs[0].created_at) as string || "";
              lastTs = (msgs[msgs.length - 1].timestamp || msgs[msgs.length - 1].created_at) as string || "";
            }
          } catch {
            // Fallback: count messages without FK
            const countRow = db.prepare(
              `SELECT COUNT(*) as cnt FROM ${msgTable}`
            ).get() as { cnt: number };
            msgCount = countRow.cnt;
          }
        }

        sessions.push({
          id: `${dbPath}:${convId}`,
          actualSessionId: convId,
          filePath: dbPath,
          provider: "cursor",
          projectName: path.basename(projectPath),
          projectPath,
          messageCount: msgCount,
          firstMessageTime: firstTs || (conv.created_at as string) || "",
          lastMessageTime: lastTs || (conv.updated_at as string) || "",
          lastModified: (conv.updated_at as string) || new Date().toISOString(),
          hasToolUse: false,
          hasErrors: false,
          summary: (conv.title || conv.name) as string ?? null,
          isRenamed: false,
          storageType: "sqlite",
        });
      }
    }
  } finally {
    db.close();
  }

  return sessions;
}

async function loadSessions(projectPath: string): Promise<Session[]> {
  const cursorDir = path.join(projectPath, ".cursor");
  if (!fs.existsSync(cursorDir)) return [];
  return scanCursorSessions(cursorDir, projectPath);
}

export async function loadMessages(filePath: string, sessionId: string): Promise<Message[]> {
  // filePath is the .db path, sessionId includes the conversation ID after ':'
  // Use lastIndexOf to handle Windows paths (e.g. C:\path\to\chat.db:convId)
  const lastColon = sessionId.lastIndexOf(":");
  const [dbPath, convId] = lastColon !== -1
    ? [sessionId.slice(0, lastColon), sessionId.slice(lastColon + 1)]
    : [filePath, sessionId];

  let Database: any;
  try {
    const mod = await import("better-sqlite3");
    Database = mod.default;
  } catch {
    return [];
  }

  const db = new Database(dbPath, { readonly: true });
  const messages: Message[] = [];

  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    const msgTable = tableNames.includes("messages") ? "messages" : tableNames.includes("message") ? "message" : null;

    if (!msgTable) return [];

    let rows: Array<Record<string, unknown>>;
    try {
      rows = db.prepare(
        `SELECT * FROM ${msgTable} WHERE conversation_id = ? OR chat_id = ? ORDER BY timestamp`
      ).all(convId, convId) as Array<Record<string, unknown>>;
    } catch {
      rows = db.prepare(`SELECT * FROM ${msgTable} ORDER BY rowid`).all() as Array<Record<string, unknown>>;
    }

    for (const row of rows) {
      messages.push(mapCursorMessage(row, convId, dbPath));
    }
  } finally {
    db.close();
  }

  return messages;
}

export function mapCursorMessage(
  row: Record<string, unknown>,
  convId: string,
  dbPath: string,
): Message {
  const role = (row.role || row.type) as string || "user";
  const content = normalizeContent(row.content);

  return createMessage({
    id: (row.id as string) || `cursor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parentId: null,
    sessionId: convId,
    sourceFile: dbPath,
    provider: "cursor",
    type: role === "assistant" ? "assistant" : role === "system" ? "system" : "user",
    timestamp: normalizeTs(row.timestamp || row.created_at),
    content,
    toolUses: [],
    usage: null,
    model: (row.model as string) ?? null,
    stopReason: null,
    costUSD: null,
    durationMs: null,
    cwd: null,
  });
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

function detectGit(projectPath: string): Project["gitInfo"] {
  const gitDir = path.join(projectPath, ".git");
  if (!fs.existsSync(gitDir)) return null;
  return { worktreeType: fs.statSync(gitDir).isDirectory() ? "main" : "linked", mainProjectPath: null };
}

export const CursorProvider: SessionProvider = {
  id: "cursor",
  displayName: "Cursor",
  detect,
  getBasePath,
  scanProjects,
  loadSessions,
  loadMessages,
  search,
};
