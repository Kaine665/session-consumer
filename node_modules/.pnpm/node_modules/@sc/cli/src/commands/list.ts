import { aggregateProjects, aggregateSessions, type SessionProvider } from "@sc/core";

export async function listProjects(
  providers: SessionProvider[],
  opts: { limit?: string },
): Promise<void> {
  const limit = parseInt(opts.limit || "20", 10);
  const projects = await aggregateProjects(providers);

  console.log(`\nProjects (${projects.length} total, showing ${Math.min(limit, projects.length)})\n`);

  for (const project of projects.slice(0, limit)) {
    const providers = project.providers.join(", ");
    const date = project.lastModified.slice(0, 19).replace("T", " ");
    console.log(`  ${project.name}`);
    console.log(`    Path:      ${project.path}`);
    console.log(`    Sessions:  ${project.sessionCount}  |  Messages: ${project.messageCount}`);
    console.log(`    Providers: ${providers}`);
    console.log(`    Updated:   ${date}`);
    console.log();
  }
}

export async function listSessions(
  providers: SessionProvider[],
  opts: { project?: string; limit?: string },
): Promise<void> {
  const limit = parseInt(opts.limit || "20", 10);
  const projects = await aggregateProjects(providers);

  for (const project of projects) {
    if (opts.project && !project.name.includes(opts.project)) continue;

    const sessions = await aggregateSessions(project, providers);
    console.log(`\n${project.name} (${sessions.length} sessions)\n`);

    for (const session of sessions.slice(0, limit)) {
      const date = session.lastModified.slice(0, 19).replace("T", " ");
      const summary = session.summary
        ? session.summary.slice(0, 80).replace(/\n/g, " ")
        : "(no summary)";
      const flags = [
        session.hasToolUse ? "🛠" : "",
        session.hasErrors ? "⚠" : "",
      ].filter(Boolean).join("") || "—";

      console.log(`  [${session.provider}] ${date} ${flags}`);
      console.log(`  ${summary}`);
      console.log(`  ${session.filePath}`);
      console.log(`  ${session.messageCount} messages`);
      console.log();
    }
  }
}
