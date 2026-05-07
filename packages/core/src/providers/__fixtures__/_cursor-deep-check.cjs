const fs = require("fs");
const path = require("path");
const os = require("os");

const home = os.homedir();
const cursorDir = path.join(home, ".cursor", "projects");
const slugs = fs.readdirSync(cursorDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

function pathExistsOnDisk(p) {
  try { return fs.existsSync(p); } catch { return false; }
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

function pathExistsOnAnyDrive(p) {
  if (pathExistsOnDisk(p)) return p;
  return resolveCrossDrive(p);
}

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
        if (real) solutions.push({ path: real, depth: segments.length });
        return;
      }
      for (let end = idx; end < parts.length; end++) {
        const combined = parts.slice(idx, end + 1).join("-");
        if (combined === "" || combined === "-") continue;
        const testSegments = [...segments, combined];
        const testPath = prefix + testSegments.join(isWin ? "\\" : "/");
        if (pathExistsOnAnyDrive(testPath)) dfs(end + 1, testSegments);
      }
    }
    dfs(0, []);
  }
  tryResolve(rawParts);
  const dotParts = [];
  for (let i = 0; i < rawParts.length; i++) {
    if (rawParts[i] === "" && i + 1 < rawParts.length) { dotParts.push("." + rawParts[i + 1]); i++; }
    else if (rawParts[i] === "") {}
    else { dotParts.push(rawParts[i]); }
  }
  if (dotParts.some((p, i) => p !== rawParts[i])) tryResolve(dotParts);
  const parentParts = [];
  for (let i = 0; i < rawParts.length; i++) {
    if (rawParts[i] === "" && i + 1 < rawParts.length && rawParts[i + 1] === "") { parentParts.push(".."); i += 1; }
    else if (rawParts[i] === "") {}
    else { parentParts.push(rawParts[i]); }
  }
  if (parentParts.length !== rawParts.length) tryResolve(parentParts);
  const seen = new Set();
  const unique = solutions.filter(s => { const k = s.path.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  if (unique.length > 0) { unique.sort((a, b) => b.depth - a.depth); return unique[0].path; }
  return null;
}

// Skip specials
const normal = slugs.filter(s =>
  s !== "empty-window" &&
  !/^\d{10,}$/.test(s) &&
  !/AppData/i.test(s)
);

console.log("=== Resolved (14) ===");
for (const slug of normal) {
  const dfs = resolveSlugDFS(slug);
  if (dfs) {
    console.log("OK  " + slug);
    console.log("    -> " + dfs);
  }
}

console.log("");
console.log("=== C: drive slugs — why they fail ===");
let cChecked = 0, cFound = 0;
for (const slug of normal) {
  if (!/^[Cc]-/i.test(slug)) continue;
  cChecked++;

  const blind = blindDecodeSlug(slug);
  const exists = pathExistsOnDisk(blind);
  const xd = resolveCrossDrive(blind);
  const dfs = resolveSlugDFS(slug);

  if (exists || xd || dfs) {
    cFound++;
  } else {
    // Show what the blind decode looks like vs what exists
    // Try finding the closest match on D:
    const parts = slug.slice(2).split("-");
    // Check if we can find a D: equivalent by stripping Users-xxx-
    if (parts[0].toLowerCase() === "users" && parts[1] === "17130" && parts[2].toLowerCase() === "desktop") {
      const afterDesktop = parts.slice(3);
      // Try as single segments on D:
      const dPath = "d:\\" + afterDesktop.join("\\");
      const dPathXP = pathExistsOnDisk(dPath);

      // Try with hyphen joining for known patterns
      // Actually check specific directories
      if (cChecked <= 5) {
        console.log("");
        console.log("  Slug: " + slug);
        console.log("  Blind: " + blind);
        console.log("  Blind exists on C: " + exists);
        console.log("  Cross-drive: " + (xd || "none"));
        console.log("  DFS result: " + (dfs || "none"));

        // Check: does D:\Desktop\ProgrammingProjects exist?
        const dDesktop = "d:\\Desktop";
        if (fs.existsSync(dDesktop)) {
          const dEntries = fs.readdirSync(dDesktop);
          const matching = dEntries.filter(e => e.toLowerCase().includes("program") || e.toLowerCase().includes("project"));
          console.log("  D:\\Desktop matches: " + matching.join(", "));
        }
      }
    }
  }
}
console.log("");
console.log("C: drive total: " + cChecked + ", found: " + cFound);

console.log("");
console.log("=== D: drive unresolved slugs ===");
for (const slug of normal) {
  if (!/^[Dd]-/i.test(slug)) continue;
  const dfs = resolveSlugDFS(slug);
  const blind = blindDecodeSlug(slug);
  if (!pathExistsOnDisk(blind) && !dfs) {
    console.log("");
    console.log("  Slug: " + slug);
    console.log("  Blind: " + blind);
    console.log("  Blind exists: " + pathExistsOnDisk(blind));
    console.log("  DFS: " + (dfs || "none"));

    // What's actually on disk?
    const parent = path.dirname(blind);
    if (fs.existsSync(parent)) {
      const children = fs.readdirSync(parent);
      const matching = children.filter(c => {
        const lastPart = path.basename(blind).toLowerCase();
        return c.toLowerCase().includes(lastPart.slice(0, 6));
      });
      console.log("  Parent " + parent + " exists, matching children: " + matching.join(", "));
    } else {
      // Walk up to find nearest existing parent
      let p = blind;
      while (p && !fs.existsSync(p)) {
        const prev = p;
        p = path.dirname(p);
        if (p === prev) break;
      }
      console.log("  Nearest existing parent: " + p);
      if (p && fs.existsSync(p)) {
        console.log("  Children: " + fs.readdirSync(p).slice(0, 10).join(", "));
      }
    }
  }
}
