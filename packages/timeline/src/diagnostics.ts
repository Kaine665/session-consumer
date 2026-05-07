import type { Message, Session, Project } from "@sc/core";

export interface JoinDiagnostic {
  input: {
    messages: number;
    sessions: number;
    projects: number;
  };
  joined: number;
  lost: {
    noSession: LossDetail;
    noProject: LossDetail;
  };
  unmatched: {
    sessionsWithoutMessages: string[];
    projectsWithoutSessions: string[];
  };
  byId: {
    noSession: string[];
    noProject: string[];
  };
}

export interface LossDetail {
  count: number;
  ids: string[];
}

export function diagnoseJoin(
  messages: Message[],
  sessions: Session[],
  projects: Project[],
): JoinDiagnostic {
  const sessionMap = new Map<string, Session>();
  for (const s of sessions) sessionMap.set(s.id, s);

  const projectMap = new Map<string, Project>();
  for (const p of projects) projectMap.set(p.path, p);

  const noSessionIds: string[] = [];
  const noProjectIds: string[] = [];
  const orphanedSessionIds = new Set<string>();
  const orphanedProjectPaths = new Set<string>();
  const seenSessions = new Set<string>();
  const seenProjects = new Set<string>();

  for (const msg of messages) {
    const session = sessionMap.get(msg.sessionId);
    if (!session) {
      noSessionIds.push(msg.id);
      orphanedSessionIds.add(msg.sessionId);
      continue;
    }
    seenSessions.add(session.id);

    const project = projectMap.get(session.projectPath);
    if (!project) {
      noProjectIds.push(msg.id);
      orphanedProjectPaths.add(session.projectPath);
      continue;
    }
    seenProjects.add(project.path);
  }

  const sessionsWithoutMessages: string[] = [];
  for (const s of sessions) {
    if (!seenSessions.has(s.id)) sessionsWithoutMessages.push(s.id);
  }

  const projectsWithoutSessions: string[] = [];
  for (const p of projects) {
    if (!seenProjects.has(p.path)) projectsWithoutSessions.push(p.path);
  }

  return {
    input: {
      messages: messages.length,
      sessions: sessions.length,
      projects: projects.length,
    },
    joined: messages.length - noSessionIds.length - noProjectIds.length,
    lost: {
      noSession: { count: noSessionIds.length, ids: [...orphanedSessionIds] },
      noProject: {
        count: noProjectIds.length,
        ids: [...orphanedProjectPaths],
      },
    },
    unmatched: {
      sessionsWithoutMessages,
      projectsWithoutSessions,
    },
    byId: {
      noSession: noSessionIds,
      noProject: noProjectIds,
    },
  };
}
