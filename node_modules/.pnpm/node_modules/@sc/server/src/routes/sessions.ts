import { Hono } from "hono";
import {
  aggregateProjects,
  aggregateSessions,
  loadSessionMessages,
  type SessionProvider,
} from "@sc/core";
import type { AppVariables } from "../index.js";

export const sessionRoutes = new Hono<{ Variables: AppVariables }>();

sessionRoutes.get("/:projectPath", async (c) => {
  const providers = c.get("providers") as SessionProvider[];
  const projectPath = decodeURIComponent(c.req.param("projectPath"));

  // Find the project
  const projects = await aggregateProjects(providers);
  const project = projects.find((p) => p.path === projectPath);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const sessions = await aggregateSessions(project, providers);
  return c.json(sessions);
});

sessionRoutes.get("/:projectPath/:sessionId/messages", async (c) => {
  const providers = c.get("providers") as SessionProvider[];
  const projectPath = decodeURIComponent(c.req.param("projectPath"));
  const sessionId = decodeURIComponent(c.req.param("sessionId"));

  const projects = await aggregateProjects(providers);
  const project = projects.find((p) => p.path === projectPath);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const sessions = await aggregateSessions(project, providers);
  const session = sessions.find(
    (s) => s.id === sessionId || s.actualSessionId === sessionId,
  );
  if (!session) return c.json({ error: "Session not found" }, 404);

  const messages = await loadSessionMessages(session, providers);
  return c.json({ session, messages });
});
