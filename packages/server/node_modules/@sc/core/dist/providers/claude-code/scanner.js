import * as fs from "node:fs";
import * as path from "node:path";
import { decodeSlug } from "./normalizer.js";
import { parseJsonl } from "../../services/normalizer.js";
export async function scanProjects(basePath) {
    if (!fs.existsSync(basePath))
        return [];
    const projects = [];
    const dirs = fs.readdirSync(basePath, { withFileTypes: true })
        .filter((d) => d.isDirectory());
    for (const dir of dirs) {
        try {
            const project = await buildProject(basePath, dir.name);
            if (project.sessionCount > 0) {
                projects.push(project);
            }
        }
        catch {
            // Skip unreadable project dirs
        }
    }
    projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return projects;
}
async function buildProject(basePath, slug) {
    const projectDir = path.join(basePath, slug);
    const projectPath = decodeSlug(slug);
    let sessionCount = 0;
    let messageCount = 0;
    let lastModified = "";
    const jsonlFiles = findJsonlFiles(projectDir);
    for (const file of jsonlFiles) {
        sessionCount++;
        try {
            const stat = fs.statSync(file);
            if (stat.mtime.toISOString() > lastModified) {
                lastModified = stat.mtime.toISOString();
            }
        }
        catch { /* ignore */ }
    }
    // Count messages per session file (fast scan — only read first/last timestamps)
    for (const file of jsonlFiles) {
        let count = 0;
        await parseJsonl(file, () => { count++; });
        messageCount += count;
    }
    return {
        name: path.basename(projectPath) || projectPath,
        path: projectPath,
        providers: ["claude-code"],
        sessionCount,
        messageCount,
        lastModified: lastModified || new Date().toISOString(),
        gitInfo: detectGitInfo(projectPath),
    };
}
export async function loadSessions(basePath, projectPath) {
    const slug = slugFromPath(projectPath);
    const projectDir = path.join(basePath, slug);
    if (!fs.existsSync(projectDir))
        return [];
    const jsonlFiles = findJsonlFiles(projectDir);
    const sessions = [];
    for (const file of jsonlFiles) {
        let messageCount = 0;
        let firstTs = "";
        let lastTs = "";
        let hasToolUse = false;
        let hasErrors = false;
        let actualSessionId = "";
        let summary = null;
        const stat = fs.statSync(file);
        await parseJsonl(file, (entry) => {
            messageCount++;
            const ts = entry.timestamp || "";
            if (ts) {
                if (!firstTs || ts < firstTs)
                    firstTs = ts;
                if (!lastTs || ts > lastTs)
                    lastTs = ts;
            }
            if (entry.toolUse)
                hasToolUse = true;
            if (entry.type === "system" && (entry.subtype === "error" || entry.level === "error")) {
                hasErrors = true;
            }
            if (!actualSessionId && entry.sessionId) {
                actualSessionId = entry.sessionId;
            }
            if (entry.type === "summary" && entry.summary) {
                summary = entry.summary;
            }
        });
        sessions.push({
            id: file,
            actualSessionId: actualSessionId || path.basename(file, ".jsonl"),
            filePath: file,
            provider: "claude-code",
            projectName: path.basename(projectPath) || projectPath,
            projectPath,
            messageCount,
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
// ─── Helpers ────────────────────────────────────────────────────────────────
function findJsonlFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir))
        return results;
    function walk(d) {
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
                walk(full);
            else if (e.isFile() && e.name.endsWith(".jsonl"))
                results.push(full);
        }
    }
    walk(dir);
    results.sort();
    return results;
}
function slugFromPath(projectPath) {
    // Reuse the normalization logic — same as encodeSlug
    let s = projectPath.replace(/\\/g, "/");
    if (/^[A-Z]:/i.test(s))
        s = s.replace(":", "");
    s = s.replace(/\//g, "-");
    return s.startsWith("-") ? s : "-" + s;
}
function detectGitInfo(projectPath) {
    const gitDir = path.join(projectPath, ".git");
    try {
        if (!fs.existsSync(gitDir))
            return { worktreeType: "not_git", mainProjectPath: null };
        const stat = fs.statSync(gitDir);
        if (stat.isDirectory())
            return { worktreeType: "main", mainProjectPath: null };
        // .git is a file → linked worktree
        const content = fs.readFileSync(gitDir, "utf-8");
        const match = content.match(/gitdir:\s*(.+)/);
        if (match) {
            const mainGitDir = match[1].trim();
            const mainDir = path.dirname(mainGitDir);
            return { worktreeType: "linked", mainProjectPath: mainDir };
        }
        return { worktreeType: "linked", mainProjectPath: null };
    }
    catch {
        return { worktreeType: "not_git", mainProjectPath: null };
    }
}
//# sourceMappingURL=scanner.js.map