const fs = require("fs");
const path = require("path");
const home = process.env.HOME || process.env.USERPROFILE;

// ─── Slugs ───────────────────────────────────────────────────────────────────

const ccBase = path.join(home, ".claude", "projects");
const ccSlugs = fs.readdirSync(ccBase, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const cursorBase = path.join(home, ".cursor", "projects");
const cursorSlugs = fs.readdirSync(cursorBase, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// ─── Available drives ────────────────────────────────────────────────────────

const altDrives = ["d:", "e:", "f:", "g:"];

/**
 * Try to find a path on any drive, using progressively more aggressive remapping.
 *
 * Level 1: Same path, different drive letter
 *   C:\Users\17130\Desktop\foo  →  D:\Users\17130\Desktop\foo
 *
 * Level 2: Strip user profile prefix (Users\<name>), try on alt drives
 *   C:\Users\17130\Desktop\foo  →  D:\Desktop\foo
 *
 * Level 3: Try OneDrive Desktop → regular Desktop on alt drives
 *   C:\Users\17130\OneDrive\Desktop\foo  →  D:\Desktop\foo
 */
function resolveCrossDrive(originalPath) {
  if (fs.existsSync(originalPath)) return { path: originalPath, crossDrive: false };

  const originalDrive = originalPath[0].toLowerCase();
  const rest = originalPath.slice(2); // everything after "C:"

  // Level 1: Simple drive letter swap
  for (const alt of altDrives) {
    if (alt[0] === originalDrive) continue;
    const candidate = alt + rest;
    if (fs.existsSync(candidate)) return { path: candidate, crossDrive: true, method: "drive-swap" };
  }

  // Level 2: Strip user profile prefix
  // e.g., \Users\17130\Desktop\... → try on alt drive root
  const userProfileMatch = rest.match(/^\\Users\\([^\\]+)\\(.+)$/i);
  if (userProfileMatch) {
    const afterProfile = "\\" + userProfileMatch[2]; // \Desktop\...
    for (const alt of altDrives) {
      const candidate = alt + afterProfile;
      if (fs.existsSync(candidate)) return { path: candidate, crossDrive: true, method: "strip-profile" };
    }
  }

  // Level 3: OneDrive Desktop → regular Desktop
  const oneDriveMatch = rest.match(/^\\Users\\([^\\]+)\\OneDrive\\(.+)$/i);
  if (oneDriveMatch) {
    // Try OneDrive path on alt drives first (simple swap)
    for (const alt of altDrives) {
      const candidate = alt + rest;
      if (fs.existsSync(candidate)) return { path: candidate, crossDrive: true, method: "onedrive-swap" };
    }
    // Try without OneDrive on alt drives
    const afterOneDrive = "\\" + oneDriveMatch[2]; // \Desktop\...
    for (const alt of altDrives) {
      const candidate = alt + afterOneDrive;
      if (fs.existsSync(candidate)) return { path: candidate, crossDrive: true, method: "onedrive-strip" };
    }
    // Also try on same drive without OneDrive
    const sameDriveCandidate = originalDrive + ":\\" + afterOneDrive.replace(/^\\/, "");
    if (fs.existsSync(sameDriveCandidate)) return { path: sameDriveCandidate, crossDrive: false, method: "onedrive-local" };
  }

  return null;
}

// ─── Smart DFS resolution (from _resolve_paths.cjs) ──────────────────────────

function smartResolveSlug(slug) {
  if (slug === "empty-window") return { path: null, method: "special" };
  if (/^\d+$/.test(slug)) return { path: null, method: "timestamp" };

  const isWin = /^[A-Z]-/i.test(slug);
  let prefix = "";
  let body = slug;

  if (isWin) {
    prefix = slug[0] + ":\\";
    body = slug.slice(2);
    if (body.startsWith("-")) body = body.slice(1);
  } else {
    if (body.startsWith("-")) body = body.slice(1);
    prefix = "/";
  }

  const rawParts = body.split("-");
  const solutions = [];

  function existsAnywhere(p) {
    if (fs.existsSync(p)) return { path: p, crossDrive: false };
    const result = resolveCrossDrive(p);
    if (result) return { path: result.path, crossDrive: result.crossDrive };
    return null;
  }

  function tryResolve(parts) {
    function dfs(idx, segments) {
      if (idx >= parts.length) {
        const fullPath = prefix + segments.join("\\");
        const real = existsAnywhere(fullPath);
        if (real) {
          solutions.push({ path: real.path, crossDrive: real.crossDrive });
        }
        return;
      }

      for (let end = idx; end < parts.length; end++) {
        const combined = parts.slice(idx, end + 1).join("-");
        if (combined === "" || combined === "-") continue;
        const testSegments = [...segments, combined];
        const testPath = prefix + testSegments.join("\\");

        if (existsAnywhere(testPath)) {
          dfs(end + 1, testSegments);
        }
      }
    }
    dfs(0, []);
  }

  tryResolve(rawParts);

  // dot-prefix variants
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
  if (dotParts.some((p, i) => p !== rawParts[i])) {
    tryResolve(dotParts);
  }

  // parent dir variants
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
  if (parentParts.length !== rawParts.length) {
    tryResolve(parentParts);
  }

  const seen = new Set();
  const unique = [];
  for (const s of solutions) {
    const key = s.path.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }

  if (unique.length > 0) {
    unique.sort((a, b) => b.path.length - a.path.length);
    return { path: unique[0].path, crossDrive: unique[0].crossDrive, method: "fs-resolved" };
  }

  return { path: null, method: "unresolved" };
}

// ─── Blind decode (for diagnostics) ──────────────────────────────────────────

function blindDecode(slug) {
  let s = slug.startsWith("-") ? slug.slice(1) : slug;
  if (/^[A-Z]-/i.test(s)) {
    return s.replace("-", ":").replace(/-/g, "\\");
  }
  return "/" + s.replace(/-/g, "/");
}

// ─── Analysis ────────────────────────────────────────────────────────────────

console.log("=== CLAUDE CODE: C: drive slugs — multi-level cross-drive ===\n");

let ccTotal = 0;
let ccResolved = 0;
let ccCrossDrive = 0;
let ccUnresolved = 0;

for (const slug of ccSlugs) {
  const isWinSlug = /^[A-Z]-/i.test(slug);
  if (!isWinSlug) continue;

  const driveLetter = slug[0].toUpperCase();
  if (driveLetter !== "C") continue;

  ccTotal++;
  const blind = blindDecode(slug);
  if (fs.existsSync(blind)) continue; // already exists on C:

  const result = smartResolveSlug(slug);

  if (result.path) {
    ccResolved++;
    if (result.crossDrive) ccCrossDrive++;
    console.log(`  ✓ ${slug}`);
    console.log(`    → ${result.path}  [${result.method}]${result.crossDrive ? "  ⬅ CROSS-DRIVE" : ""}`);
    console.log(`    blind: ${blind}\n`);
  } else {
    ccUnresolved++;
    console.log(`  ✗ ${slug}`);
    console.log(`    blind: ${blind}`);
    // Quick check: does resolveCrossDrive work on the blind path?
    const xd = resolveCrossDrive(blind);
    console.log(`    xdrive: ${xd ? xd.path + " [" + xd.method + "]" : "no match"}\n`);
  }
}

console.log(`Claude Code C: drive: ${ccResolved}/${ccTotal} resolved (${ccCrossDrive} cross-drive, ${ccUnresolved} unresolved)\n`);

// ─── Cursor ──────────────────────────────────────────────────────────────────

console.log("=== CURSOR: C: drive slugs — multi-level cross-drive ===\n");

let curTotal = 0;
let curResolved = 0;
let curCrossDrive = 0;
let curUnresolved = 0;

for (const slug of cursorSlugs) {
  if (slug === "empty-window" || /^\d+$/.test(slug)) continue;

  const isWinSlug = /^[A-Z]-/i.test(slug);
  if (!isWinSlug) continue;

  const driveLetter = slug[0].toUpperCase();
  if (driveLetter !== "C") continue;

  curTotal++;
  const blind = blindDecode(slug);
  if (blind.includes("AppData\\Local\\Temp")) continue;
  if (fs.existsSync(blind)) continue;

  const result = smartResolveSlug(slug);

  if (result.path) {
    curResolved++;
    if (result.crossDrive) curCrossDrive++;
    console.log(`  ✓ ${slug}`);
    console.log(`    → ${result.path}  [${result.method}]${result.crossDrive ? "  ⬅ CROSS-DRIVE" : ""}`);
    console.log(`    blind: ${blind}\n`);
  } else {
    curUnresolved++;
    console.log(`  ✗ ${slug}`);
    console.log(`    blind: ${blind}`);
    const xd = resolveCrossDrive(blind);
    console.log(`    xdrive: ${xd ? xd.path + " [" + xd.method + "]" : "no match"}\n`);
  }
}

console.log(`Cursor C: drive: ${curResolved}/${curTotal} resolved (${curCrossDrive} cross-drive, ${curUnresolved} unresolved)\n`);

console.log("=== SUMMARY ===");
console.log(`Claude Code: ${ccResolved}/${ccTotal} C: drive slugs resolved (${ccCrossDrive} cross-drive)`);
console.log(`Cursor:      ${curResolved}/${curTotal} C: drive slugs resolved (${curCrossDrive} cross-drive)`);
