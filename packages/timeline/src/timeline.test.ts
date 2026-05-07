import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  filterTimeline,
  groupTimeline,
  timelineStats,
  type TimelineEntry,
} from "./timeline.js";
import type { Message } from "../domain/message.js";
import type { Session } from "../domain/session.js";
import type { Project } from "../domain/project.js";

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    parentId: null,
    sessionId: "session-a",
    sourceFile: "/tmp/test.jsonl",
    provider: "claude-code",
    type: "user",
    timestamp: "2026-04-28T10:00:00.000Z",
    content: [{ type: "text", text: "Hello" }],
    toolUses: [],
    usage: null,
    model: null,
    stopReason: null,
    costUSD: null,
    durationMs: null,
    cwd: null,
    isSidechain: false,
    isMeta: false,
    subtype: null,
    level: null,
    hookCount: null,
    preventedContinuation: false,
    compactMetadata: null,
    snapshot: null,
    isSnapshotUpdate: false,
    progressData: null,
    toolUseId: null,
    parentToolUseId: null,
    operation: null,
    summary: null,
    leafUuid: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-a",
    actualSessionId: "session-a",
    filePath: "/tmp/test.jsonl",
    provider: "claude-code",
    projectName: "test-project",
    projectPath: "/projects/test",
    messageCount: 3,
    firstMessageTime: "2026-04-28T10:00:00.000Z",
    lastMessageTime: "2026-04-28T12:00:00.000Z",
    lastModified: "2026-04-28T12:00:00.000Z",
    hasToolUse: true,
    hasErrors: false,
    summary: "Test session",
    isRenamed: false,
    storageType: "jsonl",
    isWorktree: false,
    worktreeName: null,
    isSubAgent: false,
    isPathDeleted: false,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    name: "test-project",
    path: "/projects/test",
    providers: ["claude-code"],
    sessionCount: 1,
    messageCount: 3,
    lastModified: "2026-04-28T12:00:00.000Z",
    gitInfo: null,
    resolutionMethod: "direct",
    ...overrides,
  };
}

// ─── buildTimeline ──────────────────────────────────────────────────────────

