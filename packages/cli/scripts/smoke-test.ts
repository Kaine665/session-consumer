/** Smoke test: verify the MCP tool layer works with real data. */
import * as tools from "../../mcp/src/tools/index.js";

console.log("=== Smoke test: MCP tools ===\n");

// 1. List projects
console.log("── list_projects ──");
const { projects } = await tools.listProjects();
console.log(`Found ${projects.length} projects:`);
for (const p of projects.slice(0, 5)) {
  console.log(`  ${p.name} (${p.path}) [${p.providers.join(", ")}]`);
}

// 2. Get days for project-pilot
console.log("\n── get_days(project-pilot) ──");
const pp = projects.find((p) => p.name.includes("project-pilot"));
let days: Array<{ date: string; sessionCount: number; messageCount: number }> = [];
if (pp) {
  const result = await tools.getDays({ projectName: "project-pilot" });
  days = result.days;
  console.log(`Found ${days.length} days`);
  for (const d of days.slice(-3)) {
    console.log(`  ${d.date}: ${d.sessionCount} sessions, ${d.messageCount} msgs`);
  }
}

// 3. Get day sessions for the most recent day
const lastDay = days[days.length - 1];
if (lastDay) {
  console.log(`\n── get_day_sessions(project-pilot, ${lastDay.date}) ──`);
  const day = await tools.getDaySessions({ projectName: "project-pilot", date: lastDay.date });
  // Show session layers
  const s = (day as any).sessions?.[0];
  if (s) {
    console.log(`Session #${s.index}: ${s.provider}, ${s.messageCount} msgs`);
    console.log(`  userMessages: ${s.userMessages.length}`);
    console.log(`  assistantThinking: ${s.assistantThinking.length}`);
    console.log(`  assistantText: ${s.assistantText.length}`);
    console.log(`  assistantTools: ${s.assistantTools.length}`);
    // Show first user message
    if (s.userMessages[0]) {
      console.log(`  First user msg: "${s.userMessages[0].slice(0, 80)}"`);
    }
  }
}

// 4. Save a test report
console.log("\n── save_daily_report ──");
const result = await tools.saveDailyReport({
  projectName: "project-pilot",
  date: "2026-05-02",
  summary: "烟雾测试——端到端验证 MCP 工具链",
  tasks: [
    { description: "创建 MCP Server 包", sessionCount: 1, messageCount: 100, sessionRefs: [1] },
  ],
  fullText: "# Smoke Test Report\n\nThis is a test.",
});
console.log(result);

// 5. List reports
console.log("\n── get_recent_reports ──");
const { reports } = await tools.getRecentReports({ projectName: "project-pilot" });
console.log(`Found ${reports.length} saved reports`);
for (const r of reports.slice(0, 3)) {
  console.log(`  ${r.date}: ${r.summary}`);
}

console.log("\n=== Smoke test complete ===");
