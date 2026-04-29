import * as fs from "node:fs";
import * as path from "node:path";
import { createMessage } from "../../domain/message.js";
import { normalizeTs } from "../../services/normalizer.js";
/**
 * Cline provider.
 *
 * Cline stores task conversations as individual directories under:
 *   ~/.cline/tasks/<task-id>/
 *
 * Each task directory contains:
 *   - cline_task.yml  (metadata: name, created_at, messages)
 *   - api_conversation_history.json (full conversation history)
 *
 * The JSON format is: { messages: [{ role, content, tool_calls? }] }
 */
function detect() {
    const base = getBasePath();
    return base !== null && fs.existsSync(base);
}
function getBasePath() {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home)
        return null;
    const p = path.join(home, ".cline", "tasks");
    return fs.existsSync(p) ? p : null;
}
async function scanProjects() {
    const base = getBasePath();
    if (!base)
        return [];
    // Cline sessions are grouped by task
    // For now, treat the entire cline tasks dir as one "project"
    const files = findConversationFiles(base);
    if (files.length === 0)
        return [];
    let totalMsgs = 0;
    let lastModified = "";
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(file, "utf-8"));
            const msgs = data.messages;
            if (msgs)
                totalMsgs += msgs.length;
        }
        catch { /* skip malformed */ }
        const stat = fs.statSync(file);
        if (stat.mtime.toISOString() > lastModified) {
            lastModified = stat.mtime.toISOString();
        }
    }
    return [{
            name: "cline-tasks",
            path: base,
            providers: ["cline"],
            sessionCount: files.length,
            messageCount: totalMsgs,
            lastModified: lastModified || new Date().toISOString(),
            gitInfo: null,
        }];
}
async function loadSessions(projectPath) {
    if (!fs.existsSync(projectPath))
        return [];
    const files = findConversationFiles(projectPath);
    const sessions = [];
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(file, "utf-8"));
            const msgs = (data.messages || data.history) || [];
            const stat = fs.statSync(file);
            const taskName = path.basename(path.dirname(file));
            sessions.push({
                id: file,
                actualSessionId: taskName,
                filePath: file,
                provider: "cline",
                projectName: taskName,
                projectPath,
                messageCount: msgs.length,
                firstMessageTime: msgs.length > 0
                    ? normalizeTs(msgs[0].timestamp || msgs[0].created_at)
                    : stat.birthtime.toISOString(),
                lastMessageTime: msgs.length > 0
                    ? normalizeTs(msgs[msgs.length - 1].timestamp || msgs[msgs.length - 1].created_at)
                    : stat.mtime.toISOString(),
                lastModified: stat.mtime.toISOString(),
                hasToolUse: false,
                hasErrors: false,
                summary: (data.name || data.title || taskName) ?? null,
                isRenamed: false,
                storageType: "jsonl",
            });
        }
        catch { /* skip */ }
    }
    sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return sessions;
}
async function loadMessages(filePath, sessionId) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const rawMessages = (data.messages || data.history || []);
    const messages = [];
    for (let i = 0; i < rawMessages.length; i++) {
        const entry = rawMessages[i];
        const role = (entry.role || entry.type) || "user";
        let content = typeof entry.content === "string"
            ? [{ type: "text", text: entry.content }]
            : Array.isArray(entry.content)
                ? entry.content
                : [{ type: "text", text: JSON.stringify(entry.content || "") }];
        // Handle tool_calls in Cline format
        const toolCalls = entry.tool_calls;
        const toolUses = [];
        if (toolCalls) {
            for (const tc of toolCalls) {
                toolUses.push({
                    name: tc.function?.name || tc.name || "",
                    input: (tc.function?.arguments
                        ? safeJson(tc.function.arguments)
                        : (tc.input || {})),
                    toolUseId: tc.id || `tc-${i}`,
                });
            }
        }
        messages.push(createMessage({
            id: entry.id || `cline-${i}-${Date.now()}`,
            parentId: null,
            sessionId,
            sourceFile: filePath,
            provider: "cline",
            type: role === "assistant" ? "assistant" : role === "system" ? "system" : "user",
            timestamp: normalizeTs(entry.timestamp || entry.created_at),
            content: content,
            toolUses,
            usage: null,
            model: entry.model ?? null,
            stopReason: (entry.stop_reason || entry.finish_reason) ?? null,
            costUSD: entry.cost_usd ?? null,
            durationMs: null,
            cwd: null,
        }));
    }
    return messages;
}
async function search(query, maxResults = 50) {
    const base = getBasePath();
    if (!base)
        return [];
    const sessions = await loadSessions(base);
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
                if (text.toLowerCase().includes(q))
                    results.push(msg);
            }
        }
        catch { /* skip */ }
    }
    return results;
}
function findConversationFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir))
        return results;
    function walk(d, depth) {
        if (depth > 3)
            return;
        let entries;
        try {
            entries = fs.readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory())
                walk(full, depth + 1);
            else if (e.isFile() && (e.name === "api_conversation_history.json" || e.name === "conversation_history.json")) {
                results.push(full);
            }
        }
    }
    walk(dir, 0);
    return results;
}
function safeJson(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return {};
    }
}
export const ClineProvider = {
    id: "cline",
    displayName: "Cline",
    detect,
    getBasePath,
    scanProjects,
    loadSessions,
    loadMessages,
    search,
};
//# sourceMappingURL=index.js.map