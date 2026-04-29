import { Hono } from "hono";
import { aggregateProjects, type SessionProvider } from "@sc/core";
import type { AppVariables } from "../index.js";

export const projectRoutes = new Hono<{ Variables: AppVariables }>();

projectRoutes.get("/", async (c) => {
  const providers = c.get("providers") as SessionProvider[];
  const projects = await aggregateProjects(providers);
  return c.json(projects);
});
