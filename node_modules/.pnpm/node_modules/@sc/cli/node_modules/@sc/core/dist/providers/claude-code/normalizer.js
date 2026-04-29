/** Decode a Claude Code project slug back to a filesystem path. */
export function decodeSlug(slug) {
    let s = slug.startsWith("-") ? slug.slice(1) : slug;
    // Windows drive letter: e.g., "-C-Users-..."
    if (/^[A-Z]-/i.test(s)) {
        return s.replace("-", ":").replace(/-/g, "\\");
    }
    // Unix
    return "/" + s.replace(/-/g, "/");
}
/** Encode a filesystem path into a Claude Code project slug. */
export function encodeSlug(projectPath) {
    let s = projectPath.replace(/\\/g, "/");
    if (/^[A-Z]:/i.test(s)) {
        s = s.replace(":", "");
    }
    s = s.replace(/\//g, "-");
    if (s.startsWith("-"))
        return s;
    return "-" + s;
}
/** Convert a slug to the directory name on disk. */
export function slugToDirname(projectPath, slug) {
    // The slug is already the directory name
    return slug;
}
//# sourceMappingURL=normalizer.js.map