import type { Project, ProjectMapping } from "./domain/project.js";
import type { Session } from "./domain/session.js";
import type { Message } from "./domain/message.js";
import type { ProviderId } from "./domain/provider.js";
import type { SearchResult } from "./domain/search.js";
import { createSearchQuery } from "./domain/search.js";
import type { SessionProvider } from "./providers/interface.js";
import { ClaudeCodeProvider } from "./providers/claude-code/index.js";
import { CodexProvider } from "./providers/codex/index.js";
import { CursorProvider } from "./providers/cursor/index.js";
import { GeminiProvider } from "./providers/gemini/index.js";
import { OpenCodeProvider } from "./providers/opencode/index.js";
import { MyAgentsProvider } from "./providers/myagents/index.js";
import { aggregateProjects, aggregateSessions, loadSessionMessages } from "./services/aggregator.js";
import { searchAllProviders } from "./services/searcher.js";
import { findMapping, upsertMapping, removeMapping } from "./services/project-mapping-store.js";

function defaultProviders(): SessionProvider[] {
  return [
    ClaudeCodeProvider,
    CodexProvider,
    CursorProvider,
    GeminiProvider,
    OpenCodeProvider,
    MyAgentsProvider,
  ];
}

export class SessionGateway {
  private providers: SessionProvider[];

  constructor(providers?: SessionProvider[]) {
    this.providers = providers ?? defaultProviders();
  }

  // ─── Projects ────────────────────────────────────────────────────────────

  /** List all projects across all providers, merged and deduplicated. */
  async listProjects(): Promise<Project[]> {
    return aggregateProjects(this.providers);
  }

  /** Find a project by its normalized path. Returns null if not found. */
  async getProject(path: string): Promise<Project | null> {
    const projects = await this.listProjects();
    return projects.find((p) => p.path === path) ?? null;
  }

  /** List unresolved ghost projects. */
  async listGhosts(): Promise<Project[]> {
    const projects = await this.listProjects();
    return projects.filter((p) => p.resolutionMethod === "unresolved");
  }

  // ─── Sessions ────────────────────────────────────────────────────────────

  /** Load sessions for a specific project. */
  async getSessions(project: Project): Promise<Session[]> {
    return aggregateSessions(project, this.providers);
  }

  /** Find a session by ID across all projects. Returns null if not found. */
  async findSession(sessionId: string): Promise<{
    project: Project;
    session: Session;
  } | null> {
    const projects = await this.listProjects();
    for (const project of projects) {
      const session = await this.findSessionInProject(project, sessionId);
      if (session) return { project, session };
    }
    return null;
  }

  /** Find a session by ID within a specific project. */
  async findSessionInProject(
    project: Project,
    sessionId: string,
  ): Promise<Session | null> {
    const sessions = await this.getSessions(project);
    return (
      sessions.find(
        (s) =>
          s.id === sessionId || s.actualSessionId === sessionId,
      ) ?? null
    );
  }

  /** List sessions across projects, optionally filtered by project name. */
  async listSessions(opts?: {
    projectName?: string;
  }): Promise<Session[]> {
    const projects = await this.listProjects();
    const allSessions: Session[] = [];

    for (const project of projects) {
      if (opts?.projectName && !project.name.includes(opts.projectName)) continue;
      const sessions = await this.getSessions(project);
      allSessions.push(...sessions);
    }

    return allSessions;
  }

  /** Load all messages for a session. */
  async loadMessages(session: Session): Promise<Message[]> {
    return loadSessionMessages(session, this.providers);
  }

  // ─── Bulk data loading ───────────────────────────────────────────────────

  /** Load projects, sessions, and messages in one call. The common data-loading
   *  step shared by timeline, daily reports, and other products. */
  async loadProjectData(opts?: {
    projectName?: string;
  }): Promise<{ projects: Project[]; sessions: Session[]; messages: Message[] }> {
    const allProjects = await this.listProjects();
    let projects = allProjects;
    if (opts?.projectName) {
      const name = opts.projectName;
      projects = allProjects.filter((p) => p.name.includes(name));
    }

    const sessions: Session[] = [];
    const messages: Message[] = [];
    for (const project of projects) {
      const ss = await this.getSessions(project);
      sessions.push(...ss);
      for (const s of ss) {
        messages.push(...(await this.loadMessages(s)));
      }
    }

    return { projects, sessions, messages };
  }

  // ─── Search ──────────────────────────────────────────────────────────────

  /** Full-text search across all providers. */
  async search(
    query: string,
    opts?: {
      providers?: ProviderId[];
      messageType?: "user" | "assistant" | "system";
      limit?: number;
    },
  ): Promise<SearchResult[]> {
    const sq = createSearchQuery(query, {
      limit: opts?.limit ?? 20,
      providers: opts?.providers,
      messageType: opts?.messageType,
    });
    return searchAllProviders(sq, this.providers);
  }

  // ─── Ghost mappings ──────────────────────────────────────────────────────

  /** Look up a ghost path in the mapping table. */
  getMapping(ghostPath: string): ProjectMapping | null {
    return findMapping(ghostPath);
  }

  /** Map a ghost path to a real project path. */
  mapGhost(ghostPath: string, targetPath: string): void {
    upsertMapping({
      unresolvedPath: ghostPath,
      targetProject: targetPath,
      reason: "user-mapped",
      resolvedAt: new Date().toISOString(),
    });
  }

  /** Mark a ghost project as deleted. */
  markGhostDeleted(ghostPath: string): void {
    upsertMapping({
      unresolvedPath: ghostPath,
      targetProject: null,
      reason: "user-marked-deleted",
      resolvedAt: new Date().toISOString(),
    });
  }

  /** Remove a ghost mapping entry. */
  removeGhostMapping(ghostPath: string): void {
    removeMapping(ghostPath);
  }

}
