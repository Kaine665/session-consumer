import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { extractUsage, extractModel, loadMessages } from "./loader.js";

// ═══ extractUsage — pure function ═══════════════════════════════════════════════

describe("Claude Code extractUsage", () => {
  it("extracts usage from entry.message.usage (newer format)", () => {
    const entry = {
      message: {
        usage: {
          input_tokens: 500,
          output_tokens: 200,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 300,
          service_tier: "standard",
        },
      },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 500,
      outputTokens: 200,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 300,
      serviceTier: "standard",
    });
  });

  it("falls back to entry.usage (older format)", () => {
    const entry = {
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
      serviceTier: undefined,
    });
  });

  it("returns null when no usage present", () => {
    expect(extractUsage({})).toBeNull();
    expect(extractUsage({ message: {} })).toBeNull();
  });

  it("handles partial usage with only some fields", () => {
    const entry = {
      message: {
        usage: { input_tokens: 10 },
      },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 10,
      outputTokens: undefined,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
      serviceTier: undefined,
    });
  });
});

// ═══ extractModel — pure function ═══════════════════════════════════════════════

describe("Claude Code extractModel", () => {
  it("extracts model from entry.message.model", () => {
    expect(extractModel({ message: { model: "claude-sonnet-4-6" } })).toBe("claude-sonnet-4-6");
  });

  it("falls back to entry.model", () => {
    expect(extractModel({ model: "claude-opus-4-7" })).toBe("claude-opus-4-7");
  });

  it("prefers message.model over entry.model", () => {
    expect(extractModel({
      message: { model: "sonnet" },
      model: "opus",
    })).toBe("sonnet");
  });

  it("returns null when no model anywhere", () => {
    expect(extractModel({})).toBeNull();
  });
});

// ═══ loadMessages — integration ═════════════════════════════════════════════════

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-claude-code-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadMessagesFromLines(lines: string[]): Promise<ReturnType<typeof loadMessages>> {
  const filePath = path.join(tmpDir, "test-session.jsonl");
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  return loadMessages(filePath, "test-session");
}

