import { SessionGateway, type ProviderId } from "@sc/core";
import { TimelineService } from "@sc/timeline";

export async function timelineCommand(
  gw: SessionGateway,
  opts: {
    project?: string;
    provider?: string;
    since?: string;
    until?: string;
    group?: string;
    limit?: string;
    stats?: boolean;
    diagnose?: boolean;
  },
): Promise<void> {
  const timeline = new TimelineService(gw);
  const result = await timeline.execute({
    projectName: opts.project,
    providers: opts.provider
      ? [opts.provider as ProviderId]
      : undefined,
    since: opts.since,
    until: opts.until,
    groupBy: (opts.group as "day" | "session" | "project") || "day",
  });

  if (result.projects.length === 0) {
    console.log("No projects found.");
    return;
  }

  // Diagnose mode
  if (opts.diagnose) {
    const diag = result.diagnostic;
    console.log(`\nData Quality${"\n"}${"─".repeat(50)}`);
    console.log(
      `  Input:   ${diag.input.messages} msgs  |  ${diag.input.sessions} sessions  |  ${diag.input.projects} projects`,
    );
    console.log(
      `  Joined:  ${diag.joined} (${pct(diag.joined, diag.input.messages)}%)`,
    );
    if (diag.lost.noSession.count > 0) {
      console.log(
        `  ⚠ Lost — no matching session: ${diag.lost.noSession.count} msgs (session IDs: ${diag.lost.noSession.ids.join(", ")})`,
      );
    }
    if (diag.lost.noProject.count > 0) {
      console.log(
        `  ⚠ Lost — no matching project: ${diag.lost.noProject.count} msgs (project paths: ${diag.lost.noProject.ids.join(", ")})`,
      );
    }
    if (diag.unmatched.sessionsWithoutMessages.length > 0) {
      console.log(
        `  ⚠ Unmatched — sessions with no messages: ${diag.unmatched.sessionsWithoutMessages.length} (${diag.unmatched.sessionsWithoutMessages.slice(0, 3).join(", ")}${diag.unmatched.sessionsWithoutMessages.length > 3 ? "…" : ""})`,
      );
    }
    if (diag.unmatched.projectsWithoutSessions.length > 0) {
      console.log(
        `  ⚠ Unmatched — projects with no sessions: ${diag.unmatched.projectsWithoutSessions.length} (${diag.unmatched.projectsWithoutSessions.join(", ")})`,
      );
    }
    if (
      diag.lost.noSession.count === 0 &&
      diag.lost.noProject.count === 0 &&
      diag.unmatched.sessionsWithoutMessages.length === 0 &&
      diag.unmatched.projectsWithoutSessions.length === 0
    ) {
      console.log(`  ✓ All clean — every message can be joined, no orphans.`);
    }
    console.log();
    if (opts.stats) return;
  }

  if (result.entries.length === 0) {
    console.log("No timeline entries match the filters.");
    return;
  }

  // Stats mode
  if (opts.stats) {
    const s = result.stats;
    console.log(`\nTimeline Stats\n${"─".repeat(50)}`);
    console.log(`  Entries:       ${s.totalEntries}`);
    console.log(`  Providers:     ${s.providerCount}`);
    console.log(`  Projects:      ${s.projectCount}`);
    console.log(`  Days:          ${s.dayCount}`);
    console.log(`  User msgs:     ${s.userMessages}`);
    console.log(`  Assistant msgs:${s.assistantMessages}`);
    console.log(`  Tool uses:     ${s.toolUses}`);
    console.log(
      `  Date range:    ${s.dateRange.first || "—"} → ${s.dateRange.last || "—"}`,
    );
    console.log();
    return;
  }

  // Display
  const limit = parseInt(opts.limit || "500", 10);
  const totalGroups = Math.min(result.groups.length, limit);
  console.log(
    `\nTimeline — ${result.groups.length} groups (${result.entries.length} entries)\n`,
  );

  for (const group of result.groups.slice(0, limit)) {
    console.log(`${"─".repeat(60)}`);
    console.log(`  ${group.label}  (${group.entries.length} messages)`);
    console.log(`${"─".repeat(60)}`);

    for (const { message, session } of group.entries.slice(0, 20)) {
      const ts = (message.timestamp || "").slice(11, 19) || "??:??:??";
      const typeIcon =
        message.type === "user"
          ? "👤"
          : message.type === "assistant"
            ? "🤖"
            : "⚙";
      const providerTag = `[${session.provider}]`;

      const text = extractDisplayText(message);
      const truncated = text.length > 120 ? text.slice(0, 120) + "…" : text;

      console.log(`  ${ts} ${typeIcon} ${providerTag} ${truncated}`);
    }

    if (group.entries.length > 20) {
      console.log(`  … +${group.entries.length - 20} more`);
    }
    console.log();
  }
}

function pct(part: number, total: number): string {
  if (total === 0) return "0";
  return ((part / total) * 100).toFixed(1);
}

function extractDisplayText(message: {
  type: string;
  content: Array<{ type: string; text?: string; thinking?: string }>;
}): string {
  if (message.type === "system") return "[system event]";
  const textBlock = message.content.find((c) => c.type === "text");
  if (textBlock?.text) return textBlock.text.replace(/\n/g, " ");
  const thinkingBlock = message.content.find((c) => c.type === "thinking");
  if (thinkingBlock?.thinking)
    return `[thinking] ${thinkingBlock.thinking.slice(0, 80)}`;
  return "[no text]";
}
