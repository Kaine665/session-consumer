const fs = require("fs");
const path = require("path");

const home = process.env.HOME || process.env.USERPROFILE;
const output = {};

// ─── Claude Code: all directory slugs ─────────────────────────────────────
output["claude-code"] = {};
const ccProjects = path.join(home, ".claude", "projects");
if (fs.existsSync(ccProjects)) {
  const dirs = fs.readdirSync(ccProjects, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  output["claude-code"].slugs = dirs;
  output["claude-code"].count = dirs.length;
}

// ─── MyAgents: registry entries + cwd samples ─────────────────────────────
output["myagents"] = {};
const registryPath = path.join(home, ".myagents", "projects.json");
if (fs.existsSync(registryPath)) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  const entries = Array.isArray(registry) ? registry : Object.values(registry);
  output["myagents"].registry = entries.map(e => ({
    name: e.name,
    path: e.path,
  }));
}

const sessionsDir = path.join(home, ".myagents", "sessions");
if (fs.existsSync(sessionsDir)) {
  const cwdSamples = [];
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith(".jsonl")).slice(0, 30);
  for (const f of files) {
    const content = fs.readFileSync(path.join(sessionsDir, f), "utf-8");
    const firstLine = content.split("\n")[0].trim();
    if (!firstLine) continue;
    try {
      const entry = JSON.parse(firstLine);
      if (entry.cwd) cwdSamples.push(entry.cwd);
    } catch {}
  }
  output["myagents"].cwdSamples = [...new Set(cwdSamples)];
  output["myagents"].totalSessions = fs.readdirSync(sessionsDir).filter(f => f.endsWith(".jsonl")).length;
}

// ─── Codex: date directories + project_name/cwd samples ───────────────────
output["codex"] = {};
const codexSessions = path.join(home, ".codex", "sessions");
const codexArchived = path.join(home, ".codex", "archived_sessions");

function collectCodexSamples(baseDir, maxFiles) {
  if (!fs.existsSync(baseDir)) return { dirs: [], samples: [] };
  const dirs = [];
  const samples = [];
  const stack = [baseDir];
  while (stack.length > 0 && samples.length < maxFiles) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        dirs.push(path.relative(baseDir, full));
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith(".jsonl") && e.name !== "session_index.jsonl") {
        try {
          const content = fs.readFileSync(full, "utf-8");
          const firstLine = content.split("\n")[0].trim();
          if (firstLine) {
            const entry = JSON.parse(firstLine);
            const p = entry.payload || entry;
            samples.push({
              file: path.relative(baseDir, full),
              project_name: p.project_name || entry.project_name || null,
              cwd: p.cwd || entry.cwd || null,
              session_id: p.id || entry.session_id || null,
            });
          }
        } catch {}
      }
    }
  }
  return { dirs: [...new Set(dirs)].sort(), samples };
}

const active = collectCodexSamples(codexSessions, 20);
const archived = collectCodexSamples(codexArchived, 10);
output["codex"].dateDirs = active.dirs;
output["codex"].sampleFiles = active.samples;
output["codex"].hasArchived = archived.dirs.length > 0;

