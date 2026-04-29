import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { mapRole, extractUsage, safeJsonParse, loadMessages } from "./loader.js";

// ═══ mapRole — pure function ═══════════════════════════════════════════════════

describe("Codex mapRole", () => {
  it("maps user → user", () => {
    expect(mapRole("user")).toBe("user");
  });

  it("maps assistant → assistant", () => {
    expect(mapRole("assistant")).toBe("assistant");
  });

  it("maps system → system", () => {
    expect(mapRole("system")).toBe("system");
  });

  it("maps tool_call → assistant", () => {
    expect(mapRole("tool_call")).toBe("assistant");
  });

  it("maps tool_use → assistant", () => {
    expect(mapRole("tool_use")).toBe("assistant");
  });

  it("maps tool_result → user (for later merging)", () => {
    expect(mapRole("tool_result")).toBe("user");
  });

  it("maps tool → user", () => {
    expect(mapRole("tool")).toBe("user");
  });

  it("maps unknown roles to system", () => {
    expect(mapRole("nonexistent")).toBe("system");
  });
});

// ═══ extractUsage — pure function ═══════════════════════════════════════════════

describe("Codex extractUsage", () => {
  it("extracts from response.usage (primary path)", () => {
    const entry = {
      response: {
        usage: {
          input_tokens: 500,
          output_tokens: 200,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 50,
          service_tier: "standard",
        },
      },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 500,
      outputTokens: 200,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 50,
      serviceTier: "standard",
    });
  });

  it("falls back to entry.usage when response.usage absent", () => {
    const entry = {
      usage: { input_tokens: 100, output_tokens: 30 },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 100,
      outputTokens: 30,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
      serviceTier: undefined,
    });
  });

  it("falls back to entry.token_usage", () => {
    const entry = {
      token_usage: { input_tokens: 300, output_tokens: 150 },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 300,
      outputTokens: 150,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
      serviceTier: undefined,
    });
  });

  it("uses prompt_tokens/completion_tokens as aliases for input/output", () => {
    const entry = {
      usage: { prompt_tokens: 80, completion_tokens: 40 },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 80,
      outputTokens: 40,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
      serviceTier: undefined,
    });
  });

  it("uses cached_tokens as alias for cacheReadInputTokens", () => {
    const entry = {
      response: { usage: { input_tokens: 10, output_tokens: 5, cached_tokens: 3 } },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: 3,
      serviceTier: undefined,
    });
  });

  it("returns null when no usage present", () => {
    expect(extractUsage({})).toBeNull();
    expect(extractUsage({ response: {} })).toBeNull();
  });

  it("input_tokens takes priority over prompt_tokens when both present", () => {
    const entry = {
      usage: { input_tokens: 100, prompt_tokens: 200 },
    };
    expect(extractUsage(entry)!.inputTokens).toBe(100);
  });
});

// ═══ safeJsonParse — pure function ══════════════════════════════════════════════

describe("Codex safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"key":"value"}')).toEqual({ key: "value" });
  });

  it("parses nested JSON", () => {
    expect(safeJsonParse('{"a":{"b":[1,2,3]}}')).toEqual({ a: { b: [1, 2, 3] } });
  });

  it("returns {} for invalid JSON", () => {
    expect(safeJsonParse("not json")).toEqual({});
  });

  it("returns {} for empty string", () => {
    expect(safeJsonParse("")).toEqual({});
  });
});

// ═══ loadMessages — integration ═════════════════════════════════════════════════

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-codex-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadMessagesFromLines(lines: string[]): Promise<ReturnType<typeof loadMessages>> {
  const filePath = path.join(tmpDir, "codex-session.jsonl");
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  return loadMessages(filePath, "codex-sess-01");
}

