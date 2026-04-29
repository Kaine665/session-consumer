import * as fs from "node:fs";
import * as path from "node:path";
import { createMessage } from "../../domain/message.js";
import { parseJsonl, normalizeContent, normalizeTs, extractToolUses, mergeToolResults, } from "../../services/normalizer.js";
/**
 * MyAgents provider.
 *
 * MyAgents stores AI conversation data at ~/.myagents/:
 *   sessions/  — JSONL files named <session-uuid>.jsonl
 *   logs/      — Per-day session logs: YYYY-MM-DD-<session-uuid>.log
 *   projects.json — Workspace project registry
 *
 * Each JSONL line in sessions/ is a message object:
 *   { id, role: "user"|"assistant"|"system", content, ... }
 */
// ─── Detection ──────────────────────────────────────────────────────────────
function detect() {
    const base = getBasePath();
    if (!base)
        return false;
    const sessionsDir = path.join(base, "sessions");
    return fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory();
}
function getBasePath() {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home)
        return null;
    const p = path.join(home, ".myagents");
    return fs.existsSync(p) ? p : null;
}
function loadProjectRegistry(basePath) {
    const projectsFile = path.join(basePath, "projects.json");
    if (!fs.existsSync(projectsFile))
        return [];
    try {
        const raw = JSON.parse(fs.readFileSync(projectsFile, "utf-8"));
        // projects.json can be a map or an array
        const entries = [];
        if (Array.isArray(raw)) {
            for (const p of raw) {
                entries.push({ id: p.id || p.name, name: p.name || path.basename(p.path || ""), path: p.path || p.workspacePath || "" });
            }
        }
        else if (raw && typeof raw === "object") {
            for (const [key, val] of Object.entries(raw)) {
                entries.push({
                    id: key,
                    name: (val.name || key),
                    path: (val.path || val.workspacePath || key),
                });
            }
        }
        return entries;
    }
    catch {
        return [];
    }
}
// ─── Scan projects ──────────────────────────────────────────────────────────
async function scanProjects() {
    const base = getBasePath();
    if (!base)
        return [];
    const sessionsDir = path.join(base, "sessions");
    if (!fs.existsSync(sessionsDir))
        return [];
    // Group sessions. MyAgents doesn't have native project grouping like Claude Code,
    // so we try to infer from project registry and cwd in messages.
    const registry = loadProjectRegistry(base);
    const projectMap = new Map();
    const jsonlFiles = fs.readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => path.join(sessionsDir, f));
    for (const file of jsonlFiles) {
        let msgCount = 0;
        let lastTs = "";
        let detectedCwd = null;
        await parseJsonl(file, (entry) => {
            msgCount++;
            const ts = entry.timestamp || "";
            if (ts && ts > lastTs)
                lastTs = ts;
            if (!detectedCwd && entry.cwd)
                detectedCwd = entry.cwd;
        });
        const stat = fs.statSync(file);
        // Map to a project
        let projectPath = "myagents"; // default bucket
        let projectName = "MyAgents";
        if (detectedCwd) {
            // Check if this cwd matches a registered project
            const match = registry.find((p) => detectedCwd.startsWith(p.path));
            if (match) {
                projectPath = match.path;
                projectName = match.name;
            }
            else {
                projectPath = detectedCwd;
                projectName = path.basename(detectedCwd);
            }
        }
        const existing = projectMap.get(projectPath);
        if (existing) {
            existing.sessionCount++;
            existing.messageCount += msgCount;
            if (stat.mtime.toISOString() > existing.lastModified) {
                existing.lastModified = stat.mtime.toISOString();
            }
        }
        else {
            projectMap.set(projectPath, {
                name: projectName,
                sessionCount: 1,
                messageCount: msgCount,
                lastModified: stat.mtime.toISOString(),
            });
        }
    }
    return [...projectMap.entries()]
        .map(([projectPath, meta]) => ({
        name: meta.name,
        path: projectPath,
        providers: ["myagents"],
        sessionCount: meta.sessionCount,
        messageCount: meta.messageCount,
        lastModified: meta.lastModified,
        gitInfo: detectGit(projectPath),
    }))
        .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}
