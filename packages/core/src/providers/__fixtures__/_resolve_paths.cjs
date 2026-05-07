const fs = require("fs");
const path = require("path");

const home = process.env.HOME || process.env.USERPROFILE;

// ═══ 1. COLLECT all raw identifiers from all providers ════════════════════════

const raw = {
  claudeCode: [],
  codex: [],
  cursor: [],
};

// Claude Code: slugs from ~/.claude/projects/
const ccBase = path.join(home, ".claude", "projects");
if (fs.existsSync(ccBase)) {
  raw.claudeCode = fs.readdirSync(ccBase, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ slug: d.name, dirOnDisk: path.join(ccBase, d.name) }));
}

// Codex: cwd from first line (payload.cwd) of each JSONL
const codexBase = path.join(home, ".codex", "sessions");
if (fs.existsSync(codexBase)) {
  function walkCodex(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkCodex(full);
      else if (e.isFile() && e.name.endsWith(".jsonl") && e.name !== "session_index.jsonl") {
        try {
          const firstLine = fs.readFileSync(full, "utf-8").split("\n")[0].trim();
          if (!firstLine) return;
          const d = JSON.parse(firstLine);
          const p = d.payload || d;
          if (p.cwd) {
            raw.codex.push({ cwd: p.cwd, sessionId: p.id || null, file: path.relative(codexBase, full) });
          } else {
            raw.codex.push({ cwd: null, sessionId: p.id || null, file: path.relative(codexBase, full) });
          }
        } catch {}
      }
    }
  }
  walkCodex(codexBase);
}

// Cursor: slugs from ~/.cursor/projects/
const cursorBase = path.join(home, ".cursor", "projects");
if (fs.existsSync(cursorBase)) {
  raw.cursor = fs.readdirSync(cursorBase, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ slug: d.name, dirOnDisk: path.join(cursorBase, d.name) }));
}

// ═══ 2. DEDUP raw identifiers into unique "source paths" ═══════════════════════

const uniqueCwds = new Set();
for (const c of raw.codex) if (c.cwd) uniqueCwds.add(c.cwd.toLowerCase());
const uniqueCCSlugs = [...new Set(raw.claudeCode.map(c => c.slug))];
const uniqueCursorSlugs = [...new Set(raw.cursor.map(c => c.slug))];

console.log("=== RAW COUNTS ===");
console.log("Claude Code slugs:", uniqueCCSlugs.length);
console.log("Codex unique cwds:", uniqueCwds.size);
console.log("Cursor slugs:", uniqueCursorSlugs.length);

// ═══ 3. DECODE FUNCTION with filesystem verification ══════════════════════════

// Simple blind decode (current approach)
function blindDecode(slug) {
  let s = slug.startsWith("-") ? slug.slice(1) : slug;
  if (/^[A-Z]-/i.test(s)) {
    return s.replace("-", ":").replace(/-/g, "\\");
  }
  return "/" + s.replace(/-/g, "/");
}

