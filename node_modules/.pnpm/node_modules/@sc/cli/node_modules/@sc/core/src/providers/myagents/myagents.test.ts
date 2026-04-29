import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseContent, normalizeMyAgentsBlock, MyAgentsProvider } from "./index.js";

// ═══ parseContent — pure function ═══════════════════════════════════════════════

describe("parseContent", () => {
  it("passes through plain strings that don't look like JSON", () => {
    expect(parseContent("你好")).toBe("你好");
    expect(parseContent("just some text")).toBe("just some text");
  });

  it("passes through non-string values unchanged", () => {
    expect(parseContent(42)).toBe(42);
    expect(parseContent(null)).toBe(null);
    expect(parseContent(undefined)).toBe(undefined);
    expect(parseContent([{ type: "text", text: "hi" }])).toEqual([{ type: "text", text: "hi" }]);
  });

  it("parses a JSON-stringified array into an array", () => {
    const input = JSON.stringify([
      { type: "text", text: "hello" },
    ]);
    const result = parseContent(input);
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[])[0]).toMatchObject({ type: "text", text: "hello" });
  });

  it("returns raw string when JSON.parse fails", () => {
    const input = "[not valid json at all";
    expect(parseContent(input)).toBe(input);
  });

  it("reshapes MyAgents-style tool_use blocks inside the array", () => {
    const input = JSON.stringify([
      {
        type: "tool_use",
        tool: { id: "call_01", name: "Bash", input: { command: "ls" } },
      },
    ]);
    const result = parseContent(input) as unknown[];
    expect(result[0]).toEqual({
      type: "tool_use",
      id: "call_01",
      name: "Bash",
      input: { command: "ls" },
    });
  });

  it("leaves thinking and text blocks unchanged while reshaping tool_use", () => {
    const input = JSON.stringify([
      { type: "thinking", thinking: "hmm" },
      { type: "text", text: "ok" },
      { type: "tool_use", tool: { id: "call_01", name: "Glob", input: {} } },
    ]);
    const result = parseContent(input) as unknown[];
    expect(result[0]).toEqual({ type: "thinking", thinking: "hmm" });
    expect(result[1]).toEqual({ type: "text", text: "ok" });
    expect(result[2]).toEqual({ type: "tool_use", id: "call_01", name: "Glob", input: {} });
  });
});

// ═══ normalizeMyAgentsBlock — pure function ══════════════════════════════════════

describe("normalizeMyAgentsBlock", () => {
  it("reshapes tool_use with nested tool object", () => {
    const block = {
      type: "tool_use",
      tool: { id: "call_01", name: "Bash", input: { command: "ls" } },
    };
    expect(normalizeMyAgentsBlock(block)).toEqual({
      type: "tool_use",
      id: "call_01",
      name: "Bash",
      input: { command: "ls" },
    });
  });

  it("passes through tool_use that is already in flat format", () => {
    const block = { type: "tool_use", id: "call_01", name: "Bash", input: {} };
    expect(normalizeMyAgentsBlock(block)).toEqual(block);
  });

  it("passes through non-tool_use blocks unchanged", () => {
    const thinking = { type: "thinking", thinking: "hmm" };
    const text = { type: "text", text: "hello" };
    expect(normalizeMyAgentsBlock(thinking)).toEqual(thinking);
    expect(normalizeMyAgentsBlock(text)).toEqual(text);
  });

  it("passes through non-object values", () => {
    expect(normalizeMyAgentsBlock("hello")).toBe("hello");
    expect(normalizeMyAgentsBlock(42)).toBe(42);
    expect(normalizeMyAgentsBlock(null)).toBe(null);
  });
});

// ═══ loadMessages — integration ═════════════════════════════════════════════════

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-myagents-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadMessagesFromLines(lines: string[]): Promise<ReturnType<typeof MyAgentsProvider.loadMessages>> {
  const filePath = path.join(tmpDir, "test-session.jsonl");
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  return MyAgentsProvider.loadMessages(filePath, "test-session");
}

describe("MyAgents loadMessages (integration)", () => {
  it("full pipeline: user msg → assistant with double-serialized content + role + usage + model + tool_result merge", async () => {
    const msgs = await loadMessagesFromLines([
      // user message: plain string content
      JSON.stringify({ id: "0", role: "user", content: "帮我搜索", timestamp: "2026-01-01T00:00:01Z" }),
      // assistant message: JSON-stringified content array with thinking + text + tool_use
      JSON.stringify({
        id: "1",
        role: "assistant",
        content: JSON.stringify([
          { type: "thinking", thinking: "用户要我搜索，我来搜一下。" },
          { type: "text", text: "好的，我来搜索。" },
          {
            type: "tool_use",
            tool: { id: "call_01", name: "WebSearch", input: { query: "something" } },
          },
          { type: "thinking", thinking: "搜索完成，总结一下。" },
          { type: "text", text: "搜索找到了这些结果。" },
        ]),
        timestamp: "2026-01-01T00:00:02Z",
        usage: { inputTokens: 200, outputTokens: 80, model: "MiniMax-M2.7" },
        durationMs: 5000,
      }),
      // tool_result as a separate message
      JSON.stringify({
        id: "2",
        role: "user",
        content: JSON.stringify([
          { type: "tool_result", tool_use_id: "call_01", content: "result here" },
        ]),
        timestamp: "2026-01-01T00:00:03Z",
      }),
    ]);

    // user message
    const user = msgs.find((m) => m.type === "user" && m.id === "0");
    expect(user).toBeDefined();
    expect(user!.content).toEqual([{ type: "text", text: "帮我搜索" }]);

    // assistant message
    const assistant = msgs.find((m) => m.type === "assistant")!;
    expect(assistant.id).toBe("1");
    expect(assistant.content).toHaveLength(6); // 2 thinking + 2 text + 1 tool_use + 1 tool_result (merged)
    expect(assistant.content[0]).toEqual({ type: "thinking", thinking: "用户要我搜索，我来搜一下。" });
    expect(assistant.content[1]).toEqual({ type: "text", text: "好的，我来搜索。" });
    expect(assistant.content[2]).toMatchObject({ type: "tool_use", name: "WebSearch" });
    expect(assistant.content[3]).toEqual({ type: "thinking", thinking: "搜索完成，总结一下。" });
    expect(assistant.content[4]).toEqual({ type: "text", text: "搜索找到了这些结果。" });
    expect(assistant.content[5]).toMatchObject({ type: "tool_result", tool_use_id: "call_01" });

    expect(assistant.toolUses).toHaveLength(1);
    expect(assistant.toolUses[0]).toMatchObject({
      name: "WebSearch",
      toolUseId: "call_01",
      input: { query: "something" },
    });

    expect(assistant.usage).toEqual({ inputTokens: 200, outputTokens: 80 });
    expect(assistant.model).toBe("MiniMax-M2.7");
    expect(assistant.durationMs).toBe(5000);
    expect(assistant.provider).toBe("myagents");
  });

  it("defaults unknown role to user and missing model to null", async () => {
    const msgs = await loadMessagesFromLines([
      JSON.stringify({ id: "0", role: "bot", content: "hello", timestamp: "2026-01-01T00:00:00Z" }),
    ]);
    expect(msgs[0].type).toBe("user");
    expect(msgs[0].model).toBeNull();
  });
});
