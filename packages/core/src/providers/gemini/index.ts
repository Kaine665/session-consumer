import * as fs from "node:fs";
import * as path from "node:path";
import { createMessage, type Message } from "../../domain/message.js";
import type { Project } from "../../domain/project.js";
import type { Session } from "../../domain/session.js";
import type { SessionProvider } from "../interface.js";
import {
  parseJsonl,
  normalizeContent,
  normalizeTs,
  extractToolUses,
  mergeToolResults,
} from "../../services/normalizer.js";

// ─── Detection ──────────────────────────────────────────────────────────────

function detect(): boolean {
  const base = getBasePath();
  return base !== null && fs.existsSync(base);
}

function getBasePath(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const p = path.join(home, ".gemini", "history");
  return fs.existsSync(p) ? p : null;
}

// ─── Scan projects ──────────────────────────────────────────────────────────

async function scanProjects(): Promise<Project[]> {
  const base = getBasePath();
  if (!base || !fs.existsSync(base)) return [];

  // Gemini organizes by project directories
  const projectMap = new Map<string, { sessionCount: number; messageCount: number; lastModified: string }>();
  const files = findJsonlFiles(base);

  for (const file of files) {
    const projectDir = path.dirname(file);
    const stat = fs.statSync(file);
    let msgCount = 0;
    await parseJsonl(file, () => { msgCount++; });

    const existing = projectMap.get(projectDir);
    if (existing) {
      existing.sessionCount++;
      existing.messageCount += msgCount;
      if (stat.mtime.toISOString() > existing.lastModified) {
        existing.lastModified = stat.mtime.toISOString();
      }
    } else {
      projectMap.set(projectDir, {
        sessionCount: 1,
        messageCount: msgCount,
        lastModified: stat.mtime.toISOString(),
      });
    }
  }

  return [...projectMap.entries()]
    .map(([projectPath, meta]): Project => ({
      name: path.basename(projectPath),
      path: projectPath,
      providers: ["gemini"],
      sessionCount: meta.sessionCount,
      messageCount: meta.messageCount,
      lastModified: meta.lastModified,
      gitInfo: null,
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

// ─── Load sessions ──────────────────────────────────────────────────────────

async function loadSessions(projectPath: string): Promise<Session[]> {
  if (!fs.existsSync(projectPath)) return [];

  const sessions: Session[] = [];
  const files = findJsonlFiles(projectPath);

  for (const file of files) {
    let msgCount = 0;
    let firstTs = "";
    let lastTs = "";
    let hasToolUse = false;
    let sessionId: string | null = null;
    let summary: string | null = null;
    const stat = fs.statSync(file);

    await parseJsonl(file, (entry) => {
      msgCount++;
      const ts = (entry.timestamp as string) || "";
      if (ts) {
        if (!firstTs || ts < firstTs) firstTs = ts;
        if (!lastTs || ts > lastTs) lastTs = ts;
      }
      if (entry.toolUse || entry.tool_use) hasToolUse = true;
      if (entry.sessionId && !sessionId) sessionId = entry.sessionId as string;
      if (entry.summary && !summary) summary = entry.summary as string;
    });

    sessions.push({
      id: file,
      actualSessionId: sessionId || path.basename(file, ".jsonl"),
      filePath: file,
      provider: "gemini",
      projectName: path.basename(projectPath),
      projectPath,
      messageCount: msgCount,
      firstMessageTime: firstTs || stat.birthtime.toISOString(),
      lastMessageTime: lastTs || stat.mtime.toISOString(),
      lastModified: stat.mtime.toISOString(),
      hasToolUse,
      hasErrors: false,
      summary,
      isRenamed: false,
      storageType: "jsonl",
    });
  }

  sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  return sessions;
}

// ─── Load messages ──────────────────────────────────────────────────────────

async function loadMessages(filePath: string, sessionId: string): Promise<Message[]> {
  const entries: Record<string, unknown>[] = [];
  await parseJsonl(filePath, (e) => entries.push(e));

  const messages = entries.map((entry) => {
    const content = normalizeContent(
      entry.message ? (entry.message as Record<string, unknown>).content : entry.content
    );
    return createMessage({
      id: (entry.uuid as string) || `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      parentId: (entry.parentUuid as string) ?? null,
      sessionId: (entry.sessionId as string) || sessionId,
      sourceFile: filePath,
      provider: "gemini",
      type: mapType((entry.type as string) || (entry.role as string) || "system"),
      timestamp: normalizeTs(entry.timestamp),
      content,
      toolUses: extractToolUses(content),
      usage: extractUsage(entry),
      model: (entry.model as string) ?? null,
      stopReason: (entry.stopReason as string) ?? null,
      costUSD: (entry.costUSD as number) ?? null,
      durationMs: (entry.durationMs as number) ?? null,
      cwd: null,
      isSidechain: false,
      isMeta: false,
      subtype: null,
      level: null,
      hookCount: null,
      compactMetadata: null,
      snapshot: null,
      progressData: null,
      toolUseId: null,
      parentToolUseId: null,
      operation: null,
      summary: (entry.summary as string) ?? null,
      leafUuid: null,
    });
  });

  return mergeToolResults(messages);
}

// ─── Search ─────────────────────────────────────────────────────────────────

async function search(query: string, maxResults = 50): Promise<Message[]> {
  const base = getBasePath();
  if (!base) return [];

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function findJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  function walk(d: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".jsonl")) results.push(full);
    }
  }
  walk(dir);
  return results;
}

function mapType(t: string): Message["type"] {
  switch (t) {
    case "user": return "user";
    case "assistant":
    case "model": return "assistant";
    case "system": return "system";
    default: return "system";
  }
}

function extractUsage(entry: Record<string, unknown>): Message["usage"] {
  const msg = entry.message as Record<string, unknown> | undefined;
  const usage = (msg?.usage || entry.usage) as Record<string, unknown> | undefined;
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens as number | undefined,
    outputTokens: usage.output_tokens as number | undefined,
    cacheCreationInputTokens: usage.cache_creation_input_tokens as number | undefined,
    cacheReadInputTokens: usage.cache_read_input_tokens as number | undefined,
    serviceTier: usage.service_tier as string | undefined,
  };
}

// ─── Export ─────────────────────────────────────────────────────────────────

export const GeminiProvider: SessionProvider = {
  id: "gemini",
  displayName: "Gemini CLI",
  detect,
  getBasePath,
  scanProjects,
  loadSessions,
  loadMessages,
  search,
};
