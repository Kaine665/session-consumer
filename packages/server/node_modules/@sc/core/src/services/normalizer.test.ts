import { describe, expect, it } from "vitest";
import { normalizeContent, normalizeTs, normalizeType, extractToolUses, mergeToolResults, extractText } from "./normalizer.js";
import { createMessage, type Message, type ContentBlock } from "../domain/message.js";

// ─── normalizeContent ─────────────────────────────────────────────────────────

describe("normalizeContent", () => {
  it("wraps a plain string as a text block", () => {
    const result = normalizeContent("你好");
    expect(result).toEqual([{ type: "text", text: "你好" }]);
  });

  it("returns empty array for falsy input", () => {
    expect(normalizeContent(null)).toEqual([]);
    expect(normalizeContent("")).toEqual([]);
    expect(normalizeContent(undefined)).toEqual([]);
  });

  it("parses a block array with text, thinking, and tool_use", () => {
    const input = [
      { type: "thinking", thinking: "hmm let me think..." },
      { type: "text", text: "here is the answer" },
      {
        type: "tool_use",
        id: "call_01",
        name: "Bash",
        input: { command: "ls" },
      },
    ];

    const result = normalizeContent(input);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "thinking", thinking: "hmm let me think..." });
    expect(result[1]).toEqual({ type: "text", text: "here is the answer" });
    expect(result[2]).toEqual({ type: "tool_use", id: "call_01", name: "Bash", input: { command: "ls" } });
  });

  it("falls back to text block for unknown types", () => {
    const input = [{ type: "weird_custom_type", value: 42 }];
    const result = normalizeContent(input);
    expect(result[0]).toEqual({ type: "text", text: JSON.stringify(input[0]) });
  });
});

// ─── normalizeTs ──────────────────────────────────────────────────────────────

describe("normalizeTs", () => {
  it("converts an ISO string to ISO string", () => {
    const result = normalizeTs("2026-04-16T02:03:51.895Z");
    expect(result).toBe("2026-04-16T02:03:51.895Z");
  });

  it("returns current time for falsy input", () => {
    const before = new Date().toISOString();
    const result = normalizeTs(null);
    const after = new Date().toISOString();
    expect(result >= before).toBe(true);
    expect(result <= after).toBe(true);
  });
});

// ─── normalizeType ────────────────────────────────────────────────────────────

describe("normalizeType", () => {
  it("passes through valid message types", () => {
    expect(normalizeType("user")).toBe("user");
    expect(normalizeType("assistant")).toBe("assistant");
    expect(normalizeType("system")).toBe("system");
  });

  it("defaults unknown types to system", () => {
    expect(normalizeType("bot")).toBe("system");
    expect(normalizeType("")).toBe("system");
  });
});

// ─── extractToolUses ──────────────────────────────────────────────────────────

describe("extractToolUses", () => {
  it("extracts tool_use blocks from content, leaving text and thinking", () => {
    const content: ContentBlock[] = [
      { type: "thinking", thinking: "need to run a command" },
      { type: "text", text: "let me check" },
      {
        type: "tool_use",
        id: "call_01",
        name: "Glob",
        input: { pattern: "*.ts" },
      },
      { type: "text", text: "done" },
    ];

    const result = extractToolUses(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Glob",
      input: { pattern: "*.ts" },
      toolUseId: "call_01",
    });
  });

  it("returns empty array when no tool_use blocks present", () => {
    const content: ContentBlock[] = [
      { type: "text", text: "hello" },
      { type: "thinking", thinking: "just thinking" },
    ];
    expect(extractToolUses(content)).toEqual([]);
  });
});

// ─── mergeToolResults ─────────────────────────────────────────────────────────

describe("mergeToolResults", () => {
  it("attaches tool_result to the preceding assistant message with matching tool_use", () => {
    const msgs: Message[] = [
      createMessage({
        id: "0",
        sessionId: "s1",
        sourceFile: "f",
        provider: "myagents",
        type: "user",
        timestamp: "2026-01-01T00:00:00Z",
        content: [{ type: "text", text: "run ls" }],
      }),
      createMessage({
        id: "1",
        sessionId: "s1",
        sourceFile: "f",
        provider: "myagents",
        type: "assistant",
        timestamp: "2026-01-01T00:00:01Z",
        content: [
          {
            type: "tool_use",
            id: "call_01",
            name: "Bash",
            input: { command: "ls" },
          },
        ],
        toolUses: [
          {
            name: "Bash",
            input: { command: "ls" },
            toolUseId: "call_01",
          },
        ],
      }),
      createMessage({
        id: "2",
        sessionId: "s1",
        sourceFile: "f",
        provider: "myagents",
        type: "user", // tool_result stored as user message in some providers
        timestamp: "2026-01-01T00:00:02Z",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_01",
            content: "file1.ts\nfile2.ts",
          },
        ],
      }),
    ];

    const merged = mergeToolResults(msgs);

    // The tool_result should be attached to the assistant message
    const assistant = merged.find((m) => m.type === "assistant")!;
    expect(assistant.content).toHaveLength(2); // tool_use + tool_result
    expect(assistant.content[1]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call_01",
    });
  });

  it("keeps non-tool_result content of tool_result messages", () => {
    const msgs: Message[] = [
      createMessage({
        id: "0",
        sessionId: "s1",
        sourceFile: "f",
        provider: "myagents",
        type: "assistant",
        timestamp: "2026-01-01T00:00:00Z",
        content: [
          {
            type: "tool_use",
            id: "call_01",
            name: "Bash",
            input: { command: "ls" },
          },
        ],
        toolUses: [
          {
            name: "Bash",
            input: { command: "ls" },
            toolUseId: "call_01",
          },
        ],
      }),
      createMessage({
        id: "1",
        sessionId: "s1",
        sourceFile: "f",
        provider: "myagents",
        type: "user",
        timestamp: "2026-01-01T00:00:01Z",
        content: [
          { type: "text", text: "intermediate user message" },
          {
            type: "tool_result",
            tool_use_id: "call_01",
            content: "output here",
          },
        ],
      }),
    ];

    const merged = mergeToolResults(msgs);

    // The user message with text + tool_result: text should survive as its own message
    const userMsg = merged.find(
      (m): m is Message & { type: "user" } => m.type === "user"
    );
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toHaveLength(1);
    expect(userMsg!.content[0]).toEqual({ type: "text", text: "intermediate user message" });
  });
});

// ─── extractText ──────────────────────────────────────────────────────────────

describe("extractText", () => {
  it("joins text from text blocks only", () => {
    const content: ContentBlock[] = [
      { type: "text", text: "hello" },
      { type: "thinking", thinking: "private thought" },
      { type: "text", text: "world" },
    ];
    expect(extractText(content)).toBe("hello world");
  });
});