describe("Codex loadMessages (integration)", () => {
  it("full pipeline: role mapping, OpenAI tool_calls, tool_result merge, usage & model extraction", async () => {
    const msgs = await loadMessagesFromLines([
      // user message with role field
      JSON.stringify({
        uuid: "cx-001",
        role: "user",
        session_id: "codex-sess-01",
        timestamp: "2026-04-01T10:00:00Z",
        content: [{ type: "text", text: "write a python script" }],
      }),
      // assistant with text response + model + usage in response.usage
      JSON.stringify({
        uuid: "cx-002",
        parent_uuid: "cx-001",
        role: "assistant",
        session_id: "codex-sess-01",
        timestamp: "2026-04-01T10:00:05Z",
        model: "gpt-5",
        content: [{ type: "text", text: "here's the script:" }],
        response: {
          usage: { input_tokens: 200, output_tokens: 100, cached_tokens: 50 },
        },
        stop_reason: "end_turn",
        cost_usd: 0.01,
        duration_ms: 1200,
        cwd: "/home/user/project",
      }),
      // assistant with tool_calls (OpenAI format: function.name + function.arguments as JSON string)
      JSON.stringify({
        uuid: "cx-003",
        parent_uuid: "cx-002",
        role: "assistant",
        timestamp: "2026-04-01T10:00:08Z",
        content: [{ type: "text", text: "let me run that" }],
        tool_calls: [
          {
            id: "call_abc",
            function: {
              name: "execute_command",
              arguments: '{"command":"python script.py","requires_approval":false}',
            },
          },
        ],
        response: {
          usage: { input_tokens: 350, output_tokens: 80 },
        },
      }),
      // tool_result as separate message (role="tool_result")
      JSON.stringify({
        uuid: "cx-004",
        parent_uuid: "cx-003",
        role: "tool_result",
        timestamp: "2026-04-01T10:00:10Z",
        content: "Script executed successfully. Output: hello world",
        tool_use_id: "call_abc",
      }),
      // system message
      JSON.stringify({
        uuid: "cx-005",
        role: "system",
        timestamp: "2026-04-01T10:00:00Z",
        content: [{ type: "text", text: "session initialized" }],
      }),
    ]);

    // ── user message
    const user = msgs.find((m) => m.id === "cx-001")!;
    expect(user.type).toBe("user");
    expect(user.content).toEqual([{ type: "text", text: "write a python script" }]);
    expect(user.provider).toBe("codex");

    // ── assistant with text
    const asst1 = msgs.find((m) => m.id === "cx-002")!;
    expect(asst1.type).toBe("assistant");
    expect(asst1.content).toEqual([{ type: "text", text: "here's the script:" }]);
    expect(asst1.model).toBe("gpt-5");
    expect(asst1.usage).toEqual({
      inputTokens: 200,
      outputTokens: 100,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: 50,
      serviceTier: undefined,
    });
    expect(asst1.stopReason).toBe("end_turn");
    expect(asst1.costUSD).toBe(0.01);
    expect(asst1.durationMs).toBe(1200);
    expect(asst1.cwd).toBe("/home/user/project");

    // ── assistant with tool_calls (OpenAI format parsed into toolUses)
    const asst2 = msgs.find((m) => m.id === "cx-003")!;
    expect(asst2.toolUses).toHaveLength(1);
    expect(asst2.toolUses[0]).toMatchObject({
      name: "execute_command",
      toolUseId: "call_abc",
      input: { command: "python script.py", requires_approval: false },
    });
    // tool_result should be merged into this assistant message
    expect(asst2.content).toHaveLength(2); // text + tool_result
    expect(asst2.content[1]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call_abc",
    });

    // ── system message
    const sys = msgs.find((m) => m.id === "cx-005")!;
    expect(sys.type).toBe("system");
    expect(sys.content).toEqual([{ type: "text", text: "session initialized" }]);
  });

  it("handles tool_calls with missing function.arguments gracefully", async () => {
    const msgs = await loadMessagesFromLines([
      JSON.stringify({
        uuid: "cx-010",
        role: "assistant",
        timestamp: "2026-04-01T10:00:00Z",
        content: [],
        tool_calls: [
          {
            id: "call_simple",
            name: "read_file",
            input: { filePath: "/tmp/test.txt" },
          },
        ],
      }),
    ]);
    expect(msgs[0].toolUses[0]).toMatchObject({
      name: "read_file",
      toolUseId: "call_simple",
      input: { filePath: "/tmp/test.txt" },
    });
  });

  it("falls back to id and sessionId for uuid/session_id alternatives", async () => {
    const msgs = await loadMessagesFromLines([
      JSON.stringify({
        id: "alt-id",
        role: "user",
        sessionId: "alt-session",
        created_at: "2026-04-01T10:00:00Z",
        content: "hello",
      }),
    ]);
    expect(msgs[0].id).toBe("alt-id");
    expect(msgs[0].sessionId).toBe("alt-session");
    expect(msgs[0].timestamp).toBe(new Date("2026-04-01T10:00:00Z").toISOString());
  });
});
