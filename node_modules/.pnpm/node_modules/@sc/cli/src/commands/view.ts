import {
  aggregateProjects,
  aggregateSessions,
  loadSessionMessages,
  extractText,
  type SessionProvider,
} from "@sc/core";

export async function viewSession(
  providers: SessionProvider[],
  sessionId: string,
  opts: { limit?: string },
): Promise<void> {
  const limit = parseInt(opts.limit || "50", 10);

  // Find the session across all projects
  const projects = await aggregateProjects(providers);

  for (const project of projects) {
    const sessions = await aggregateSessions(project, providers);
    const session = sessions.find(
      (s: { id: string; actualSessionId: string }) => s.id.includes(sessionId) || s.actualSessionId.includes(sessionId),
    );

    if (!session) continue;

    console.log(`\n${session.provider} — ${session.projectName}`);
    console.log(`${session.firstMessageTime.slice(0, 19)} → ${session.lastMessageTime.slice(0, 19)}`);
    console.log(`${session.messageCount} messages`);
    if (session.summary) {
      console.log(`Summary: ${session.summary}`);
    }
    console.log(`\n${"─".repeat(80)}\n`);

    const messages = await loadSessionMessages(session, providers);
    const shown = messages.slice(-limit);

    for (const msg of shown) {
      const role = msg.type === "assistant" ? "🤖" : msg.type === "user" ? "👤" : "⚙";
      const ts = msg.timestamp.slice(0, 19).replace("T", " ");

      const textContent = extractText(msg.content);

      if (textContent) {
        console.log(`${role} [${ts}]`);
        const display = textContent.length > 500 ? textContent.slice(0, 500) + "..." : textContent;
        console.log(`${display}\n`);
      }

      // Show tool uses
      for (const tu of msg.toolUses) {
        console.log(`  🔧 ${tu.name}: ${JSON.stringify(tu.input).slice(0, 120)}`);
      }
    }

    console.log(`${"─".repeat(80)}`);
    console.log(`Showing ${shown.length} of ${messages.length} messages\n`);
    return;
  }

  console.log(`Session not found: ${sessionId}`);
}
