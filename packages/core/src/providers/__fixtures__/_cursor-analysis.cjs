const fs = require("fs");
const path = require("path");

// ── Helpers ──
function pathExistsOnDisk(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function pathExistsOnAnyDrive(p) {
  if (pathExistsOnDisk(p)) return p;
  return resolveCrossDrive(p);
}

const ALT_DRIVES = ["d:", "e:", "f:", "g:"];

function resolveCrossDrive(originalPath) {
  if (pathExistsOnDisk(originalPath)) return originalPath;
  const originalDrive = originalPath[0].toLowerCase();
  const rest = originalPath.slice(2);
  for (const alt of ALT_DRIVES) {
    if (alt[0] === originalDrive) continue;
    if (pathExistsOnDisk(alt + rest)) return alt + rest;
  }
  const userProfileMatch = rest.match(/^\\Users\\([^\\]+)\\(.+)$/i);
  if (userProfileMatch) {
    const afterProfile = "\\" + userProfileMatch[2];
    for (const alt of ALT_DRIVES) {
      if (pathExistsOnDisk(alt + afterProfile)) return alt + afterProfile;
    }
  }
  return null;
}

function blindDecodeSlug(slug) {
  let s = slug.startsWith("-") ? slug.slice(1) : slug;
  if (/^[A-Z]-/i.test(s)) return s.replace("-", ":").replace(/-/g, "\\");
  return "/" + s.replace(/-/g, "/");
}

// ── DFS resolution (ported from normalizer.ts) ──
function resolveSlugDFS(slug) {
  if (slug === "empty-window" || /^\d+$/.test(slug)) return null;

  const isWin = /^[A-Z]-/i.test(slug);
  let prefix, body;

  if (isWin) {
    prefix = slug[0] + ":\\";
    body = slug.slice(2);
    if (body.startsWith("-")) body = body.slice(1);
  } else {
    body = slug.startsWith("-") ? slug.slice(1) : slug;
    prefix = "/";
  }

  const rawParts = body.split("-");
  const solutions = [];

  function tryResolve(parts) {
    function dfs(idx, segments) {
      if (idx >= parts.length) {
        const fullPath = prefix + segments.join(isWin ? "\\" : "/");
        const real = pathExistsOnAnyDrive(fullPath);
        if (real) {
          solutions.push({ path: real, depth: segments.length });
        }
        return;
      }

      for (let end = idx; end < parts.length; end++) {
        const combined = parts.slice(idx, end + 1).join("-");
        if (combined === "" || combined === "-") continue;
        const testSegments = [...segments, combined];
        const testPath = prefix + testSegments.join(isWin ? "\\" : "/");

        if (pathExistsOnAnyDrive(testPath)) {
          dfs(end + 1, testSegments);
        }
      }
    }
    dfs(0, []);
  }

  // Candidate 1: raw parts as-is
  tryResolve(rawParts);

  // Candidate 2: "--" → dot-prefix
  const dotParts = [];
  for (let i = 0; i < rawParts.length; i++) {
    if (rawParts[i] === "" && i + 1 < rawParts.length) {
      dotParts.push("." + rawParts[i + 1]);
      i++;
    } else if (rawParts[i] === "") {
      // skip
    } else {
      dotParts.push(rawParts[i]);
    }
  }
  if (dotParts.some((p, i) => p !== rawParts[i])) tryResolve(dotParts);

  // Candidate 3: "---" → parent dir
  const parentParts = [];
  for (let i = 0; i < rawParts.length; i++) {
    if (rawParts[i] === "" && i + 1 < rawParts.length && rawParts[i + 1] === "") {
      parentParts.push("..");
      i += 1;
    } else if (rawParts[i] === "") {
      // skip
    } else {
      parentParts.push(rawParts[i]);
    }
  }
  if (parentParts.length !== rawParts.length) tryResolve(parentParts);

  const seen = new Set();
  const unique = solutions.filter(s => { const k = s.path.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  if (unique.length > 0) { unique.sort((a, b) => b.depth - a.depth); return unique[0].path; }
  return null;
}

function resolveSlugPath(slug) {
  const blind = blindDecodeSlug(slug);
  if (pathExistsOnDisk(blind)) return { path: blind, method: "direct" };
  const crossDrive = resolveCrossDrive(blind);
  if (crossDrive) return { path: crossDrive, method: "cross-drive" };
  const dfsResult = resolveSlugDFS(slug);
  if (dfsResult) {
    const fromXD = dfsResult[0].toLowerCase() !== blind[0].toLowerCase();
    return { path: dfsResult, method: fromXD ? "dfs+cross-drive" : "dfs-resolved" };
  }
  return { path: blind, method: "unresolved" };
}

// ── Is this a temp slug? ──
function isTempSlug(slug) {
  if (slug === "empty-window") return true;
  if (/^\d{10,}$/.test(slug)) return true;
  // C:\Users\...\AppData\Local\Temp\<uuid>
  if (/^[A-Z]-Users-[^-]+-AppData-Local-Temp-/i.test(slug)) return true;
  // C:\Users\...\AppData\Roaming\Cursor\Workspaces\<num>
  if (/^[A-Z]-Users-[^-]+-AppData-Roaming-Cursor-Workspaces-/i.test(slug)) return true;
  return false;
}

// ── Main ──
const home = process.env.HOME || process.env.USERPROFILE;
const cursorDir = path.join(home, ".cursor", "projects");
if (!fs.existsSync(cursorDir)) { console.log("No Cursor projects dir"); process.exit(0); }

const slugs = fs.readdirSync(cursorDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let stats = { total: slugs.length, temp: 0, resolved: 0, unresolved: 0 };
const details = { direct: 0, crossDrive: 0, dfsResolved: 0, dfsCrossDrive: 0 };
const unresolvedList = [];

for (const slug of slugs) {
  if (isTempSlug(slug)) { stats.temp++; continue; }
  const { path: p, method } = resolveSlugPath(slug);
  if (method === "unresolved") { stats.unresolved++; unresolvedList.push({ slug, blind: p }); }
  else { stats.resolved++; details[method]++; }
}

const normal = stats.total - stats.temp;
console.log("=== Cursor slug resolution (with DFS + cross-drive) ===");
console.log(`Total: ${stats.total} | Temp/skipped: ${stats.temp} | Normal: ${normal}`);
console.log(`Resolved: ${stats.resolved}/${normal} (${(stats.resolved/normal*100).toFixed(0)}%)`);
console.log(`  direct: ${details.direct} | cross-drive(blind): ${details.crossDrive} | dfs-resolved: ${details.dfsResolved} | dfs+cross-drive: ${details.dfsCrossDrive}`);
console.log(`Unresolved: ${stats.unresolved}/${normal}`);

if (unresolvedList.length > 0) {
  console.log("\n--- Still unresolved ---");
  for (const u of unresolvedList) console.log(`  ${u.slug}`);
}
