import * as fs from "node:fs";
import * as path from "node:path";
import { createMessage } from "../../domain/message.js";
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
function detect() {
    // Cursor is per-project — we detect by scanning common project roots
    return true; // Always available as a scannable provider
}
function getBasePath() {
    return process.env.HOME || process.env.USERPROFILE || null;
}
async function scanProjects() {
    // Cursor sessions live inside project directories.
    // For now, scan from common roots: ~/projects, ~/code, ~/dev, ~/Desktop
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home)
        return [];
    const scanRoots = [
        path.join(home, "projects"),
        path.join(home, "code"),
        path.join(home, "dev"),
        path.join(home, "Desktop", "ProgrammingProjects"),
        path.join(home, "Documents"),
    ];
    const projects = [];
    for (const root of scanRoots) {
        if (!fs.existsSync(root))
            continue;
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
function findCursorDirs(root) {
    const results = [];
    if (!fs.existsSync(root))
        return results;
    function walk(dir, depth) {
        if (depth > 4)
            return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (e.name === ".cursor" && e.isDirectory()) {
                results.push(path.join(dir, e.name));
            }
            else if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
                walk(path.join(dir, e.name), depth + 1);
            }
        }
    }
    walk(root, 0);
    return results;
}
async function scanCursorSessions(cursorDir, projectPath) {
    const sessions = [];
    // Try chat.db first
    const chatDb = path.join(cursorDir, "chat.db");
    if (fs.existsSync(chatDb)) {
        try {
            const cursorSessions = await readCursorDb(chatDb, projectPath);
            sessions.push(...cursorSessions);
        }
        catch { /* SQLite read may fail if better-sqlite3 not available */ }
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
        }
        catch { /* skip */ }
    }
    return sessions;
}
async function readCursorDb(dbPath, projectPath) {
    let Database;
    try {
        const mod = await import("better-sqlite3");
        Database = mod.default;
    }
    catch {
        return []; // better-sqlite3 not available
    }
    const db = new Database(dbPath, { readonly: true });
    const sessions = [];
    try {
        // Cursor chat.db schema: conversations table with id, title, created_at, updated_at
        // messages table with conversation_id, role, content, timestamp
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        const tableNames = tables.map((t) => t.name);
        if (tableNames.includes("conversations") || tableNames.includes("chat")) {
            const convTable = tableNames.includes("conversations") ? "conversations" : "chat";
            const msgTable = tableNames.includes("messages") ? "messages" : tableNames.includes("message") ? "message" : null;
            const conversations = db.prepare(`SELECT * FROM ${convTable} ORDER BY updated_at DESC`).all();
            for (const conv of conversations) {
                const convId = (conv.id || conv.conversation_id);
                let msgCount = 0;
                let firstTs = "";
                let lastTs = "";
                if (msgTable) {
                    // For Cursor's newer schema, messages have conversation_id FK
                    try {
                        const msgs = db.prepare(`SELECT * FROM ${msgTable} WHERE conversation_id = ? OR chat_id = ? ORDER BY timestamp`).all(convId, convId);
                        msgCount = msgs.length;
                        if (msgs.length > 0) {
                            firstTs = (msgs[0].timestamp || msgs[0].created_at) || "";
                            lastTs = (msgs[msgs.length - 1].timestamp || msgs[msgs.length - 1].created_at) || "";
                        }
                    }
                    catch {
                        // Fallback: count messages without FK
                        const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM ${msgTable}`).get();
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
                    firstMessageTime: firstTs || conv.created_at || "",
                    lastMessageTime: lastTs || conv.updated_at || "",
                    lastModified: conv.updated_at || new Date().toISOString(),
                    hasToolUse: false,
                    hasErrors: false,
                    summary: (conv.title || conv.name) ?? null,
                    isRenamed: false,
                    storageType: "sqlite",
                });
            }
        }
    }
    finally {
        db.close();
    }
    return sessions;
}
async function loadSessions(projectPath) {
    const cursorDir = path.join(projectPath, ".cursor");
    if (!fs.existsSync(cursorDir))
        return [];
    return scanCursorSessions(cursorDir, projectPath);
}
async function loadMessages(filePath, sessionId) {
    // filePath is the .db path, sessionId includes the conversation ID after ':'
    const [dbPath, convId] = sessionId.includes(":")
        ? [sessionId.split(":")[0], sessionId.split(":")[1]]
        : [filePath, sessionId];
    let Database;
    try {
        const mod = await import("better-sqlite3");
        Database = mod.default;
    }
    catch {
        return [];
    }
    const db = new Database(dbPath, { readonly: true });
    const messages = [];
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        const tableNames = tables.map((t) => t.name);
        const msgTable = tableNames.includes("messages") ? "messages" : tableNames.includes("message") ? "message" : null;
        if (!msgTable)
            return [];
        let rows;
        try {
            rows = db.prepare(`SELECT * FROM ${msgTable} WHERE conversation_id = ? OR chat_id = ? ORDER BY timestamp`).all(convId, convId);
        }
        catch {
            rows = db.prepare(`SELECT * FROM ${msgTable} ORDER BY rowid`).all();
        }
        for (const row of rows) {
            const role = (row.role || row.type) || "user";
            const content = normalizeContent(row.content);
            messages.push(createMessage({
                id: row.id || `cursor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                parentId: null,
                sessionId: convId,
                sourceFile: dbPath,
                provider: "cursor",
                type: role === "assistant" ? "assistant" : role === "system" ? "system" : "user",
                timestamp: normalizeTs(row.timestamp || row.created_at),
                content,
                toolUses: [],
                usage: null,
                model: row.model ?? null,
                stopReason: null,
                costUSD: null,
                durationMs: null,
                cwd: null,
            }));
        }
    }
    finally {
        db.close();
    }
    return messages;
}
async function search(query, maxResults = 50) {
    const projects = await scanProjects();
    const results = [];
    const q = query.toLowerCase();
    for (const project of projects) {
        if (results.length >= maxResults)
            break;
        const sessions = await loadSessions(project.path);
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
                    if (text.toLowerCase().includes(q))
                        results.push(msg);
                }
            }
            catch { /* skip */ }
        }
    }
    return results;
}
function detectGit(projectPath) {
    const gitDir = path.join(projectPath, ".git");
    if (!fs.existsSync(gitDir))
        return null;
    return { worktreeType: fs.statSync(gitDir).isDirectory() ? "main" : "linked", mainProjectPath: null };
}
export const CursorProvider = {
    id: "cursor",
    displayName: "Cursor",
    detect,
    getBasePath,
    scanProjects,
    loadSessions,
    loadMessages,
    search,
};
//# sourceMappingURL=index.js.map