// Try to find the REAL path: split on -, try combinations until fs.exists
function resolveSlug(slug) {
  // Special slugs
  if (slug === "empty-window") return { decoded: null, real: null, note: "empty-window" };
  if (/^\d+$/.test(slug)) return { decoded: null, real: null, note: "timestamp" };

  // Blind decode first
  const blind = blindDecode(slug);

  // Check if blind decode exists
  if (fs.existsSync(blind)) {
    return { decoded: blind, exists: true, note: "blind-decode matches" };
  }

  // Blind decode doesn't exist. Try path-based resolution:
  // Walk upward from the decoded path until we find an existing ancestor,
  // then reconstruct.
  //
  // The core issue: `-` in the slug is ambiguous (separator or literal).
  // We need to find which `-` chars are literal by walking the path.

  // Strategy: split the path into segments, try progressively
  // longer segment combinations

  // For Windows paths: <drive>:\<segments>
  const isWin = /^[A-Z]:/i.test(blind);

  if (isWin) {
    const drive = blind.slice(0, 2); // e.g., "d:"
    const rest = blind.slice(3); // everything after "d:\"

    // Try to find the longest existing prefix
    let segments = rest.split("\\");
    // Try rebuilding: start from full path, walk up
    let current = drive + "\\" + segments.join("\\");
    let tries = 0;
    while (segments.length > 0) {
      if (fs.existsSync(current)) {
        // We found an existing ancestor. Now check if we've consumed
        // all segments correctly.
        if (segments.length === rest.split("\\").length) {
          return { decoded: current, exists: true, note: "exact match from blind" };
        } else {
          return {
            decoded: current,
            exists: true,
            partial: true,
            missingSegments: rest.split("\\").slice(segments.length),
            note: `ancestor found after ${tries} walk-ups`
          };
        }
      }
      // Remove last segment and try again
      // But also try combining the last two segments with `-`
      // (because a `-` in the slug might be a literal dash, not a separator)
      segments.pop();
      current = drive + "\\" + segments.join("\\");
      tries++;
    }
    return { decoded: blind, exists: false, note: `no ancestor found (tried ${tries} walk-ups)` };
  }

  // Unix: similar logic
  let segments = blind.split("/").filter(Boolean);
  let current = "/" + segments.join("/");
  while (segments.length > 0) {
    if (fs.existsSync(current)) {
      return { decoded: current, exists: true, note: "ancestor found" };
    }
    segments.pop();
    current = "/" + segments.join("/");
  }
  return { decoded: blind, exists: false, note: "no ancestor found" };
}

// ═══ 4. SMART RESOLVE: try recombining segments with `-` ══════════════════════

// This is the key function: given a slug, try ALL possible ways to split
// `-` into either path separator or literal dash, and find the one that
// actually exists on disk.

function smartResolveSlug(slug) {
  if (slug === "empty-window") return { path: null, name: "Cursor (no project)", method: "special" };
  if (/^\d+$/.test(slug)) return { path: null, name: `Cursor temp ${slug.slice(0, 8)}`, method: "timestamp" };

  const isWin = /^[A-Z]-/i.test(slug);
  let prefix = "";
  let body = slug;

  if (isWin) {
    prefix = slug[0] + ":\\";
    body = slug.slice(2); // remove "d-" or "C-"
    if (body.startsWith("-")) body = body.slice(1); // remove leading separator
  } else {
    if (body.startsWith("-")) body = body.slice(1);
    prefix = "/";
  }

  // Claude Code encoding: `\`, `/`, `.`, `:` all become `-`.
  // Cursor encoding: `\`, `/`, `:` become `-`.
  // Literal `-` in names also stays `-`.
  //
  // So `--` in a slug can mean:
  //   a) `:\`  (drive colon + separator) — handled by prefix extraction
  //   b) `\.`  (separator + dotfile prefix)
  //   c) `..`  (parent dir)
  //   d) `\-`  (separator + literal dash at start of name) — rare
  //
  // Strategy: split by `-`, then at each empty-string position (from `--`),
  // also try dot-prefixed and parent-dir variants.

  const rawParts = body.split("-");
  // e.g., "Users-17130--myagents-projects" → ["Users","17130","","myagents","projects"]

  const solutions = [];

  function tryResolve(parts) {
    function dfs(idx, segments) {
      if (idx >= parts.length) {
        const fullPath = prefix + segments.join("\\");
        if (fs.existsSync(fullPath)) {
          solutions.push({ path: fullPath, segments: [...segments] });
        }
        return;
      }

      // Try consuming 1..N parts joined by `-`
      for (let end = idx; end < parts.length; end++) {
        const combined = parts.slice(idx, end + 1).join("-");
        // Skip empty combined (from consecutive dashes)
        if (combined === "" || combined === "-") continue;
        const testSegments = [...segments, combined];
        const testPath = prefix + testSegments.join("\\");

        if (fs.existsSync(testPath)) {
          dfs(end + 1, testSegments);
        }
      }
    }
    dfs(0, []);
  }

  // Candidate 1: raw parts as-is
  tryResolve(rawParts);

  // Candidate 2: collapse `--` patterns — try dot-prefix variants
  // For each empty-string part at position i, try ".part[i+1]" instead
  const dotParts = [];
  for (let i = 0; i < rawParts.length; i++) {
    if (rawParts[i] === "" && i + 1 < rawParts.length) {
      // "--something" → try ".something" (dotfile)
      dotParts.push("." + rawParts[i + 1]);
      i++; // skip the next part (consumed by dot-prefix)
    } else if (rawParts[i] === "") {
      // trailing/leading empty — skip
    } else {
      dotParts.push(rawParts[i]);
    }
  }
  if (dotParts.length !== rawParts.length || dotParts.some((p, i) => p !== rawParts[i])) {
    tryResolve(dotParts);
  }

  // Candidate 3: `--` as `..` (parent dir)
  const parentParts = [];
  for (let i = 0; i < rawParts.length; i++) {
    if (rawParts[i] === "" && i + 1 < rawParts.length && rawParts[i + 1] === "") {
      // "---" could be `\..` — not handling this rare case
      parentParts.push("..");
      i += 1;
    } else if (rawParts[i] === "") {
      // skip isolated empty
    } else {
      parentParts.push(rawParts[i]);
    }
  }
  if (parentParts.length !== rawParts.length) {
    tryResolve(parentParts);
  }

  // Deduplicate solutions by path
  const seen = new Set();
  const unique = [];
  for (const s of solutions) {
    const key = s.path.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }

  if (unique.length === 1) {
    return { path: unique[0].path, segments: unique[0].segments, method: "fs-resolved" };
  }
  if (unique.length > 1) {
    unique.sort((a, b) => b.segments.length - a.segments.length);
    return { path: unique[0].path, segments: unique[0].segments, method: "fs-resolved-multiple", allSolutions: unique };
  }

  // No valid path — try to find closest existing ancestor for diagnostics
  const blind = blindDecode(slug);
  let ancestor = null;
  let check = blind;
  while (true) {
    const parent = path.dirname(check);
    if (parent === check || parent === ".") break;
    if (fs.existsSync(parent)) {
      ancestor = parent;
      break;
    }
    check = parent;
  }

  return { path: null, method: "unresolved", blindDecode: blind, closestAncestor: ancestor };
}