describe("Claude Code loadMessages (integration)", () => {
  it("full pipeline: content nesting, snake_case usage, uuid mapping, subtype, tool_result merge", async () => {
    const msgs = await loadMessagesFromLines([
      // user message: content nested inside message
      JSON.stringify({
        uuid: "uuid-001",
        parentUuid: null,
        sessionId: "sess-01",
        type: "user",
        timestamp: "2026-02-09T07:46:44.424Z",
        message: { role: "user", content: "run the tests" },
      }),
      // assistant with text response and usage
      JSON.stringify({
        uuid: "uuid-002",
        parentUuid: "uuid-001",
        sessionId: "sess-01",
        type: "assistant",
        timestamp: "2026-02-09T07:46:50.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "running tests now" }],
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 500, output_tokens: 80 },
        },
      }),
      // assistant with tool_use
      JSON.stringify({
        uuid: "uuid-003",
        parentUuid: "uuid-002",
        sessionId: "sess-01",
        type: "assistant",
        timestamp: "2026-02-09T07:46:52.000Z",
        message: {
          role: "assistant",
          content: [{
            type: "tool_use",
            id: "call_01",
            name: "Bash",
            input: { command: "npm test" },
          }],
          usage: { input_tokens: 200, output_tokens: 60 },
        },
      }),
      // tool_result as separate user message
      JSON.stringify({
        uuid: "uuid-004",
        parentUuid: "uuid-003",
        sessionId: "sess-01",
        type: "user",
        timestamp: "2026-02-09T07:46:54.000Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "call_01", content: "all tests passed" }],
        },
      }),
      // system message with subtype
      JSON.stringify({
        uuid: "uuid-005",
        parentUuid: null,
        sessionId: "sess-01",
        type: "system",
        subtype: "init",
        timestamp: "2026-02-09T07:46:40.000Z",
      }),
    ]);

    // ── user message
    const user = msgs.find((m) => m.id === "uuid-001")!;
    expect(user.type).toBe("user");
    expect(user.content).toEqual([{ type: "text", text: "run the tests" }]);
    expect(user.provider).toBe("claude-code");

    // ── assistant with text
    const asst1 = msgs.find((m) => m.id === "uuid-002")!;
    expect(asst1.type).toBe("assistant");
    expect(asst1.content).toEqual([{ type: "text", text: "running tests now" }]);
    expect(asst1.usage).toEqual({ inputTokens: 500, outputTokens: 80 });
    expect(asst1.model).toBe("claude-sonnet-4-6");
    expect(asst1.toolUses).toEqual([]);

    // ── assistant with tool_use + merged tool_result
    const asst2 = msgs.find((m) => m.id === "uuid-003")!;
    expect(asst2.content).toHaveLength(2); // tool_use + tool_result (merged)
    expect(asst2.content[0]).toMatchObject({ type: "tool_use", name: "Bash" });
    expect(asst2.content[1]).toMatchObject({ type: "tool_result", tool_use_id: "call_01" });
    expect(asst2.toolUses).toHaveLength(1);
    expect(asst2.toolUses[0]).toMatchObject({
      name: "Bash",
      toolUseId: "call_01",
      input: { command: "npm test" },
    });

    // ── system message
    const sys = msgs.find((m) => m.id === "uuid-005")!;
    expect(sys.type).toBe("system");
    expect(sys.subtype).toBe("init");
  });

  it("falls back to entry.content when message.content is absent", async () => {
    const msgs = await loadMessagesFromLines([
      JSON.stringify({
        uuid: "uuid-010",
        sessionId: "sess-01",
        type: "user",
        timestamp: "2026-01-01T00:00:00Z",
        content: "direct content, no message wrapper",
      }),
    ]);
    expect(msgs[0].content).toEqual([{ type: "text", text: "direct content, no message wrapper" }]);
  });

  it("maps unknown subtypes to null", async () => {
    const msgs = await loadMessagesFromLines([
      JSON.stringify({
        uuid: "uuid-020",
        sessionId: "sess-01",
        type: "system",
        subtype: "nonexistent_weird_subtype",
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ]);
    expect(msgs[0].subtype).toBeNull();
  });

  it("maps compactMetadata and progress fields", async () => {
    const msgs = await loadMessagesFromLines([
      JSON.stringify({
        uuid: "uuid-030",
        sessionId: "sess-01",
        type: "system",
        subtype: "compact_boundary",
        timestamp: "2026-01-01T00:00:00Z",
        compactMetadata: { trigger: "auto", preTokens: 50000, postTokens: 30000 },
        data: { progress: 0.5 },
        toolUseID: "tool-abc",
        parentToolUseID: "tool-parent",
        operation: "enqueue",
        summary: "compacted",
        leafUuid: "leaf-001",
        hookCount: 2,
        isSidechain: true,
        preventedContinuation: true,
        costUSD: 0.05,
        durationMs: 3000,
        cwd: "/home/user/project",
      }),
    ]);
    const msg = msgs[0];
    expect(msg.compactMetadata).toEqual({ trigger: "auto", preTokens: 50000, postTokens: 30000 });
    expect(msg.progressData).toEqual({ progress: 0.5 });
    expect(msg.toolUseId).toBe("tool-abc");
    expect(msg.parentToolUseId).toBe("tool-parent");
    expect(msg.operation).toBe("enqueue");
    expect(msg.summary).toBe("compacted");
    expect(msg.leafUuid).toBe("leaf-001");
    expect(msg.hookCount).toBe(2);
    expect(msg.isSidechain).toBe(true);
    expect(msg.preventedContinuation).toBe(true);
    expect(msg.costUSD).toBe(0.05);
    expect(msg.durationMs).toBe(3000);
    expect(msg.cwd).toBe("/home/user/project");
  });
});
