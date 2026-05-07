import type { CompressedDay } from "./compressor.js";

/** Render compressed day data into the text format the LLM expects as user input. */
export function formatDay(day: CompressedDay): string {
  const lines = [`Date: ${day.date}`, ""];
  for (const s of day.sessions) {
    const dur = s.durationMinutes ? ` | ${s.durationMinutes}min` : "";
    lines.push(
      `  #${s.index} [${s.provider}] ${s.messageCount} msgs${dur} | ${s.firstMessageTime.slice(11, 19)}`,
    );

    if (s.userMessages.length > 0) {
      lines.push("  User:");
      for (const m of s.userMessages) {
        lines.push(`    - "${m}"`);
      }
    }

    if (s.assistantThinking.length > 0) {
      lines.push("  Thinking:");
      for (const t of s.assistantThinking) {
        lines.push(`    - ${t}`);
      }
    }

    if (s.assistantText.length > 0) {
      lines.push("  Assistant:");
      for (const t of s.assistantText) {
        lines.push(`    - ${t}`);
      }
    }

    if (s.assistantTools.length > 0) {
      lines.push("  Tools:");
      for (const a of s.assistantTools) {
        lines.push(`    - ${a}`);
      }
    }

    lines.push("");
  }
  return lines.join("\n");
}
