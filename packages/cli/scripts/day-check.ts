import { SessionGateway } from "@sc/core";

const gw = new SessionGateway();
const { sessions, messages } = await gw.loadProjectData({ projectName: "project-pilot" });

const start = "2026-04-01";
const end = "2026-05-02";

const dayMap = new Map<string, { total: number; nonSub: number; chinese: number; subAgent: number }>();

for (const s of sessions) {
  const date = (s.firstMessageTime || s.lastModified || "").slice(0, 10);
  if (date < start || date >= end) continue;

  if (!dayMap.has(date)) {
    dayMap.set(date, { total: 0, nonSub: 0, chinese: 0, subAgent: 0 });
  }
  const d = dayMap.get(date)!;
  d.total++;

  if (s.isSubAgent) {
    d.subAgent++;
    continue;
  }
  d.nonSub++;

  const msgs = messages.filter((m) => m.sessionId === s.id && m.type === "user" && !m.isSidechain);
  for (const m of msgs) {
    const textBlock = m.content.find((c: any) => c.type === "text" && "text" in c);
    const text = (textBlock as any)?.text || "";
    if (/[一-鿿]/.test(text)) {
      d.chinese++;
      break;
    }
  }
}

console.log("Date       | Total | Non-sub | Chinese | Sub-agent");
console.log("-----------+-------+---------+---------+----------");
const sorted = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [date, d] of sorted) {
  console.log(`${date} | ${String(d.total).padStart(5)} | ${String(d.nonSub).padStart(7)} | ${String(d.chinese).padStart(7)} | ${String(d.subAgent).padStart(8)}`);
}

// Summary
let tTotal = 0, tNonSub = 0, tChinese = 0, tSub = 0;
for (const d of dayMap.values()) { tTotal += d.total; tNonSub += d.nonSub; tChinese += d.chinese; tSub += d.subAgent; }
console.log("-----------+-------+---------+---------+----------");
console.log(`TOTAL      | ${String(tTotal).padStart(5)} | ${String(tNonSub).padStart(7)} | ${String(tChinese).padStart(7)} | ${String(tSub).padStart(8)}`);
