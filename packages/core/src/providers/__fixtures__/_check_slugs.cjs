const fs = require("fs");
const path = require("path");
const slugs = JSON.parse(fs.readFileSync("D:/Desktop/ProgrammingProjects/personal-projects/03-In-Development/session-consumer/packages/core/src/providers/__fixtures__/provider-raw-paths.json","utf-8"))["claude-code"].slugs;

function decodeSlug(slug) {
  let s = slug.startsWith("-") ? slug.slice(1) : slug;
  if (/^[A-Z]-/i.test(s)) {
    return s.replace("-", ":").replace(/-/g, "\\");
  }
  return "/" + s.replace(/-/g, "/");
}

function encodeSlug(p) {
  let s = p.replace(/\\/g, "/");
  if (/^[A-Z]:/i.test(s)) {
    return s[0] + "--" + s.slice(3).replace(/\//g, "-");
  }
  return "-" + s.slice(1).replace(/\//g, "-");
}

function normalizeProjectPath(raw) {
  let result = path.normalize(raw);
  result = result.replace(/[/\\]+$/, "");
  if (/^[A-Z]:/.test(result)) {
    result = result[0].toLowerCase() + result.slice(1);
  }
  return result;
}

const results = slugs.map(slug => {
  const decoded = decodeSlug(slug);
  const normalized = normalizeProjectPath(decoded);
  const reEncoded = encodeSlug(normalized);
  const match = slug === reEncoded;
  return { slug, decoded, normalized, reEncoded, match };
});

const mismatches = results.filter(r => !r.match);
console.log("Total slugs:", slugs.length);
console.log("Round-trip mismatches (decode -> normalize -> encode):", mismatches.length);
if (mismatches.length > 0) {
  console.log("\nMismatches:");
  mismatches.forEach(m => {
    console.log("  slug:     ", m.slug);
    console.log("  decoded:  ", m.decoded);
    console.log("  norm:     ", m.normalized);
    console.log("  re-enc:   ", m.reEncoded);
    console.log("");
  });
}

const patterns = {};
slugs.forEach(s => {
  let key;
  if (/^[a-z]--/.test(s)) key = "lower drive + '--'";
  else if (/^[A-Z]--/.test(s)) key = "upper drive + '--'";
  else if (s.startsWith("-") && /^-[a-z]/.test(s)) key = "unix (lower)";
  else if (s.startsWith("-") && /^-[A-Z]/.test(s)) key = "unix (upper)";
  else key = "other: " + s.slice(0, 10);
  patterns[key] = (patterns[key] || 0) + 1;
});
console.log("Slug patterns:", JSON.stringify(patterns, null, 2));
