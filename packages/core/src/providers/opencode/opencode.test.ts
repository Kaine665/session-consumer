import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { mapOpenCodeRow, loadMessages } from "./index.js";

// ═══ mapOpenCodeRow — pure function ═════════════════════════════════════════════

describe("OpenCode mapOpenCodeRow", () => {
  const dbPath = "/tmp/opencode.db";
  const sessId = "sess-001";

  it("maps role=assistant → type assistant", () => {
    const msg = mapOpenCodeRow({ role: "assistant", content: "ok" }, sessId, dbPath);
    expect(msg.type).toBe("assistant");
  });

  it("maps role=system → type system", () => {
    const msg = mapOpenCodeRow({ role: "system", content: "init" }, sessId, dbPath);
    expect(msg.type).toBe("system");
  });

  it("maps role=user → type user", () => {
    const msg = mapOpenCodeRow({ role: "user", content: "hello" }, sessId, dbPath);
    expect(msg.type).toBe("user");
  });

  it("falls back to type field when role absent", () => {
    const msg = mapOpenCodeRow({ type: "assistant", content: "hi" }, sessId, dbPath);
    expect(msg.type).toBe("assistant");
  });

  it("defaults to user when no role/type present", () => {
    const msg = mapOpenCodeRow({ content: "bare" }, sessId, dbPath);
    expect(msg.type).toBe("user");
  });

  it("wraps string content as text block", () => {
    const msg = mapOpenCodeRow({ role: "user", content: "plain string" }, sessId, dbPath);
    expect(msg.content).toEqual([{ type: "text", text: "plain string" }]);
  });

  it("handles null/undefined content → empty array", () => {
    const msg = mapOpenCodeRow({ role: "user" }, sessId, dbPath);
    expect(msg.content).toEqual([]);
  });

  it("uses row.id when present", () => {
    const msg = mapOpenCodeRow({ id: "oc-42", role: "user", content: "x" }, sessId, dbPath);
    expect(msg.id).toBe("oc-42");
  });

  it("generates fallback ID when row.id absent", () => {
    const msg = mapOpenCodeRow({ role: "user", content: "x" }, sessId, dbPath);
    expect(msg.id).toMatch(/^opencode-/);
  });

  it("uses parent_id from row", () => {
    const msg = mapOpenCodeRow({ id: "a", parent_id: "parent-1", role: "user", content: "x" }, sessId, dbPath);
    expect(msg.parentId).toBe("parent-1");
  });

  it("sets parentId to null when parent_id absent", () => {
    const msg = mapOpenCodeRow({ id: "a", role: "user", content: "x" }, sessId, dbPath);
    expect(msg.parentId).toBeNull();
  });

  it("uses created_at over timestamp", () => {
    const msg = mapOpenCodeRow({
      role: "user",
      content: "x",
      created_at: "2026-05-01T12:00:00Z",
      timestamp: "2026-04-01T10:00:00Z",
    }, sessId, dbPath);
    expect(msg.timestamp).toBe(new Date("2026-05-01T12:00:00Z").toISOString());
  });

  it("falls back to timestamp when created_at absent", () => {
    const msg = mapOpenCodeRow({
      role: "user",
      content: "x",
      timestamp: "2026-04-15T08:00:00Z",
    }, sessId, dbPath);
    expect(msg.timestamp).toBe(new Date("2026-04-15T08:00:00Z").toISOString());
  });

  it("extracts model from row.model", () => {
    const msg = mapOpenCodeRow({ role: "assistant", content: "x", model: "gpt-5" }, sessId, dbPath);
    expect(msg.model).toBe("gpt-5");
  });

  it("sets provider to opencode", () => {
    const msg = mapOpenCodeRow({ role: "user", content: "x" }, sessId, dbPath);
    expect(msg.provider).toBe("opencode");
  });
});

// ═══ loadMessages — integration ═════════════════════════════════════════════════

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-opencode-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("OpenCode loadMessages (integration)", () => {
  it("SQLite path: reads message table, maps via mapOpenCodeRow", async () => {
    const dbPath = path.join(tmpDir, "opencode.db");
    const db = new Database(dbPath);

    db.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        role TEXT,
        content TEXT,
        created_at TEXT,
        timestamp TEXT,
        parent_id TEXT,
        model TEXT
      )
    `);

    db.prepare(`INSERT INTO message (id, session_id, role, content, created_at, model, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("m-1", "sess-001", "user", "hello opencode", "2026-05-01T10:00:00Z", null, null);
    db.prepare(`INSERT INTO message (id, session_id, role, content, created_at, model, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("m-2", "sess-001", "assistant", "I can help", "2026-05-01T10:00:05Z", "gpt-5", "m-1");
    db.prepare(`INSERT INTO message (id, session_id, role, content, created_at, model, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("m-3", "sess-002", "user", "other session", "2026-05-01T11:00:00Z", null, null);
    db.close();

    const msgs = await loadMessages(dbPath, `${dbPath}:sess-001`);

    expect(msgs).toHaveLength(2); // Only sess-001 messages
    expect(msgs[0].id).toBe("m-1");
    expect(msgs[0].type).toBe("user");
    expect(msgs[0].content).toEqual([{ type: "text", text: "hello opencode" }]);
    expect(msgs[1].id).toBe("m-2");
    expect(msgs[1].type).toBe("assistant");
    expect(msgs[1].model).toBe("gpt-5");
    expect(msgs[1].parentId).toBe("m-1");
    expect(msgs[1].provider).toBe("opencode");
  });

  it("SQLite path: sessionId without ':' uses filePath as dbPath", async () => {
    const dbPath = path.join(tmpDir, "opencode2.db");
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE message (id TEXT, session_id TEXT, role TEXT, content TEXT, created_at TEXT)`);
    db.prepare(`INSERT INTO message (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run("m-1", "sess-001", "user", "direct", "2026-05-01T10:00:00Z");
    db.close();

    const msgs = await loadMessages(dbPath, "sess-001");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toEqual([{ type: "text", text: "direct" }]);
  });

  it("returns [] when filePath is not .db or .json", async () => {
    const msgs = await loadMessages("/tmp/nonexistent.txt", "sess-001");
    expect(msgs).toEqual([]);
  });
});
