import * as path from "node:path";

/**
 * Extract project path from a Codex session file path.
 * Codex sessions are at: <base>/sessions/YYYY/MM/<name>.jsonl
 * The project path is encoded in the session file's metadata.
 */
export function inferProjectPath(
  sessionFilePath: string,
  sessionsBase: string,
): string {
  const rel = path.relative(sessionsBase, sessionFilePath);
  const parts = rel.split(path.sep);
  // Remove YYYY/MM/<name>.jsonl → use as project key
  // Codex doesn't encode project path the same way Claude Code does.
  // We use the session file's parent directory structure as a grouping key.
  if (parts.length >= 2) {
    // Use YYYY/MM as the project grouping
    return path.join(sessionsBase, parts[0], parts[1]);
  }
  return sessionsBase;
}

/** Derive a human-readable project name from the session path. */
export function inferProjectName(sessionFilePath: string): string {
  const basename = path.basename(sessionFilePath, ".jsonl");
  // Codex session names often contain the project name
  // e.g., "my-project-2026-04-29.jsonl"
  const parts = basename.split("-");
  // Return first segment as project name guess
  return parts[0] || basename;
}
