import type { SessionGateway } from "@sc/core";
import { DailyReportService } from "@sc/daily";
import { LLMSummarizer } from "../summarizer.js";

export async function dailyCommand(
  gw: SessionGateway,
  opts: {
    project?: string;
    since?: string;
    until?: string;
    nollm?: boolean;
  },
): Promise<void> {
  const summarizer = opts.nollm ? undefined : new LLMSummarizer();
  const service = new DailyReportService(gw, summarizer);

  const report = await service.execute({
    projectName: opts.project,
    since: opts.since,
    until: opts.until,
  });

  if (report.days.length === 0) {
    console.log("No sessions found in the given date range.");
    return;
  }

  console.log(
    `\n${"═".repeat(62)}\n  Daily Report — ${report.dateRange.first} ~ ${report.dateRange.last}\n${"═".repeat(62)}`,
  );

  for (const day of report.days) {
    const providerStr = day.providers.join("+");
    console.log(`\n📅 ${day.date}  [${day.sessionCount} sessions / ${day.totalMessages} msgs / ${providerStr}]`);
    console.log(`   ${day.summary}`);
    console.log();

    // Session index
    console.log(`   Sessions:`);
    for (const s of day.sessions) {
      const idx = String(s.index).padStart(2, "0");
      const time = s.firstMessageTime.slice(11, 19);
      const hint = s.userMessages[0] || "(no text)";
      const shortHint = hint.length > 70 ? hint.slice(0, 70) + "…" : hint;
      console.log(`   ${idx} [${s.provider}] ${s.messageCount} msg | ${time} | ${shortHint}`);
    }

    // Tasks
    console.log(`\n${"─".repeat(62)}`);
    for (let i = 0; i < day.tasks.length; i++) {
      const t = day.tasks[i];
      const num = String(i + 1).padStart(2, "0");
      const refs = t.sessionRefs.length > 0
        ? ` [${t.sessionRefs.map(String).join(", ")}]`
        : "";
      console.log(`   ${num}. ${t.description}${refs}`);
    }
  }

  const totalSessions = report.days.reduce((s, d) => s + d.sessionCount, 0);
  const totalMsgs = report.days.reduce((s, d) => s + d.totalMessages, 0);
  console.log(`\n${"═".repeat(62)}`);
  console.log(`${report.days.length} days / ${totalSessions} sessions / ${totalMsgs} msgs\n`);
}
