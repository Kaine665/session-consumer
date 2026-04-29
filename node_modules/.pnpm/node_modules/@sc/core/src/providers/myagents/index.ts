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

function detect(): boolean {
  const base = getBasePath();
  if (!base) return false;
  const sessionsDir = path.join(base, "sessions");
  return fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory();
}

function getBasePath(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const p = path.join(home, ".myagents");
  return fs.existsSync(p) ? p : null;
}

// ─── Project registry parsing ───────────────────────────────────────────────

interface ProjectEntry {
  id: string;
  name: string;
  path: string;
}

function loadProjectRegistry(basePath: string): ProjectEntry[] {
  const projectsFile = path.join(basePath, "projects.json");
  if (!fs.existsSync(projectsFile)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(projectsFile, "utf-8"));
    // projects.json can be a map or an array
    const entries: ProjectEntry[] = [];
    if (Array.isArray(raw)) {
      for (const p of raw) {
        entries.push({ id: p.id || p.name, name: p.name || path.basename(p.path || ""), path: p.path || p.workspacePath || "" });
      }
    } else if (raw && typeof raw === "object") {
      for (const [key, val] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
        entries.push({
          id: key,
          name: (val.name || key) as string,
          path: (val.path || val.workspacePath || key) as string,
        });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

// ─── Scan projects ──────────────────────────────────────────────────────────

async function scanProjects(): Promise<Project[]> {
  const base = getBasePath();
  if (!base) return [];

  const sessionsDir = path.join(base, "sessions");
  if (!fs.existsSync(sessionsDir)) return [];

  // Group sessions. MyAgents doesn't have native project grouping like Claude Code,
  // so we try to infer from project registry and cwd in messages.
  const registry = loadProjectRegistry(base);
  const projectMap = new Map<string, { name: string; sessionCount: number; messageCount: number; lastModified: string }>();

  const jsonlFiles = fs.readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(sessionsDir, f));

  for (const file of jsonlFiles) {
    let msgCount = 0;
    let lastTs = "";
    let detectedCwd: string | null = null;

    await parseJsonl(file, (entry) => {
      msgCount++;
      const ts = (entry.timestamp as string) || "";
      if (ts && ts > lastTs) lastTs = ts;
      if (!detectedCwd && entry.cwd) detectedCwd = entry.cwd as string;
    });

    const stat = fs.statSync(file);

    // Map to a project
    let projectPath = "myagents"; // default bucket
    let projectName = "MyAgents";

    if (detectedCwd) {
      // Check if this cwd matches a registered project
      const match = registry.find((p) => detectedCwd!.startsWith(p.path));
      if (match) {
        projectPath = match.path;
        projectName = match.name;
      } else {
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
    } else {
      projectMap.set(projectPath, {
        name: projectName,
        sessionCount: 1,
        messageCount: msgCount,
        lastModified: stat.mtime.toISOString(),
      });
    }
  }

  return [...projectMap.entries()]
    .map(([projectPath, meta]): Project => ({
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

async function loadSessions(projectPath: string): Promise<Session[]> {
  const base = getBasePath();
  if (!base) return [];

  const sessionsDir = path.join(base, "sessions");
  if (!fs.existsSync(sessionsDir)) return [];

  const sessions: Session[] = [];
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
    let summary: string | null = null;
    let detectedCwd: string | null = null;

    await parseJsonl(file, (entry) => {
      msgCount++;
      const ts = (entry.timestamp as string) || "";
      if (ts) {
        if (!firstTs || ts < firstTs) firstTs = ts;
        if (!lastTs || ts > lastTs) lastTs = ts;
      }
      if (entry.toolUse || entry.tool_use) hasToolUse = true;
      if (entry.role === "system" && entry.level === "error") hasErrors = true;
      if (!detectedCwd && entry.cwd) detectedCwd = entry.cwd as string;
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
      const match = registry.find((p) => detectedCwd!.startsWith(p.path));
      if (match) sessionProjectPath = match.path;
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

async function loadMessages(filePath: string, sessionId: string): Promise<Message[]> {
  const entries: Record<string, unknown>[] = [];
  await parseJsonl(filePath, (e) => entries.push(e));

  const messages = entries.map((entry, idx) => {
    const role = (entry.role as string) || "system";
    const content = normalizeContent(parseContent(entry.content));

    return createMessage({
      id: (entry.id as string) || `myagents-${idx}-${Date.now()}`,
      parentId: (entry.parentId as string) ?? null,
      sessionId: sessionId || (entry.sessionId as string) || path.basename(filePath, ".jsonl"),
      sourceFile: filePath,
      provider: "myagents",
      type: role === "assistant" ? "assistant" : role === "system" ? "system" : "user",
      timestamp: normalizeTs(entry.timestamp || entry.created_at),
      content,
      toolUses: extractToolUses(content),
      usage: extractUsage(entry),
      model: extractModel(entry),
      stopReason: (entry.stopReason || entry.stop_reason) as string ?? null,
      costUSD: (entry.costUSD || entry.cost_usd) as number ?? null,
      durationMs: (entry.durationMs || entry.duration_ms) as number ?? null,
      cwd: (entry.cwd as string) ?? null,
      isSidechain: (entry.isSidechain as boolean) || false,
      isMeta: (entry.isMeta as boolean) || false,
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

  const sessionsDir = path.join(base, "sessions");
  if (!fs.existsSync(sessionsDir)) return [];

  const results: Message[] = [];
  const q = query.toLowerCase();
  const jsonlFiles = fs.readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(sessionsDir, f));

  for (const file of jsonlFiles) {
    if (results.length >= maxResults) break;
    try {
      const messages = await loadMessages(file, path.basename(file, ".jsonl"));
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

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * MyAgents stores content blocks as a double-serialized JSON string.
 * The outer JSONL parse gives us a string — parse it again to get the block array.
 * Also reshapes MyAgents-specific {type:"tool_use", tool:{id,name,input}} → {type:"tool_use", id, name, input}.
 */
export function parseContent(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return raw;
  }
  if (Array.isArray(parsed)) {
    return parsed.map(normalizeMyAgentsBlock);
  }
  return normalizeMyAgentsBlock(parsed);
}

export function normalizeMyAgentsBlock(block: unknown): unknown {
  if (!block || typeof block !== "object") return block;
  const b = block as Record<string, unknown>;
  if (b.type === "tool_use" && b.tool && typeof b.tool === "object") {
    const tool = b.tool as Record<string, unknown>;
    return { type: "tool_use", id: tool.id, name: tool.name, input: tool.input ?? {} };
  }
  return block;
}

function extractUsage(entry: Record<string, unknown>): Message["usage"] {
  const usage = entry.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  return {
    inputTokens: (usage.inputTokens as number) ?? (usage.input_tokens as number) ?? undefined,
    outputTokens: (usage.outputTokens as number) ?? (usage.output_tokens as number) ?? undefined,
    cacheCreationInputTokens: (usage.cacheCreationTokens as number) ?? (usage.cache_creation_input_tokens as number) ?? undefined,
    cacheReadInputTokens: (usage.cacheReadTokens as number) ?? (usage.cache_read_input_tokens as number) ?? undefined,
    serviceTier: usage.service_tier as string | undefined,
  };
}

function extractModel(entry: Record<string, unknown>): string | null {
  if (entry.model) return entry.model as string;
  const usage = entry.usage as Record<string, unknown> | undefined;
  return (usage?.model as string) ?? null;
}

function detectGit(projectPath: string): Project["gitInfo"] {
  if (!fs.existsSync(path.join(projectPath, ".git"))) return null;
  try {
    const stat = fs.statSync(path.join(projectPath, ".git"));
    return {
      worktreeType: stat.isDirectory() ? "main" : "linked",
      mainProjectPath: null,
    };
  } catch {
    return null;
  }
}

// ─── Export ─────────────────────────────────────────────────────────────────

export const MyAgentsProvider: SessionProvider = {
  id: "myagents",
  displayName: "MyAgents",
  detect,
  getBasePath,
  scanProjects,
  loadSessions,
  loadMessages,
  search,
};