describe("buildTimeline", () => {
  it("joins messages with their session and project", () => {
    const messages = [makeMessage()];
    const sessions = [makeSession()];
    const projects = [makeProject()];

    const entries = buildTimeline(messages, sessions, projects);
    expect(entries).toHaveLength(1);
    expect(entries[0].message.id).toBe("msg-1");
    expect(entries[0].session.id).toBe("session-a");
    expect(entries[0].project.path).toBe("/projects/test");
  });

  it("sorts entries by timestamp ascending", () => {
    const messages = [
      makeMessage({ id: "m3", timestamp: "2026-04-28T14:00:00Z" }),
      makeMessage({ id: "m1", timestamp: "2026-04-28T10:00:00Z" }),
      makeMessage({ id: "m2", timestamp: "2026-04-28T12:00:00Z" }),
    ];
    const sessions = [
      makeSession({ id: "session-a", projectPath: "/projects/test" }),
    ];
    const projects = [makeProject()];

    const entries = buildTimeline(messages, sessions, projects);
    expect(entries.map((e) => e.message.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("skips messages whose session is not found", () => {
    const messages = [
      makeMessage({ sessionId: "no-match" }),
      makeMessage({ sessionId: "session-a" }),
    ];
    const sessions = [makeSession()];
    const projects = [makeProject()];

    const entries = buildTimeline(messages, sessions, projects);
    expect(entries).toHaveLength(1);
    expect(entries[0].message.sessionId).toBe("session-a");
  });

  it("skips messages whose project is not found", () => {
    const messages = [makeMessage()];
    const sessions = [
      makeSession({ id: "session-a", projectPath: "/projects/nonexistent" }),
    ];
    const projects = [makeProject()];

    const entries = buildTimeline(messages, sessions, projects);
    expect(entries).toHaveLength(0);
  });

  it("handles empty inputs", () => {
    expect(buildTimeline([], [], [])).toHaveLength(0);
  });

  it("joins multiple sessions across providers", () => {
    const messages = [
      makeMessage({ id: "a1", sessionId: "s-a", timestamp: "2026-04-28T10:00:00Z" }),
      makeMessage({ id: "b1", sessionId: "s-b", timestamp: "2026-04-28T11:00:00Z" }),
      makeMessage({ id: "c1", sessionId: "s-c", timestamp: "2026-04-28T12:00:00Z", provider: "codex" }),
    ];
    const sessions = [
      makeSession({ id: "s-a", projectPath: "/p/test-a", provider: "claude-code" }),
      makeSession({ id: "s-b", projectPath: "/p/test-a", provider: "gemini" }),
      makeSession({ id: "s-c", projectPath: "/p/test-b", provider: "codex" }),
    ];
    const projects = [
      makeProject({ path: "/p/test-a" }),
      makeProject({ path: "/p/test-b" }),
    ];

    const entries = buildTimeline(messages, sessions, projects);
    expect(entries).toHaveLength(3);
    expect(entries[0].session.provider).toBe("claude-code");
    expect(entries[1].session.provider).toBe("gemini");
    expect(entries[2].session.provider).toBe("codex");
  });
});

// ─── filterTimeline ─────────────────────────────────────────────────────────

describe("filterTimeline", () => {
  const entries: TimelineEntry[] = [
    {
      message: makeMessage({ id: "m1", timestamp: "2026-04-27T10:00:00Z" }),
      session: makeSession({ id: "s-a", provider: "claude-code", projectPath: "/p/a" }),
      project: makeProject({ path: "/p/a" }),
    },
    {
      message: makeMessage({ id: "m2", timestamp: "2026-04-28T10:00:00Z" }),
      session: makeSession({ id: "s-b", provider: "codex", projectPath: "/p/a" }),
      project: makeProject({ path: "/p/a" }),
    },
    {
      message: makeMessage({ id: "m3", timestamp: "2026-04-29T10:00:00Z" }),
      session: makeSession({ id: "s-c", provider: "claude-code", projectPath: "/p/b" }),
      project: makeProject({ path: "/p/b" }),
    },
  ];

  it("filters by since date (inclusive)", () => {
    const result = filterTimeline(entries, { since: "2026-04-28T00:00:00Z" });
    expect(result).toHaveLength(2);
    expect(result[0].message.id).toBe("m2");
  });

  it("filters by until date (inclusive)", () => {
    const result = filterTimeline(entries, { until: "2026-04-28T00:00:00Z" });
    expect(result).toHaveLength(1);
    expect(result[0].message.id).toBe("m1");
  });

  it("filters by date range", () => {
    const result = filterTimeline(entries, {
      since: "2026-04-28T00:00:00Z",
      until: "2026-04-28T23:59:59Z",
    });
    expect(result).toHaveLength(1);
    expect(result[0].message.id).toBe("m2");
  });

  it("filters by providers", () => {
    const result = filterTimeline(entries, { providers: ["codex"] });
    expect(result).toHaveLength(1);
    expect(result[0].session.provider).toBe("codex");
  });

  it("filters by project paths", () => {
    const result = filterTimeline(entries, { projectPaths: ["/p/b"] });
    expect(result).toHaveLength(1);
    expect(result[0].project.path).toBe("/p/b");
  });

  it("returns all entries when no filters given", () => {
    const result = filterTimeline(entries, {});
    expect(result).toHaveLength(3);
  });

  it("returns empty when no entries match", () => {
    const result = filterTimeline(entries, { providers: ["gemini"] });
    expect(result).toHaveLength(0);
  });
});

// ─── groupTimeline ──────────────────────────────────────────────────────────

describe("groupTimeline", () => {
  const entries: TimelineEntry[] = [
    {
      message: makeMessage({ id: "m1", timestamp: "2026-04-28T10:00:00Z" }),
      session: makeSession({ id: "s-a", projectPath: "/p/a" }),
      project: makeProject({ path: "/p/a" }),
    },
    {
      message: makeMessage({ id: "m2", timestamp: "2026-04-28T14:00:00Z" }),
      session: makeSession({ id: "s-a", projectPath: "/p/a" }),
      project: makeProject({ path: "/p/a" }),
    },
    {
      message: makeMessage({ id: "m3", timestamp: "2026-04-29T10:00:00Z" }),
      session: makeSession({ id: "s-b", projectPath: "/p/a" }),
      project: makeProject({ path: "/p/a" }),
    },
  ];

  it("groups by day", () => {
    const groups = groupTimeline(entries, "day");
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("2026-04-28");
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].label).toBe("2026-04-29");
    expect(groups[1].entries).toHaveLength(1);
  });

  it("groups by session", () => {
    const groups = groupTimeline(entries, "session");
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("s-a");
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].label).toBe("s-b");
    expect(groups[1].entries).toHaveLength(1);
  });

  it("groups by project", () => {
    const entries2: TimelineEntry[] = [
      ...entries,
      {
        message: makeMessage({ id: "m4", timestamp: "2026-04-28T12:00:00Z" }),
        session: makeSession({ id: "s-c", projectPath: "/p/b" }),
        project: makeProject({ path: "/p/b" }),
      },
    ];

    const groups = groupTimeline(entries2, "project");
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("/p/a");
    expect(groups[0].entries).toHaveLength(3);
    expect(groups[1].label).toBe("/p/b");
    expect(groups[1].entries).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(groupTimeline([], "day")).toHaveLength(0);
  });

  it("uses 'unknown' label when timestamp is missing", () => {
    const e: TimelineEntry = {
      message: makeMessage({ timestamp: "" }),
      session: makeSession(),
      project: makeProject(),
    };
    const groups = groupTimeline([e], "day");
    expect(groups[0].label).toBe("unknown");
  });
});

