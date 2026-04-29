import type { Message } from "../domain/message.js";
import type { Project } from "../domain/project.js";
import type { Session } from "../domain/session.js";
import type { ProviderId } from "../domain/provider.js";
/**
 * Contract every AI tool adapter must implement.
 *
 * All functions return domain types (Message, Session, Project) —
 * the adapter is responsible for converting native formats into
 * the unified domain model.
 */
export interface SessionProvider {
    readonly id: ProviderId;
    readonly displayName: string;
    /** Check if this provider's data directory is present. */
    detect(): boolean;
    /** Return the base path where session data is stored. */
    getBasePath(): string | null;
    /** Scan all projects that have sessions from this provider. */
    scanProjects(): Promise<Project[]>;
    /** Load session metadata for a given project. */
    loadSessions(projectPath: string): Promise<Session[]>;
    /** Load all messages for a given session file. */
    loadMessages(sessionFilePath: string, sessionId: string): Promise<Message[]>;
    /** Full-text search across sessions. */
    search(query: string, maxResults?: number): Promise<Message[]>;
}
/** Filter a list of providers to those whose data directory exists. */
export declare function detectAvailable(providers: SessionProvider[]): SessionProvider[];
//# sourceMappingURL=interface.d.ts.map