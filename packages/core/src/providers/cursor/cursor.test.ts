import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { mapCursorMessage, loadMessages } from "./index.js";

// ═══ mapCursorMessage — pure function ═══════════════════════════════════════════

describe("Cursor mapCursorMessage", () => {
  const dbPath = "/tmp/test.db";
  const convId = "conv-001";

  it("maps role=user → type user", () => {
    const msg = mapCursorMessage({ role: "user", content: "hello" }, convId, dbPath);
    expect(msg.type).toBe("user");
  });

  it("maps role=assistant → type assistant", () => {
    const msg = mapCursorMessage({ role: "assistant", content: "ok" }, convId, dbPath);
    expect(msg.type).toBe("assistant");
  });

  it("maps role=system → type system", () => {
    const msg = mapCursorMessage({ role: "system", content: "init" }, convId, dbPath);
    expect(msg.type).toBe("system");
  });

  it("falls back to type field when role absent", () => {
    const msg = mapCursorMessage({ type: "assistant", content: "hi" }, convId, dbPath);
    expect(msg.type).toBe("assistant");
  });

  it("defaults to user when neither role nor type present", () => {
    const msg = mapCursorMessage({ content: "bare" }, convId, dbPath);
    expect(msg.type).toBe("user");
  });

  it("normalizes string content to text block", () => {
    const msg = mapCursorMessage({ role: "user", content: "plain text" }, convId, dbPath);
    expect(msg.content).toEqual([{ type: "text", text: "plain text" }]);
  });

  it("passes through array content blocks", () => {
    const msg = mapCursorMessage({
      role: "assistant",
      content: [{ type: "text", text: "part 1" }, { type: "text", text: "part 2" }],
    }, convId, dbPath);
    expect(msg.content).toEqual([
      { type: "text", text: "part 1" },
      { type: "text", text: "part 2" },
    ]);
  });

  it("handles null/undefined content gracefully", () => {
    const msg = mapCursorMessage({ role: "user" }, convId, dbPath);
    expect(msg.content).toEqual([]);
  });

  it("uses row.id when present", () => {
    const msg = mapCursorMessage({ id: "msg-42", role: "user", content: "x" }, convId, dbPath);
    expect(msg.id).toBe("msg-42");
  });

  it("generates fallback ID when row.id is absent", () => {
    const msg = mapCursorMessage({ role: "user", content: "x" }, convId, dbPath);
    expect(msg.id).toMatch(/^cursor-/);
  });

  it("uses row.timestamp over row.created_at", () => {
    const msg = mapCursorMessage({
      role: "user",
      content: "x",
      timestamp: "2026-04-01T10:00:00Z",
      created_at: "2026-03-01T10:00:00Z",
    }, convId, dbPath);
    expect(msg.timestamp).toBe(new Date("2026-04-01T10:00:00Z").toISOString());
  });

  it("falls back to created_at when timestamp absent", () => {
    const msg = mapCursorMessage({
      role: "user",
      content: "x",
      created_at: "2026-03-15T12:00:00Z",
    }, convId, dbPath);
    expect(msg.timestamp).toBe(new Date("2026-03-15T12:00:00Z").toISOString());
  });

  it("extracts model from row.model", () => {
    const msg = mapCursorMessage({ role: "assistant", content: "x", model: "gpt-5" }, convId, dbPath);
    expect(msg.model).toBe("gpt-5");
  });

  it("sets model to null when absent", () => {
    const msg = mapCursorMessage({ role: "user", content: "x" }, convId, dbPath);
    expect(msg.model).toBeNull();
  });

  it("sets provider to cursor", () => {
    const msg = mapCursorMessage({ role: "user", content: "x" }, convId, dbPath);
    expect(msg.provider).toBe("cursor");
  });

  it("sets sessionId from convId parameter", () => {
    const msg = mapCursorMessage({ role: "user", content: "x" }, "my-conv", dbPath);
    expect(msg.sessionId).toBe("my-conv");
  });

  it("sets sourceFile from dbPath parameter", () => {
    const msg = mapCursorMessage({ role: "user", content: "x" }, convId, "/path/to/chat.db");
    expect(msg.sourceFile).toBe("/path/to/chat.db");
  });
});