// ─── Cursor: ~/.cursor/projects/<slug>/agent-transcripts/ ──────────────────
output["cursor"] = {};
const cursorProjectsDir = path.join(home, ".cursor", "projects");
if (fs.existsSync(cursorProjectsDir)) {
  const slugDirs = fs.readdirSync(cursorProjectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  output["cursor"].slugs = slugDirs;
  output["cursor"].slugCount = slugDirs.length;

  // Collect per-slug stats + sample transcripts (prioritize slugs with transcripts)
  const slugInfos = [];
  const sortedSlugs = slugDirs.sort((a, b) => {
    const aHas = fs.existsSync(path.join(cursorProjectsDir, a, "agent-transcripts"));
    const bHas = fs.existsSync(path.join(cursorProjectsDir, b, "agent-transcripts"));
    return (bHas ? 1 : 0) - (aHas ? 1 : 0);
  });
  for (const slug of sortedSlugs.slice(0, 30)) {
    const transcriptsDir = path.join(cursorProjectsDir, slug, "agent-transcripts");
    if (!fs.existsSync(transcriptsDir)) continue;
    const entries = fs.readdirSync(transcriptsDir, { withFileTypes: true });
    const jsonlDirs = entries.filter(e => e.isDirectory() && e.name.endsWith(".jsonl") !== true).filter(e => e.isDirectory());
    const jsonlFiles = entries.filter(e => e.isFile() && e.name.endsWith(".jsonl"));
    const txtFiles = entries.filter(e => e.isFile() && e.name.endsWith(".txt"));

    // Collect all transcript IDs
    const allIds = entries
      .filter(e => (e.isDirectory()) || (e.isFile() && (e.name.endsWith(".jsonl") || e.name.endsWith(".txt"))))
      .map(e => e.isDirectory() ? e.name : e.name.replace(/\.(jsonl|txt)$/, ""));

    // Read first line of first JSONL transcript to capture structure
    let sampleFirstLine = null;
    for (const d of jsonlDirs) {
      const innerFile = path.join(transcriptsDir, d.name, d.name + ".jsonl");
      if (fs.existsSync(innerFile)) {
        try {
          const content = fs.readFileSync(innerFile, "utf-8");
          const firstLine = content.split("\n")[0].trim();
          if (firstLine) {
            const entry = JSON.parse(firstLine);
            sampleFirstLine = {
              transcriptId: d.name,
              role: entry.role || null,
              topKeys: Object.keys(entry),
              hasCwd: !!entry.cwd,
              hasTimestamp: !!entry.timestamp,
              messageKeys: entry.message ? Object.keys(entry.message) : null,
            };
            break;
          }
        } catch {}
      }
    }

    // Also sample a .txt transcript if available
    let txtSample = null;
    if (txtFiles.length > 0) {
      try {
        const txtContent = fs.readFileSync(path.join(transcriptsDir, txtFiles[0].name), "utf-8");
        txtSample = {
          file: txtFiles[0].name,
          size: txtContent.length,
          firstChars: txtContent.slice(0, 200),
        };
      } catch {}
    }

    slugInfos.push({
      slug,
      transcriptCount: [...new Set(allIds)].length,
      jsonlDirCount: jsonlDirs.length,
      jsonlFileCount: jsonlFiles.length,
      txtCount: txtFiles.length,
      sampleFirstLine,
      txtSample,
    });
  }
  output["cursor"].slugInfos = slugInfos;
}

// ─── Gemini ────────────────────────────────────────────────────────────────
output["gemini"] = {};
const geminiDir = path.join(home, ".gemini", "history");
if (fs.existsSync(geminiDir)) {
  output["gemini"].historySubdirs = fs.readdirSync(geminiDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

// ─── OpenCode ──────────────────────────────────────────────────────────────
output["opencode"] = {};
const xdg = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
const ocDir = process.platform === "win32"
  ? path.join(process.env.USERPROFILE, "AppData", "Local", "opencode")
  : path.join(xdg, "opencode");
output["opencode"].exists = fs.existsSync(ocDir);
output["opencode"].expectedPath = ocDir;

// ─── Output ────────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, "provider-raw-paths.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Written to ${outPath}`);
console.log(`  claude-code slugs:    ${output["claude-code"].count || 0}`);
console.log(`  myagents registry:    ${output["myagents"].registry?.length || 0} entries, cwd samples: ${output["myagents"].cwdSamples?.length || 0}`);
console.log(`  codex date dirs:      ${output["codex"].dateDirs?.length || 0}, samples: ${output["codex"].sampleFiles?.length || 0}`);
console.log(`  cursor slugs:         ${output["cursor"].slugCount || 0}, samples: ${output["cursor"].slugInfos?.length || 0}`);
console.log(`  gemini subdirs:       ${output["gemini"].historySubdirs?.length || 0}`);
console.log(`  opencode exists:      ${output["opencode"].exists}`);
