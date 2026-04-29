import type { Project } from "../domain/project.js";
import type { Session } from "../domain/session.js";
import type { SessionProvider } from "../providers/interface.js";
/**
 * Cross-provider aggregation service.
 *
 * Given a set of providers, this:
 * 1. Scans all providers for projects
 * 2. Merges projects that share the same filesystem path (e.g., Claude Code + Codex
 *    both have sessions for /Users/jack/my-app)
 * 3. Returns a unified, deduplicated project list sorted by recency.
 */
export declare function aggregateProjects(providers: SessionProvider[]): Promise<Project[]>;
/**
 * Load sessions for a project from all providers that have data for it.
 */
export declare function aggregateSessions(project: Project, providers: SessionProvider[]): Promise<Session[]>;
/**
 * Load messages for a session from the correct provider.
 */
export declare function loadSessionMessages(session: Session, providers: SessionProvider[]): Promise<import("../domain/message.js").Message[]>;
//# sourceMappingURL=aggregator.d.ts.map