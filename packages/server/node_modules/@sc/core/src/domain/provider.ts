// ─── Provider identity ──────────────────────────────────────────────────────

export const PROVIDER_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "gemini",
  "opencode",
  "myagents",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex CLI",
  cursor: "Cursor",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  myagents: "MyAgents",
};

/** Key data directories for each provider. */
export const PROVIDER_DATA_PATHS: Record<
  ProviderId,
  { baseDir: () => string | null }
> = {
  "claude-code": {
    baseDir: () => {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (!home) return null;
      return `${home}/.claude/projects`;
    },
  },
  codex: {
    baseDir: () => {
      const base =
        process.env.CODEX_HOME ||
        `${process.env.HOME || process.env.USERPROFILE}/.codex`;
      return base ? `${base}/sessions` : null;
    },
  },
  cursor: {
    baseDir: () => null, // Per-project .cursor/ directory
  },
  gemini: {
    baseDir: () => {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (!home) return null;
      return `${home}/.gemini/history`;
    },
  },
  opencode: {
    baseDir: () => {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (!home) return null;
      return `${home}/.local/share/opencode`;
    },
  },
  myagents: {
    baseDir: () => {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (!home) return null;
      return `${home}/.myagents/sessions`;
    },
  },
};
