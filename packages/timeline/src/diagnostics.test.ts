import { describe, it, expect } from "vitest";
import { diagnoseJoin } from "./diagnostics.js";
import type { Message } from "../domain/message.js";
import type { Session } from "../domain/session.js";
import type { Project } from "../domain/project.js";

function msg(id: string, sessionId: string, overrides: Partial<Message> = {}): Message {
  return {
    id, parentId: null, sessionId, sourceFile: "/t", provider: "claude-code",
    type: "user", timestamp: "2026-04-28T10:00:00Z",
    content: [], toolUses: [], usage: null, model: null, stopReason: null,
    costUSD: null, durationMs: null, cwd: null,
    isSidechain: false, isMeta: false, subtype: null, level: null,
    hookCount: null, preventedContinuation: false, compactMetadata: null,
    snapshot: null, isSnapshotUpdate: false, progressData: null,
    toolUseId: null, parentToolUseId: null, operation: null,
    summary: null, leafUuid: null,
    ...overrides,
  };
}

function sess(id: string, projectPath: string, overrides: Partial<Session> = {}): Session {
  return {
    id, actualSessionId: id, filePath: "/t", provider: "claude-code",
    projectName: "p", projectPath,
    messageCount: 0, firstMessageTime: "", lastMessageTime: "",
    lastModified: "", hasToolUse: false, hasErrors: false,
    summary: null, isRenamed: false, storageType: "jsonl", isWorktree: false, worktreeName: null, isSubAgent: false, isPathDeleted: false,
    ...overrides,
  };
}

function proj(path: string, overrides: Partial<Project> = {}): Project {
  return {
    name: "p", path, providers: ["claude-code"],
    sessionCount: 0, messageCount: 0, lastModified: "", gitInfo: null,
    resolutionMethod: "direct",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("diagnoseJoin", () => {
  it("all clean — everything joins", () => {
    const r = diagnoseJoin(
      [msg("m1", "s1"), msg("m2", "s1")],
      [sess("s1", "/p")],
      [proj("/p")],
    );
    expect(r.input).toEqual({ messages: 2, sessions: 1, projects: 1 });
    expect(r.joined).toBe(2);
    expect(r.lost.noSession.count).toBe(0);
    expect(r.lost.noProject.count).toBe(0);
    expect(r.unmatched.sessionsWithoutMessages).toHaveLength(0);
    expect(r.unmatched.projectsWithoutSessions).toHaveLength(0);
  });

  it("messages lose their session", () => {
    const r = diagnoseJoin(
      [msg("m1", "s1"), msg("m2", "ghost")],
      [sess("s1", "/p")],
      [proj("/p")],
    );
    expect(r.joined).toBe(1);
    expect(r.lost.noSession).toEqual({ count: 1, ids: ["ghost"] });
    expect(r.byId.noSession).toEqual(["m2"]);
    // s1 is seen, "ghost" is not in the session list so it's not "unmatched"
    expect(r.unmatched.sessionsWithoutMessages).toHaveLength(0);
  });

  it("messages lose their project", () => {
    const r = diagnoseJoin(
      [msg("m1", "s1"), msg("m2", "s2")],
      [sess("s1", "/p/a"), sess("s2", "/p/missing")],
      [proj("/p/a")],
    );
    expect(r.joined).toBe(1);
    expect(r.lost.noSession.count).toBe(0);
    expect(r.lost.noProject).toEqual({ count: 1, ids: ["/p/missing"] });
    expect(r.byId.noProject).toEqual(["m2"]);
  });

  it("session exists but has no messages pointing at it", () => {
    const r = diagnoseJoin(
      [msg("m1", "s1")],
      [sess("s1", "/p/a"), sess("orphan", "/p/a")],
      [proj("/p/a")],
    );
    expect(r.joined).toBe(1);
    expect(r.unmatched.sessionsWithoutMessages).toEqual(["orphan"]);
  });

  it("project exists but has no sessions linked to it", () => {
    const r = diagnoseJoin(
      [msg("m1", "s1")],
      [sess("s1", "/p/a")],
      [proj("/p/a"), proj("/p/unused")],
    );
    expect(r.joined).toBe(1);
    expect(r.unmatched.projectsWithoutSessions).toEqual(["/p/unused"]);
  });

  it("mixed — all failure modes at once", () => {
    const r = diagnoseJoin(
      [
        msg("m1", "s1"),       // OK
        msg("m2", "ghost"),     // no session
        msg("m3", "s3"),       // session exists but project missing
      ],
      [
        sess("s1", "/p/a"),
        sess("s2", "/p/a"),    // no messages
        sess("s3", "/p/missing"),
      ],
      [
        proj("/p/a"),
        proj("/p/unused"),     // no sessions
      ],
    );
    expect(r.joined).toBe(1);
    expect(r.lost.noSession).toEqual({ count: 1, ids: ["ghost"] });
    expect(r.lost.noProject).toEqual({ count: 1, ids: ["/p/missing"] });
    expect(r.unmatched.sessionsWithoutMessages).toEqual(["s2"]);
    expect(r.unmatched.projectsWithoutSessions).toEqual(["/p/unused"]);
    expect(r.byId.noSession).toEqual(["m2"]);
    expect(r.byId.noProject).toEqual(["m3"]);
  });

  it("empty inputs", () => {
    const r = diagnoseJoin([], [], []);
    expect(r.input).toEqual({ messages: 0, sessions: 0, projects: 0 });
    expect(r.joined).toBe(0);
    expect(r.lost.noSession.count).toBe(0);
    expect(r.unmatched.sessionsWithoutMessages).toHaveLength(0);
  });
});