// ─── timelineStats ──────────────────────────────────────────────────────────

describe("timelineStats", () => {
  it("counts entries, providers, projects, days correctly", () => {
    const entries: TimelineEntry[] = [
      {
        message: makeMessage({ id: "m1", type: "user", timestamp: "2026-04-28T10:00:00Z" }),
        session: makeSession({ id: "s-a", provider: "claude-code", projectPath: "/p/a" }),
        project: makeProject({ path: "/p/a" }),
      },
      {
        message: makeMessage({ id: "m2", type: "assistant", timestamp: "2026-04-28T10:05:00Z", toolUses: [{ name: "read", input: {}, toolUseId: "t1" }] }),
        session: makeSession({ id: "s-a", provider: "claude-code", projectPath: "/p/a" }),
        project: makeProject({ path: "/p/a" }),
      },
      {
        message: makeMessage({ id: "m3", type: "user", timestamp: "2026-04-29T10:00:00Z" }),
        session: makeSession({ id: "s-b", provider: "codex", projectPath: "/p/a" }),
        project: makeProject({ path: "/p/a" }),
      },
    ];

    const stats = timelineStats(entries);
    expect(stats.totalEntries).toBe(3);
    expect(stats.providerCount).toBe(2);
    expect(stats.projectCount).toBe(1);
    expect(stats.dayCount).toBe(2);
    expect(stats.userMessages).toBe(2);
    expect(stats.assistantMessages).toBe(1);
    expect(stats.toolUses).toBe(1);
    expect(stats.dateRange.first).toBe("2026-04-28T10:00:00Z");
    expect(stats.dateRange.last).toBe("2026-04-29T10:00:00Z");
  });

  it("handles empty entries", () => {
    const stats = timelineStats([]);
    expect(stats.totalEntries).toBe(0);
    expect(stats.dateRange.first).toBeNull();
    expect(stats.dateRange.last).toBeNull();
  });
});
