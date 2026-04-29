export declare const PROVIDER_IDS: readonly ["claude-code", "codex", "cursor", "gemini", "cline", "aider", "opencode", "myagents"];
export type ProviderId = (typeof PROVIDER_IDS)[number];
export declare const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string>;
/** Key data directories for each provider. */
export declare const PROVIDER_DATA_PATHS: Record<ProviderId, {
    baseDir: () => string | null;
}>;
//# sourceMappingURL=provider.d.ts.map