// ═══ 5. WORKTREE DETECTION ═══════════════════════════════════════════════════

function detectWorktreeFromSlug(slug, resolvedPath, blindDecoded) {
  // Match worktree patterns in the SLUG itself (before lossy decoding).
  // Claude Code worktree slugs contain:
  //   "--worktrees-<hash>-<name>"  or  "--claude-worktrees-<name>"

  // Extract worktree name from slug: everything after the last worktrees segment
  const slugMatch = slug.match(/--(?:claude-)?worktrees-(.+)$/);
  if (!slugMatch) return { isWorktree: false, mainProject: null, worktreeName: null };

  const worktreeTail = slugMatch[1]; // e.g., "59631478-fix-chapter-white-screen"
  // The main project slug is everything before the worktrees marker
  const mainSlug = slug.slice(0, slug.indexOf(slugMatch[0]));

  // Now decode the main slug to get the main project path
  // Use the resolved path if available and extract parent, otherwise blind decode the main slug
  let mainProject = null;
  if (resolvedPath) {
    // The resolved path is the full worktree path — walk up to find the project boundary
    // Pattern: <project>\.claude\worktrees\<hash>\<name>
    const norm = resolvedPath.replace(/\\/g, "/");
    const wtIdx = norm.indexOf("/.claude/worktrees/");
    if (wtIdx >= 0) {
      mainProject = norm.slice(0, wtIdx).replace(/\//g, "\\");
    }
  }
  if (!mainProject && blindDecoded) {
    const norm = blindDecoded.replace(/\\/g, "/");
    const wtIdx = norm.indexOf("/worktrees/");
    if (wtIdx >= 0) {
      mainProject = norm.slice(0, wtIdx).replace(/\//g, "\\");
    }
  }
  if (!mainProject) {
    // Fallback: decode just the main slug
    mainProject = blindDecode(mainSlug);
  }

  // Extract a readable worktree name from the tail
  // Remove leading hash dir (numeric or hex) if present
  let worktreeName = worktreeTail;
  const parts = worktreeTail.split("-");
  if (/^[0-9a-f]{6,}$/i.test(parts[0])) {
    worktreeName = parts.slice(1).join("-");
  }

  return { isWorktree: true, mainProject, worktreeName };
}

// ═══ 6. RUN THE ANALYSIS ══════════════════════════════════════════════════════

console.log("\n=== CLAUDE CODE SLUGS ===");
const ccResults = uniqueCCSlugs.map(slug => {
  const result = smartResolveSlug(slug);
  const resolvedPath = result.path || result.blindDecode || "";
  const blind = result.blindDecode || "";
  const wt = detectWorktreeFromSlug(slug, resolvedPath, blind);
  return { slug, ...result, ...wt };
});

// Aggregate worktree stats
const ccWorktreeStats = { total: 0, resolved: 0, unresolved: 0, mainProjects: new Set() };

for (const r of ccResults) {
  const status = r.path ? "✓" : "✗";
  const wtTag = r.isWorktree ? " [WORKTREE → " + (r.mainProject || "?") + "]" : "";
  console.log(`  ${status} ${r.slug}${wtTag}`);
  if (r.path) {
    console.log(`    → ${r.path}  [${r.method}]`);
    if (r.segments) console.log(`    segments: ${r.segments.join(" | ")}`);
    if (r.isWorktree) {
      console.log(`    worktree: ${r.worktreeName}  →  main project: ${r.mainProject}`);
      ccWorktreeStats.total++;
      ccWorktreeStats.resolved++;
      ccWorktreeStats.mainProjects.add(r.mainProject);
    }
  } else {
    const ancestor = r.closestAncestor ? ` | closest: ${r.closestAncestor}` : "";
    console.log(`    ✗ unresolved  (blind: ${r.blindDecode || "N/A"}${ancestor})`);
    if (r.isWorktree) {
      console.log(`    worktree: ${r.worktreeName}  →  main project: ${r.mainProject}`);
      ccWorktreeStats.total++;
      ccWorktreeStats.unresolved++;
      ccWorktreeStats.mainProjects.add(r.mainProject);
    }
  }
}

// Also show Codex cwds summary
console.log("\n=== CODEX CWDs ===");
const codexCwds = [...uniqueCwds].sort();
const codexExists = codexCwds.map(c => ({ cwd: c, exists: fs.existsSync(c) }));
for (const c of codexExists) {
  console.log(`  ${c.exists ? "✓" : "✗"} ${c.cwd}`);
}
const codexNullCount = raw.codex.filter(c => !c.cwd).length;
console.log(`  (${codexNullCount} sessions with null cwd)`);

console.log("\n=== CURSOR SLUGS ===");
const cursorResults = uniqueCursorSlugs.map(slug => {
  const result = smartResolveSlug(slug);
  return { slug, ...result };
});

for (const r of cursorResults) {
  const status = r.path ? "✓" : (r.method === "special" ? "·" : "✗");
  console.log(`  ${status} ${r.slug}`);
  if (r.path) {
    console.log(`    → ${r.path}  [${r.method}]`);
  }
}

// ═══ 6. STATISTICS ════════════════════════════════════════════════════════════

console.log("\n=== SUMMARY ===");
console.log(`Claude Code: ${ccResults.filter(r => r.path).length}/${ccResults.length} resolved`);
console.log(`  Worktrees detected: ${ccWorktreeStats.total} (${ccWorktreeStats.resolved} resolved, ${ccWorktreeStats.unresolved} unresolved)`);
console.log(`  Main projects from worktrees: ${[...ccWorktreeStats.mainProjects].join(", ") || "(none)"}`);
console.log(`Codex cwds: ${codexExists.filter(c => c.exists).length}/${codexExists.length} exist on disk`);
console.log(`Cursor: ${cursorResults.filter(r => r.path || r.method === 'special').length}/${cursorResults.length} resolved`);
