import * as fs from "node:fs";
import * as path from "node:path";
export function detect() {
    const base = getBasePath();
    if (!base)
        return false;
    return fs.existsSync(base) && fs.statSync(base).isDirectory();
}
export function getBasePath() {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home)
        return null;
    const p = path.join(home, ".claude", "projects");
    return p;
}
//# sourceMappingURL=detector.js.map