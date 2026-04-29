/**
 * Extract project path from a Codex session file path.
 * Codex sessions are at: <base>/sessions/YYYY/MM/<name>.jsonl
 * The project path is encoded in the session file's metadata.
 */
export declare function inferProjectPath(sessionFilePath: string, sessionsBase: string): string;
/** Derive a human-readable project name from the session path. */
export declare function inferProjectName(sessionFilePath: string): string;
//# sourceMappingURL=normalizer.d.ts.map