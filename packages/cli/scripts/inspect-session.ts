import { SessionGateway } from "@sc/core";

async function main() {
  const gw = new SessionGateway();
  const { sessions, messages } = await gw.loadProjectData({ projectName: "project-pilot" });

  // Find ALL sessions on 2026-03-02
  const daySessions = sessions.filter((s) => (s.firstMessageTime || "").startsWith("2026-03-02"));

  for (const s of daySessions) {
    const msgs = messages.filter((m) => m.sessionId === s.id);
    const userMsgs = msgs.filter((m) => m.type === "user");
    const assistantMsgs = msgs.filter((m) => m.type === "assistant");
    const sidechainMsgs = msgs.filter((m) => m.isSidechain);

    // Show session source file + key stats
    console.log(`\n══════════════════════════════════════════════════════`);
    console.log(`Session: ${s.id}`);
    console.log(`Provider: ${s.provider}`);
    console.log(`Source: ${s.sourceFile || "(none)"}`);
    console.log(`Messages: ${msgs.length} total | ${userMsgs.length} user | ${assistantMsgs.length} assistant | ${sidechainMsgs.length} isSidechain`);
    console.log(`Worktree: ${(s as any).isWorktree ? "yes" : "no"} | isSubAgent flag on Session: ${(s as any).isSubAgent ?? "not set"}`);

    // Show ALL user messages (full text, first 200 chars)
    console.log(`\n  ── ALL user messages ──`);
    for (const m of userMsgs) {
      const textBlock = m.content.find((c: any) => c.type === "text" && "text" in c);
      const text = (textBlock as any)?.text || "";
      console.log(`  [isSidechain=${m.isSidechain}] ${text.slice(0, 200)}`);
    }

    // Check: do ALL assistant messages have isSidechain?
    const sidechainAssistants = assistantMsgs.filter((m) => m.isSidechain);
    console.log(`\n  ── Assistant isSidechain ratio: ${sidechainAssistants.length}/${assistantMsgs.length} ──`);

    // Check: any messages with subtype agent_name or agent_setting?
    const agentNameMsgs = msgs.filter((m) => m.subtype === "agent_name" || m.subtype === "agent_setting");
    if (agentNameMsgs.length > 0) {
      console.log(`\n  ── Agent name/setting events: ${agentNameMsgs.length} ──`);
      for (const m of agentNameMsgs.slice(0, 5)) {
        const textBlock = m.content.find((c: any) => c.type === "text" && "text" in c);
        console.log(`  [${m.subtype}] ${(textBlock as any)?.text || m.summary || "(no text)"}`);
      }
    }
  }

  // Now look for the MAIN session on that day — one with Chinese user messages
  console.log(`\n\n══════ Looking for MAIN session (Chinese user messages) ══════`);
  for (const s of daySessions) {
    const msgs = messages.filter((m) => m.sessionId === s.id);
    const userMsgs = msgs.filter((m) => m.type === "user" && !m.isSidechain);
    for (const m of userMsgs) {
      const textBlock = m.content.find((c: any) => c.type === "text" && "text" in c);
      const text = (textBlock as any)?.text || "";
      if (/[一-鿿]/.test(text)) {
        console.log(`  Chinese user msg in session ${s.id.slice(0, 40)}...`);
        console.log(`  ${text.slice(0, 300)}`);
      }
    }
  }

  // Also check: are there other sessions on nearby days with Chinese messages?
  console.log(`\n\n══════ Nearby days with Chinese user messages ══════`);
  const nearby = sessions.filter((s) => {
    const t = s.firstMessageTime || "";
    return t >= "2026-03-01" && t <= "2026-03-03";
  });
  for (const s of nearby) {
    const msgs = messages.filter((m) => m.sessionId === s.id);
    for (const m of msgs) {
      if (m.type !== "user") continue;
      const textBlock = m.content.find((c: any) => c.type === "text" && "text" in c);
      const text = (textBlock as any)?.text || "";
      if (/[一-鿿]/.test(text)) {
        console.log(`  ${s.firstMessageTime?.slice(0, 19)} | ${s.id.slice(0, 30)}`);
        console.log(`  ${text.slice(0, 200)}`);
        console.log();
      }
    }
  }
}

main().catch(console.error);
