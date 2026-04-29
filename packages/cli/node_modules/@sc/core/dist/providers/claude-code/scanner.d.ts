import type { Project } from "../../domain/project.js";
import type { Session } from "../../domain/session.js";
export declare function scanProjects(basePath: string): Promise<Project[]>;
export declare function loadSessions(basePath: string, projectPath: string): Promise<Session[]>;
//# sourceMappingURL=scanner.d.ts.map