import * as fs from "node:fs";
import * as path from "node:path";
import type { Project } from "../../domain/project.js";
import type { Session } from "../../domain/session.js";
import { getSessionsDir, getArchivedDir } from "./detector.js";
import { parseJsonl } from "../../services/normalizer.js";

export async function scanProjects(): Promise<Project[]> {
  const projectMap = new Map<string, { sessionCount: number; messageCount: number; lastModified: string }>();

  for (const dir of [getSessionsDir(), getArchivedDir()]) {
    if (!dir || !fs.existsSync(dir)) continue;

    for await (const file of walkJsonlFiles(dir)) {
      const session = await buildSessionMeta(file, dir);
      const projectPath = sessionToProjectPath(file, dir);

      const existing = projectMap.get(projectPath);
      if (existing) {
        existing.sessionCount++;
        existing.messageCount += session.messageCount;
        if (session.lastModified > existing.lastModified) {
          existing.lastModified = session.lastModified;
        }
      } else {
        projectMap.set(projectPath, {
          sessionCount: 1,
          messageCount: session.messageCount,
          lastModified: session.lastModified,
        });
      }
    }
  }

  return [...projectMap.entries()]
    .map(([projectPath, meta]): Project => ({
      name: path.basename(projectPath),
      path: projectPath,
      providers: ["codex"],
      sessionCount: meta.sessionCount,
      messageCount: meta.messageCount,
      lastModified: meta.lastModified,
      gitInfo: null,
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

export async function loadSessions(): Promise<Session[]> {
  const sessions: Session[] = [];

  for (const dir of [getSessionsDir(), getArchivedDir()]) {
    if (!dir || !fs.existsSync(dir)) continue;

    for await (const file of walkJsonlFiles(dir)) {
      const meta = await buildSessionMeta(file, dir);
      sessions.push({
        id: file,
        actualSessionId: meta.sessionId || path.basename(file, ".jsonl"),
        filePath: file,
        provider: "codex",
        projectName: meta.projectName || "codex",
        projectPath: sessionToProjectPath(file, dir),
        messageCount: meta.messageCount,
        firstMessageTime: meta.firstTs || "",
        lastMessageTime: meta.lastTs || "",
        lastModified: meta.lastModified,
        hasToolUse: meta.hasToolUse,
        hasErrors: meta.hasErrors,
        summary: meta.summary,
        isRenamed: false,
        storageType: "jsonl",
      });
    }
  }

  sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  return sessions;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function* walkJsonlFiles(dir: string): AsyncGenerator<string> {
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { continue; }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl") && entry.name !== "session_index.jsonl") {
        yield full;
      }
    }
  }
}

async function buildSessionMeta(
  filePath: string,
  baseDir: string,
): Promise<{
  messageCount: number;
  firstTs: string;
  lastTs: string;
  hasToolUse: boolean;
  hasErrors: boolean;
  sessionId: string | null;
  summary: string | null;
  projectName: string | null;
  lastModified: string;
}> {
  let messageCount = 0;
  let firstTs = "";
  let lastTs = "";
  let hasToolUse = false;
  let hasErrors = false;
  let sessionId: string | null = null;
  let summary: string | null = null;
  let projectName: string | null = null;

  const stat = fs.statSync(filePath);

  await parseJsonl(filePath, (entry) => {
    messageCount++;
    const ts = (entry.timestamp as string) || "";
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }
    if (entry.tool_use || entry.toolUse) hasToolUse = true;
    if (entry.role === "assistant" && entry.tool_calls) hasToolUse = true;
    if (entry.session_id && !sessionId) sessionId = entry.session_id as string;
    if (entry.summary && !summary) summary = entry.summary as string;
    if (entry.project_name && !projectName) projectName = entry.project_name as string;
  });

  return {
    messageCount,
    firstTs,
    lastTs,
    hasToolUse,
    hasErrors,
    sessionId,
    summary,
    projectName,
    lastModified: stat.mtime.toISOString(),
  };
}

function sessionToProjectPath(filePath: string, baseDir: string): string {
  // Group by YYYY/MM directory
  const rel = path.relative(baseDir, filePath);
  const parts = rel.split(path.sep);
  if (parts.length >= 2) {
    return path.join(baseDir, parts[0], parts[1]);
  }
  return path.dirname(filePath);
}
