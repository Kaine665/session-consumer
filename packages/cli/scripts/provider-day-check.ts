import { SessionGateway } from "@sc/core";

const gw = new SessionGateway();
const { sessions, messages } = await gw.loadProjectData({ projectName: "project-pilot" });

const start = "2026-04-01";
const end = "2026-05-02";

const dayMap = new Map<string, { claude: number; cursor: number; codex: number; subAgent: number; chinese: number }>();

for (const s of sessions) {
  const date = (s.firstMessageTime || s.lastModified || "").slice(0, 10);
  if (date < start || date >= end) continue;

  if (!dayMap.has(date)) {
    dayMap.set(date, { claude: 0, cursor: 0, codex: 0, subAgent: 0, chinese: 0 });
  }
  const d = dayMap.get(date)!;

  if (s.isSubAgent) { d.subAgent++; continue; }
  
  if (s.provider === "claude-code") d.claude++;
  else if (s.provider === "cursor") d.cursor++;
  else if (s.provider === "codex") d.codex++;

  const msgs = messages.filter((m) => m.sessionId === s.id && m.type === "user" && !m.isSidechain);
  for (const m of msgs) {
    const textBlock = m.content.find((c: any) => c.type === "text" && "text" in c);
    const text = (textBlock as any)?.text || "";
    if (/[一-鿿]/.test(text)) { d.chinese++; break; }
  }
}

console.log("Date       | Claude | Cursor | Codex | SubAg | Chinese");
console.log("-----------+--------+--------+-------+-------+--------");
const sorted = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [date, d] of sorted) {
  if (d.claude + d.cursor + d.codex + d.subAgent === 0) continue;
  console.log(`${date} | ${String(d.claude).padStart(6)} | ${String(d.cursor).padStart(6)} | ${String(d.codex).padStart(5)} | ${String(d.subAgent).padStart(5)} | ${String(d.chinese).padStart(6)}`);
}

let tC = 0, tCu = 0, tCo = 0, tS = 0, tCh = 0;
for (const d of dayMap.values()) { tC += d.claude; tCu += d.cursor; tCo += d.codex; tS += d.subAgent; tCh += d.chinese; }
console.log("-----------+--------+--------+-------+-------+--------");
console.log(`TOTAL      | ${String(tC).padStart(6)} | ${String(tCu).padStart(6)} | ${String(tCo).padStart(5)} | ${String(tS).padStart(5)} | ${String(tCh).padStart(6)}`);