// ─── Load sessions ──────────────────────────────────────────────────────────
async function loadSessions(projectPath) {
    const base = getBasePath();
    if (!base)
        return [];
    const sessionsDir = path.join(base, "sessions");
    if (!fs.existsSync(sessionsDir))
        return [];
    const sessions = [];
    const registry = loadProjectRegistry(base);
    const jsonlFiles = fs.readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => path.join(sessionsDir, f));
    for (const file of jsonlFiles) {
        let msgCount = 0;
        let firstTs = "";
        let lastTs = "";
        let hasToolUse = false;
        let hasErrors = false;
        let summary = null;
        let detectedCwd = null;
        await parseJsonl(file, (entry) => {
            msgCount++;
            const ts = entry.timestamp || "";
            if (ts) {
                if (!firstTs || ts < firstTs)
                    firstTs = ts;
                if (!lastTs || ts > lastTs)
                    lastTs = ts;
            }
            if (entry.toolUse || entry.tool_use)
                hasToolUse = true;
            if (entry.role === "system" && entry.level === "error")
                hasErrors = true;
            if (!detectedCwd && entry.cwd)
                detectedCwd = entry.cwd;
            // Use first user message as summary
            if (!summary && entry.role === "user" && entry.content) {
                const text = typeof entry.content === "string" ? entry.content : "";
                summary = text.slice(0, 200).replace(/\n/g, " ");
            }
        });
        const stat = fs.statSync(file);
        const sessionId = path.basename(file, ".jsonl");
        // Determine project assignment
        let sessionProjectPath = projectPath;
        if (detectedCwd && projectPath === "myagents") {
            const match = registry.find((p) => detectedCwd.startsWith(p.path));
            if (match)
                sessionProjectPath = match.path;
        }
        // Only include if matches the requested project
        if (projectPath !== "myagents" && sessionProjectPath !== projectPath) {
            continue;
        }
        sessions.push({
            id: file,
            actualSessionId: sessionId,
            filePath: file,
            provider: "myagents",
            projectName: path.basename(sessionProjectPath) || "MyAgents",
            projectPath: sessionProjectPath,
            messageCount: msgCount,
            firstMessageTime: firstTs || stat.birthtime.toISOString(),
            lastMessageTime: lastTs || stat.mtime.toISOString(),
            lastModified: stat.mtime.toISOString(),
            hasToolUse,
            hasErrors,
            summary,
            isRenamed: false,
            storageType: "jsonl",
        });
    }
    sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return sessions;
}
// ─── Load messages ──────────────────────────────────────────────────────────
async function loadMessages(filePath, sessionId) {
    const entries = [];
    await parseJsonl(filePath, (e) => entries.push(e));
    const messages = entries.map((entry, idx) => {
        const role = entry.role || "system";
        const content = normalizeContent(parseContent(entry.content));
        return createMessage({
            id: entry.id || `myagents-${idx}-${Date.now()}`,
            parentId: entry.parentId ?? null,
            sessionId: sessionId || entry.sessionId || path.basename(filePath, ".jsonl"),
            sourceFile: filePath,
            provider: "myagents",
            type: role === "assistant" ? "assistant" : role === "system" ? "system" : "user",
            timestamp: normalizeTs(entry.timestamp || entry.created_at),
            content,
            toolUses: extractToolUses(content),
            usage: extractUsage(entry),
            model: extractModel(entry),
            stopReason: (entry.stopReason || entry.stop_reason) ?? null,
            costUSD: (entry.costUSD || entry.cost_usd) ?? null,
            durationMs: (entry.durationMs || entry.duration_ms) ?? null,
            cwd: entry.cwd ?? null,
            isSidechain: entry.isSidechain || false,
            isMeta: entry.isMeta || false,
            subtype: null,
            level: null,
            hookCount: null,
            compactMetadata: null,
            snapshot: null,
            progressData: null,
            toolUseId: null,
            parentToolUseId: null,
            operation: null,
            summary: entry.summary ?? null,
            leafUuid: null,
        });
    });
    return mergeToolResults(messages);
}
// ─── Search ─────────────────────────────────────────────────────────────────
async function search(query, maxResults = 50) {
    const base = getBasePath();
    if (!base)
        return [];
    const sessionsDir = path.join(base, "sessions");
    if (!fs.existsSync(sessionsDir))
        return [];
    const results = [];
    const q = query.toLowerCase();
    const jsonlFiles = fs.readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => path.join(sessionsDir, f));
    for (const file of jsonlFiles) {
        if (results.length >= maxResults)
            break;
        try {
            const messages = await loadMessages(file, path.basename(file, ".jsonl"));
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
// ─── Helpers ────────────────────────────────────────────────────────────────
/**
 * MyAgents stores content blocks as a double-serialized JSON string.
 * The outer JSONL parse gives us a string — parse it again to get the block array.
 * Also reshapes MyAgents-specific {type:"tool_use", tool:{id,name,input}} → {type:"tool_use", id, name, input}.
 */
export function parseContent(raw) {
    if (typeof raw !== "string")
        return raw;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("[") && !trimmed.startsWith("{"))
        return raw;
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        return raw;
    }
    if (Array.isArray(parsed)) {
        return parsed.map(normalizeMyAgentsBlock);
    }
    return normalizeMyAgentsBlock(parsed);
}
export function normalizeMyAgentsBlock(block) {
    if (!block || typeof block !== "object")
        return block;
    const b = block;
    if (b.type === "tool_use" && b.tool && typeof b.tool === "object") {
        const tool = b.tool;
        return { type: "tool_use", id: tool.id, name: tool.name, input: tool.input ?? {} };
    }
    return block;
}
function extractUsage(entry) {
    const usage = entry.usage;
    if (!usage)
        return null;
    return {
        inputTokens: usage.inputTokens ?? usage.input_tokens ?? undefined,
        outputTokens: usage.outputTokens ?? usage.output_tokens ?? undefined,
        cacheCreationInputTokens: usage.cacheCreationTokens ?? usage.cache_creation_input_tokens ?? undefined,
        cacheReadInputTokens: usage.cacheReadTokens ?? usage.cache_read_input_tokens ?? undefined,
        serviceTier: usage.service_tier,
    };
}
function extractModel(entry) {
    if (entry.model)
        return entry.model;
    const usage = entry.usage;
    return usage?.model ?? null;
}
function detectGit(projectPath) {
    if (!fs.existsSync(path.join(projectPath, ".git")))
        return null;
    try {
        const stat = fs.statSync(path.join(projectPath, ".git"));
        return {
            worktreeType: stat.isDirectory() ? "main" : "linked",
            mainProjectPath: null,
        };
    }
    catch {
        return null;
    }
}
// ─── Export ─────────────────────────────────────────────────────────────────
export const MyAgentsProvider = {
    id: "myagents",
    displayName: "MyAgents",
    detect,
    getBasePath,
    scanProjects,
    loadSessions,
    loadMessages,
    search,
};
//# sourceMappingURL=index.js.map