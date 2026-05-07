import { SessionGateway } from "@sc/core";

export async function mapCommand(
  gw: SessionGateway,
  ghostPath: string | undefined,
  opts: { to?: string; remove?: boolean; delete?: boolean; list?: boolean },
): Promise<void> {
  // List unresolved ghosts
  if (!ghostPath || opts.list) {
    const ghosts = await gw.listGhosts();

    if (ghosts.length === 0) {
      console.log("No unresolved ghost projects found.\n");
      return;
    }

    console.log(`\nUnresolved ghosts (${ghosts.length}):\n`);
    for (const g of ghosts) {
      const mapping = gw.getMapping(g.path);
      const mapped = mapping ? ` → ${mapping.targetProject ?? "(deleted)"}` : "";
      console.log(`  ${g.name}`);
      console.log(`    Path:    ${g.path}${mapped}`);
      console.log(`    Sessions: ${g.sessionCount}  |  Messages: ${g.messageCount}`);
      console.log(`    Provider: ${g.providers.join(", ")}`);
      console.log();
    }

    console.log("Use 'sc map <path> --to <real-path>' to resolve.");
    console.log("Use 'sc map <path> --delete' to mark as deleted.");
    console.log("Use 'sc map <path> --remove' to clear a mapping.\n");
    return;
  }

  // Remove mapping (undo a previous --to or --delete)
  if (opts.remove) {
    gw.removeGhostMapping(ghostPath);
    console.log(`Removed mapping for: ${ghostPath}\n`);
    return;
  }

  // Mark as deleted
  if (opts.delete) {
    gw.markGhostDeleted(ghostPath);
    console.log(`Marked as deleted: ${ghostPath}\n`);
    return;
  }

  // Create mapping
  if (opts.to) {
    gw.mapGhost(ghostPath, opts.to);
    console.log(`Mapped: ${ghostPath}`);
    console.log(`    → ${opts.to}\n`);
    return;
  }

  // Show single ghost details
  const mapping = gw.getMapping(ghostPath);
  if (mapping) {
    console.log(`\nMapping for: ${ghostPath}`);
    console.log(`  Target:  ${mapping.targetProject ?? "(deleted)"}`);
    console.log(`  Reason:  ${mapping.reason}`);
    console.log(`  When:    ${mapping.resolvedAt}\n`);
  } else {
    console.log(`\nNo mapping found for: ${ghostPath}`);
    console.log("Use --to <path> to create one, or --remove to delete.\n");
  }
}
