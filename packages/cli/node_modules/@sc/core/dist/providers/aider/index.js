import * as fs from "node:fs";
import * as path from "node:path";
import { createMessage } from "../../domain/message.js";
/**
 * Aider provider.
 *
 * Aider stores conversation history as a Markdown file in the project root:
 *   .aider.chat.history.md
 *
 * Format:
 *   #### <role> at <timestamp>
 *   <content>
 *
 *   >>> <tool_call>
 *   <result>
 */
function detect() {
    // Aider is per-project — always scannable
    return true;
}
function getBasePath() {
    return process.env.HOME || process.env.USERPROFILE || null;
}
async function scanProjects() {
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
        for (const aideFile of findAiderFiles(root)) {
            const projectPath = path.dirname(aideFile);
            try {
                const content = fs.readFileSync(aideFile, "utf-8");
                const stat = fs.statSync(aideFile);
                const msgEstimate = (content.match(/^#### /gm) || []).length;
                projects.push({
                    name: path.basename(projectPath),
                    path: projectPath,
                    providers: ["aider"],
                    sessionCount: 1,
                    messageCount: msgEstimate,
                    lastModified: stat.mtime.toISOString(),
                    gitInfo: detectGit(projectPath),
                });
            }
            catch { /* skip */ }
        }
    }
    return projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}
function findAiderFiles(root) {
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
            if (e.name === ".aider.chat.history.md" && e.isFile()) {
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
async function loadSessions(projectPath) {
    const aideFile = path.join(projectPath, ".aider.chat.history.md");
    if (!fs.existsSync(aideFile))
        return [];
    const stat = fs.statSync(aideFile);
    const content = fs.readFileSync(aideFile, "utf-8");
    const blocks = content.split(/^#### /gm).filter(Boolean);
    const msgCount = blocks.length;
    const lastBlock = blocks[blocks.length - 1] || "";
    const firstBlock = blocks[0] || "";
    const firstTs = extractTimestamp(firstBlock);
    const lastTs = extractTimestamp(lastBlock);
    return [{
            id: aideFile,
            actualSessionId: path.basename(projectPath),
            filePath: aideFile,
            provider: "aider",
            projectName: path.basename(projectPath),
            projectPath,
            messageCount: msgCount,
            firstMessageTime: firstTs || stat.birthtime.toISOString(),
            lastMessageTime: lastTs || stat.mtime.toISOString(),
            lastModified: stat.mtime.toISOString(),
            hasToolUse: content.includes(">>>"),
            hasErrors: content.includes("error") || content.includes("Error"),
            summary: extractSummary(content),
            isRenamed: false,
            storageType: "markdown",
        }];
}
async function loadMessages(filePath, sessionId) {
    const content = fs.readFileSync(filePath, "utf-8");
    const blocks = parseAiderMarkdown(content);
    const messages = [];
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        messages.push(createMessage({
            id: `aider-${i}-${Date.now()}`,
            parentId: null,
            sessionId,
            sourceFile: filePath,
            provider: "aider",
            type: block.role === "assistant" ? "assistant" : block.role === "system" ? "system" : "user",
            timestamp: block.timestamp || new Date().toISOString(),
            content: [{ type: "text", text: block.content }],
            toolUses: extractAiderToolUses(block.content),
            usage: null,
            model: null,
            stopReason: null,
            costUSD: null,
            durationMs: null,
            cwd: null,
        }));
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
function parseAiderMarkdown(md) {
    const blocks = [];
    const sections = md.split(/^#### /gm).filter(Boolean);
    for (const section of sections) {
        const lines = section.split("\n");
        const header = lines[0] || "";
        const body = lines.slice(1).join("\n").trim();
        // Header format: "<role> at <ISO timestamp>"
        const headerMatch = header.match(/^(\w+)\s+at\s+(.+)/);
        const role = headerMatch?.[1]?.toLowerCase() || "unknown";
        const timestamp = headerMatch?.[2] || "";
        blocks.push({ role, timestamp, content: body });
    }
    return blocks;
}
function extractTimestamp(block) {
    const match = block.match(/at\s+(.+)/);
    if (!match)
        return "";
    try {
        return new Date(match[1]).toISOString();
    }
    catch {
        return "";
    }
}
function extractSummary(content) {
    // First user message is usually the task description
    const sections = content.split(/^#### /gm).filter(Boolean);
    for (const section of sections) {
        if (section.startsWith("user ")) {
            const body = section.split("\n").slice(1).join(" ").trim();
            return body.slice(0, 200);
        }
    }
    return null;
}
function extractAiderToolUses(content) {
    const results = [];
    const toolRe = /^>>>\s+(.+)/gm;
    let match;
    let idx = 0;
    while ((match = toolRe.exec(content)) !== null) {
        results.push({
            name: match[1].trim(),
            input: {},
            toolUseId: `aider-tool-${idx++}`,
        });
    }
    return results;
}
function detectGit(projectPath) {
    const gitDir = path.join(projectPath, ".git");
    if (!fs.existsSync(gitDir))
        return null;
    return { worktreeType: fs.statSync(gitDir).isDirectory() ? "main" : "linked", mainProjectPath: null };
}
export const AiderProvider = {
    id: "aider",
    displayName: "Aider",
    detect,
    getBasePath,
    scanProjects,
    loadSessions,
    loadMessages,
    search,
};
//# sourceMappingURL=index.js.map