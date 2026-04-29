import { Hono } from "hono";
import { aggregateProjects } from "@sc/core";
export const projectRoutes = new Hono();
projectRoutes.get("/", async (c) => {
    const providers = c.get("providers");
    const projects = await aggregateProjects(providers);
    return c.json(projects);
});
//# sourceMappingURL=projects.js.map