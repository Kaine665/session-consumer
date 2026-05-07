import { SessionGateway } from "@sc/core";
import { groupByDay, cleanUserMessage } from "@sc/daily";

const gw = new SessionGateway();
const { sessions, messages } = await gw.loadProjectData({ projectName: "project-pilot" });
const digests = groupByDay(sessions, messages);
const day = digests.find(d => d.date === "2026-04-03")!;

// Show all sessions with their user messages
for (const s of day.sessions) {
  console.log(`─── #${s.index} [${s.provider}] ${s.messageCount}msgs | ${s.firstMessageTime.slice(11,19)} ───`);
  console.log(`User messages (${s.userMessages.length}):`);
  for (let i = 0; i < s.userMessages.length; i++) {
    console.log(`  [${i+1}] ${s.userMessages[i].slice(0, 150)}`);
  }
  console.log(`Thinking (${s.assistantThinking.length}):`);
  for (const t of s.assistantThinking.slice(0, 3)) {
    console.log(`  - ${t.slice(0, 120)}`);
  }
  console.log(`Text (${s.assistantText.length}):`);
  for (const t of s.assistantText.slice(0, 3)) {
    console.log(`  - ${t.slice(0, 120)}`);
  }
  console.log(`Tools (${s.assistantTools.length}):`);
  for (const t of s.assistantTools.slice(0, 5)) {
    console.log(`  - ${t.slice(0, 120)}`);
  }
  console.log();
}