// ═══ loadMessages — integration with SQLite ═════════════════════════════════════

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-test-cursor-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createDb(name: string, tableName: string): { dbPath: string; db: Database.Database } {
  const dbPath = path.join(tmpDir, name);
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      chat_id TEXT,
      role TEXT,
      content TEXT,
      timestamp TEXT,
      created_at TEXT,
      model TEXT
    )
  `);
  return { dbPath, db };
}

describe("Cursor loadMessages (integration)", () => {
  it("full pipeline: reads SQLite rows, maps via mapCursorMessage", async () => {
    const { dbPath, db } = createDb("chat.db", "messages");

    db.prepare(`INSERT INTO messages (id, conversation_id, role, content, timestamp, model) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("msg-1", "conv-001", "user", "hello world", "2026-04-01T10:00:00Z", null);
    db.prepare(`INSERT INTO messages (id, conversation_id, role, content, timestamp, model) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("msg-2", "conv-001", "assistant", "I can help", "2026-04-01T10:00:05Z", "claude-sonnet-4-6");
    db.prepare(`INSERT INTO messages (id, conversation_id, role, content, timestamp, model) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("msg-3", "conv-002", "user", "other conversation", "2026-04-01T11:00:00Z", null);
    db.close();

    const msgs = await loadMessages(dbPath, `${dbPath}:conv-001`);

    expect(msgs).toHaveLength(2); // Only conv-001 messages
    expect(msgs[0].id).toBe("msg-1");
    expect(msgs[0].type).toBe("user");
    expect(msgs[0].content).toEqual([{ type: "text", text: "hello world" }]);
    expect(msgs[1].id).toBe("msg-2");
    expect(msgs[1].type).toBe("assistant");
    expect(msgs[1].model).toBe("claude-sonnet-4-6");
    expect(msgs[1].provider).toBe("cursor");
  });

  it("sessionId without ':' uses filePath as dbPath", async () => {
    const { dbPath, db } = createDb("chat2.db", "messages");

    db.prepare(`INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)`)
      .run("conv-001", "user", "direct", "2026-04-01T10:00:00Z");
    db.close();

    // sessionId without ':' — filePath becomes the dbPath
    const msgs = await loadMessages(dbPath, "conv-001");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toEqual([{ type: "text", text: "direct" }]);
  });

  it("detects 'message' table when 'messages' absent", async () => {
    const { dbPath, db } = createDb("workspace.db", "message");

    db.prepare(`INSERT INTO message (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)`)
      .run("conv-001", "user", "from message table", "2026-04-01T10:00:00Z");
    db.close();

    const msgs = await loadMessages(dbPath, `${dbPath}:conv-001`);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toEqual([{ type: "text", text: "from message table" }]);
  });

  it("returns [] when no message table exists", async () => {
    const dbPath = path.join(tmpDir, "empty.db");
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE conversations (id TEXT, title TEXT)`);
    db.close();

    const msgs = await loadMessages(dbPath, `${dbPath}:conv-001`);
    expect(msgs).toEqual([]);
  });

  it("opens existing database in readonly mode successfully", async () => {
    const { dbPath, db } = createDb("chat-rw.db", "messages");
    db.prepare(`INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`)
      .run("rw-1", "conv-001", "user", "readonly test", "2026-04-01T10:00:00Z");
    db.close();

    // loadMessages reopens with { readonly: true }
    const msgs = await loadMessages(dbPath, `${dbPath}:conv-001`);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe("rw-1");
  });

  it("uses created_at fallback for timestamp", async () => {
    const { dbPath, db } = createDb("chat3.db", "messages");

    db.prepare(`INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run("msg-ts", "conv-001", "user", "with created_at", "2026-04-15T08:00:00Z");
    db.close();

    const msgs = await loadMessages(dbPath, `${dbPath}:conv-001`);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].timestamp).toBe(new Date("2026-04-15T08:00:00Z").toISOString());
  });

  it("falls back to rowid ordering when FK columns missing", async () => {
    const { dbPath, db } = createDb("chat4.db", "messages");

    // Create table without conversation_id/chat_id columns
    db.exec(`DROP TABLE messages`);
    db.exec(`CREATE TABLE messages (id TEXT, role TEXT, content TEXT, timestamp TEXT)`);
    db.prepare(`INSERT INTO messages (id, role, content, timestamp) VALUES (?, ?, ?, ?)`)
      .run("a", "user", "first", "2026-04-01T10:00:00Z");
    db.prepare(`INSERT INTO messages (id, role, content, timestamp) VALUES (?, ?, ?, ?)`)
      .run("b", "assistant", "second", "2026-04-01T10:00:05Z");
    db.close();

    // The FK query will fail (no conversation_id column), fallback to rowid ordering
    const msgs = await loadMessages(dbPath, `${dbPath}:conv-001`);
    expect(msgs).toHaveLength(2);
  });
});
