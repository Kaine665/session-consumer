const fs = require("fs");
const path = require("path");

// Simulate smartResolveSlug for C--Users-17130--myagents-projects
const slug = "C--Users-17130--myagents-projects";
const prefix = "C:\\";
let body = slug.slice(2); // "-Users-17130--myagents-projects"
if (body.startsWith("-")) body = body.slice(1);
console.log("body:", body);

const rawParts = body.split("-");
console.log("rawParts:", JSON.stringify(rawParts));

// Candidate 2: dotParts
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
console.log("dotParts:", JSON.stringify(dotParts));

// Test each prefix
let testPath = prefix;
for (const p of dotParts) {
  testPath = path.join(testPath, p);
  console.log("  ", testPath, "→", fs.existsSync(testPath));
}

// Also test: what about C:\Users\17130 directly?
console.log("\nDirect checks:");
console.log("  C:\\Users\\17130\\.myagents:", fs.existsSync("C:\\Users\\17130\\.myagents"));
console.log("  C:\\Users\\17130\\.myagents\\projects:", fs.existsSync("C:\\Users\\17130\\.myagents\\projects"));
