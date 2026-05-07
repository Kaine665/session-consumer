import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectMapping, ProjectMappingStore } from "../domain/project.js";

/** Walk up from startDir to find the monorepo root (where pnpm-workspace.yaml lives). */
function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Path to the user-defined mapping file.
 *  Prefers the monorepo root (project-owned). Falls back to ~/.session-consumer/. */
function mappingPath(): string | null {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const root = findMonorepoRoot(path.dirname(thisFile));
    if (root) return path.join(root, "project-mappings.json");
  } catch { /* skip */ }

  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const dir = path.join(home, ".session-consumer");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "project-mappings.json");
}

/** Load all user-defined project mappings. Returns empty store if file is missing or corrupt. */
export function loadMappings(): ProjectMappingStore {
  const p = mappingPath();
  if (!p || !fs.existsSync(p)) return { mappings: [] };

  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (raw && Array.isArray(raw.mappings)) {
      return { mappings: raw.mappings };
    }
    return { mappings: [] };
  } catch {
    return { mappings: [] };
  }
}

/** Save the full mapping store to disk (atomic write). */
export function saveMappings(store: ProjectMappingStore): void {
  const p = mappingPath();
  if (!p) return;

  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

/** Look up an unresolved path in the mapping table. Returns the mapping or null. */
export function findMapping(unresolvedPath: string): ProjectMapping | null {
  const store = loadMappings();
  return (
    store.mappings.find(
      (m) => m.unresolvedPath.toLowerCase() === unresolvedPath.toLowerCase(),
    ) ?? null
  );
}

/** Add or update a mapping entry. */
export function upsertMapping(mapping: ProjectMapping): void {
  const store = loadMappings();
  const idx = store.mappings.findIndex(
    (m) => m.unresolvedPath.toLowerCase() === mapping.unresolvedPath.toLowerCase(),
  );
  if (idx >= 0) {
    store.mappings[idx] = mapping;
  } else {
    store.mappings.push(mapping);
  }
  saveMappings(store);
}

/** Remove a mapping by unresolved path. */
export function removeMapping(unresolvedPath: string): void {
  const store = loadMappings();
  saveMappings({
    mappings: store.mappings.filter(
      (m) => m.unresolvedPath.toLowerCase() !== unresolvedPath.toLowerCase(),
    ),
  });
}
