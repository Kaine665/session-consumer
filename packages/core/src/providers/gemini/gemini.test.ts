import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { mapType, extractUsage, loadMessages } from "./index.js";

// ═══ mapType — pure function ═══════════════════════════════════════════════════

describe("Gemini mapType", () => {
  it("maps user → user", () => {
    expect(mapType("user")).toBe("user");
  });

  it("maps assistant → assistant", () => {
    expect(mapType("assistant")).toBe("assistant");
  });

  it("maps model → assistant (Gemini quirk)", () => {
    expect(mapType("model")).toBe("assistant");
  });

  it("maps system → system", () => {
    expect(mapType("system")).toBe("system");
  });

  it("maps unknown to system", () => {
    expect(mapType("nonexistent")).toBe("system");
  });
});

// ═══ extractUsage — pure function ═══════════════════════════════════════════════

describe("Gemini extractUsage", () => {
  it("extracts from entry.message.usage (primary path)", () => {
    const entry = {
      message: {
        usage: { input_tokens: 400, output_tokens: 150 },
      },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 400,
      outputTokens: 150,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
      serviceTier: undefined,
    });
  });

  it("falls back to entry.usage", () => {
    const entry = {
      usage: { input_tokens: 200, output_tokens: 80 },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 200,
      outputTokens: 80,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: undefined,
      serviceTier: undefined,
    });
  });

  it("returns null when no usage anywhere", () => {
    expect(extractUsage({})).toBeNull();
    expect(extractUsage({ message: {} })).toBeNull();
  });

  it("extracts cache and service_tier fields", () => {
    const entry = {
      message: {
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          service_tier: "premium",
        },
      },
    };
    expect(extractUsage(entry)).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 20,
      cacheReadInputTokens: 30,
      serviceTier: "premium",
    });
  });
});

// ═══ loadMessages — integration ═════════════════════════════════════════════════

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-gemini-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadMessagesFromLines(lines: string[]): Promise<ReturnType<typeof loadMessages>> {
  const filePath = path.join(tmpDir, "gemini-session.jsonl");
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  return loadMessages(filePath, "gemini-sess-01");
}

describe("Gemini loadMessages (integration)", () => {
  it("full pipeline: role via entry.type, content nesting in message, usage, tool_result merge", async () => {
    const msgs = await loadMessagesFromLines([
      // user message: content nested inside message
      JSON.stringify({
        uuid: "g-001",
        type: "user",
        timestamp: "2026-05-01T10:00:00Z",
        message: { role: "user", content: "what is 2+2" },
      }),
      // assistant with text, using model role (Gemini quirk)
      JSON.stringify({
        uuid: "g-002",
        parentUuid: "g-001",
        type: "model",
        timestamp: "2026-05-01T10:00:05Z",
        message: {
          role: "model",
          content: [{ type: "text", text: "the answer is 4" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
        model: "gemini-pro",
      }),
      // assistant with tool_use
      JSON.stringify({
        uuid: "g-003",
        parentUuid: "g-002",
        type: "model",
        timestamp: "2026-05-01T10:00:08Z",
        message: {
          role: "model",
          content: [{
            type: "tool_use",
            id: "tool-01",
            name: "Bash",
            input: { command: "echo hello" },
          }],
        },
      }),
      // tool_result as separate user message
      JSON.stringify({
        uuid: "g-004",
        parentUuid: "g-003",
        type: "user",
        timestamp: "2026-05-01T10:00:10Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tool-01", content: "hello" }],
        },
      }),
    ]);

    const user = msgs.find((m) => m.id === "g-001")!;
    expect(user.type).toBe("user");
    expect(user.content).toEqual([{ type: "text", text: "what is 2+2" }]);

    const asst1 = msgs.find((m) => m.id === "g-002")!;
    expect(asst1.type).toBe("assistant");
    expect(asst1.content).toEqual([{ type: "text", text: "the answer is 4" }]);
    expect(asst1.model).toBe("gemini-pro");
    expect(asst1.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    const asst2 = msgs.find((m) => m.id === "g-003")!;
    expect(asst2.content).toHaveLength(2); // tool_use + merged tool_result
    expect(asst2.content[0]).toMatchObject({ type: "tool_use", name: "Bash" });
    expect(asst2.content[1]).toMatchObject({ type: "tool_result", tool_use_id: "tool-01" });
    expect(asst2.toolUses[0]).toMatchObject({
      name: "Bash",
      toolUseId: "tool-01",
      input: { command: "echo hello" },
    });
  });

  it("falls back to entry.role when entry.type absent", async () => {
    const msgs = await loadMessagesFromLines([
      JSON.stringify({
        uuid: "g-010",
        role: "user",
        timestamp: "2026-05-01T10:00:00Z",
        content: "direct content, no message wrapper",
      }),
    ]);
    expect(msgs[0].type).toBe("user");
    expect(msgs[0].content).toEqual([{ type: "text", text: "direct content, no message wrapper" }]);
  });

  it("uses sessionId parameter when entry.sessionId absent", async () => {
    const msgs = await loadMessagesFromLines([
      JSON.stringify({
        uuid: "g-020",
        type: "user",
        timestamp: "2026-05-01T10:00:00Z",
        content: "no session id in entry",
      }),
    ]);
    expect(msgs[0].sessionId).toBe("gemini-sess-01");
  });
});
