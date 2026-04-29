// ─── Content blocks ─────────────────────────────────────────────────────────
export function createMessage(fields) {
    return {
        ...fields,
        parentId: fields.parentId ?? null,
        content: fields.content ?? [],
        toolUses: fields.toolUses ?? [],
        usage: fields.usage ?? null,
        model: fields.model ?? null,
        stopReason: fields.stopReason ?? null,
        costUSD: fields.costUSD ?? null,
        durationMs: fields.durationMs ?? null,
        cwd: fields.cwd ?? null,
        isSidechain: fields.isSidechain ?? false,
        isMeta: fields.isMeta ?? false,
        subtype: fields.subtype ?? null,
        level: fields.level ?? null,
        hookCount: fields.hookCount ?? null,
        preventedContinuation: fields.preventedContinuation ?? false,
        compactMetadata: fields.compactMetadata ?? null,
        snapshot: fields.snapshot ?? null,
        isSnapshotUpdate: fields.isSnapshotUpdate ?? false,
        progressData: fields.progressData ?? null,
        toolUseId: fields.toolUseId ?? null,
        parentToolUseId: fields.parentToolUseId ?? null,
        operation: fields.operation ?? null,
        summary: fields.summary ?? null,
        leafUuid: fields.leafUuid ?? null,
    };
}
//# sourceMappingURL=message.js.map