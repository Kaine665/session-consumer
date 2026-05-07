import { SessionGateway } from "@sc/core";

const gw = new SessionGateway();
const { sessions } = await gw.loadProjectData({ projectName: "project-pilot" });

// Provider breakdown
const byProvider = new Map<string, number>();
for (const s of sessions) {
  const key = s.provider + (s.isSubAgent ? " (sub)" : "");
  byProvider.set(key, (byProvider.get(key) || 0) + 1);
}

console.log("Provider breakdown for 'project-pilot':");
for (const [p, n] of [...byProvider.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${p}: ${n}`);
}

// Check if any Cursor sessions at all
const allProjects = await gw.listProjects();
console.log(`\nAll projects (${allProjects.length}):`);
for (const p of allProjects) {
  console.log(`  [${p.providers.join(", ")}] "${p.name}" — ${p.sessionCount}s, path=${p.path.slice(0, 80)}`);
}
