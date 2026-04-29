import * as fs from "node:fs";
import * as path from "node:path";
export function detect() {
    const base = getBasePath();
    if (!base)
        return false;
    const sessions = path.join(base, "sessions");
    const archived = path.join(base, "archived_sessions");
    return (fs.existsSync(sessions) && fs.statSync(sessions).isDirectory()) ||
        (fs.existsSync(archived) && fs.statSync(archived).isDirectory());
}
export function getBasePath() {
    const codexHome = process.env.CODEX_HOME;
    if (codexHome && fs.existsSync(codexHome))
        return codexHome;
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home)
        return null;
    const p = path.join(home, ".codex");
    return fs.existsSync(p) ? p : null;
}
export function getSessionsDir() {
    const base = getBasePath();
    if (!base)
        return null;
    return path.join(base, "sessions");
}
export function getArchivedDir() {
    const base = getBasePath();
    if (!base)
        return null;
    return path.join(base, "archived_sessions");
}
//# sourceMappingURL=detector.js.map