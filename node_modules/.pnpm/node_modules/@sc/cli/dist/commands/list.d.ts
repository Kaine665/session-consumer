import { type SessionProvider } from "@sc/core";
export declare function listProjects(providers: SessionProvider[], opts: {
    limit?: string;
}): Promise<void>;
export declare function listSessions(providers: SessionProvider[], opts: {
    project?: string;
    limit?: string;
}): Promise<void>;
//# sourceMappingURL=list.d.ts.map