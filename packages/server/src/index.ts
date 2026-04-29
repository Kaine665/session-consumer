import { Hono } from "hono";
import type { SessionProvider } from "@sc/core";
import {
  ClaudeCodeProvider,
  CodexProvider,
  CursorProvider,
  GeminiProvider,
  OpenCodeProvider,
  MyAgentsProvider,
} from "@sc/core";
import { projectRoutes } from "./routes/projects.js";
import { sessionRoutes } from "./routes/sessions.js";
import { searchRoutes } from "./routes/search.js";

export interface AppVariables {
  providers: SessionProvider[];
}

const providers = [
  ClaudeCodeProvider,
  CodexProvider,
  CursorProvider,
  GeminiProvider,
  OpenCodeProvider,
  MyAgentsProvider,
];

const app = new Hono<{ Variables: AppVariables }>();

// Inject providers into context
app.use("*", async (c, next) => {
  c.set("providers", providers);
  await next();
});

app.route("/api/projects", projectRoutes);
app.route("/api/sessions", sessionRoutes);
app.route("/api/search", searchRoutes);

app.get("/api/health", (c) => c.json({ status: "ok", providers: providers.filter((p) => p.detect()).map((p) => p.id) }));

const port = parseInt(process.env.PORT || "3727", 10);
console.log(`SC server listening on http://localhost:${port}`);
console.log(`Health check: http://localhost:${port}/api/health`);

export default { port, fetch: app.fetch };
