import type { ProviderId } from "./provider.js";

// ─── Project aggregate ──────────────────────────────────────────────────────
// A Project groups sessions from one or more AI tools working on the same codebase.

export interface Project {
  /** Project slug (derived from filesystem path) */
  readonly name: string;
  /** Actual filesystem path */
  readonly path: string;

  /** Which providers have sessions for this project */
  readonly providers: ProviderId[];

  readonly sessionCount: number;
  readonly messageCount: number;
  readonly lastModified: string;

  /** Git worktree info (if available) */
  readonly gitInfo: GitInfo | null;
}

export type GitWorktreeType = "main" | "linked" | "not_git";

export interface GitInfo {
  readonly worktreeType: GitWorktreeType;
  /** Path to main repo (only for linked worktrees) */
  readonly mainProjectPath: string | null;
}
