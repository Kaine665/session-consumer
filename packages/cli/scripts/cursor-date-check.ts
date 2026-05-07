import { SessionGateway } from "@sc/core";

const gw = new SessionGateway();
const { sessions } = await gw.loadProjectData({ projectName: "project-pilot" });

// Check Cursor sessions - what dates do they have?
const cursorSessions = sessions.filter((s) => s.provider === "cursor");
console.log(`Total Cursor sessions: ${cursorSessions.length}\n`);

// Show date distribution
const dateMap = new Map<string, number>();
for (const s of cursorSessions) {
  // Check multiple date sources
  const msgDate = s.firstMessageTime?.slice(0, 10) || "";
  const modDate = s.lastModified?.slice(0, 10) || "";
  const key = msgDate || modDate || "(none)";
  dateMap.set(key, (dateMap.get(key) || 0) + 1);
}

console.log("Date       | Count | Source");
console.log("-----------+-------+-------");
const sorted = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
let total = 0;
for (const [date, n] of sorted) {
  if (n >= 2 || date === "(none)") {
    console.log(`${date} | ${String(n).padStart(5)} |`);
  }
  total += n;
}

// Show sample: first 5 cursor sessions with their dates
console.log(`\nSample Cursor sessions:`);
for (const s of cursorSessions.slice(0, 5)) {
  console.log(`  id=${s.id.slice(-50)}`);
  console.log(`  firstMsg=${s.firstMessageTime?.slice(0, 19) || "(none)"}`);
  console.log(`  lastMod=${s.lastModified?.slice(0, 19) || "(none)"}`);
  console.log();
}

// Also check: what about before April?
const beforeApril = cursorSessions.filter((s) => (s.firstMessageTime || "").slice(0, 10) < "2026-04-01");
const noDate = cursorSessions.filter((s) => !(s.firstMessageTime || "").slice(0, 10));
console.log(`Before April: ${beforeApril.length}, No date: ${noDate.length}`);
