import { Hono } from "hono";
import {
  createSearchQuery,
  searchAllProviders,
  type ProviderId,
  type SessionProvider,
} from "@sc/core";
import type { AppVariables } from "../index.js";

export const searchRoutes = new Hono<{ Variables: AppVariables }>();

searchRoutes.get("/", async (c) => {
  const providers = c.get("providers") as SessionProvider[];

  const q = c.req.query("q");
  if (!q) return c.json({ error: "Query parameter 'q' is required" }, 400);

  const searchQuery = createSearchQuery(q, {
    limit: parseInt(c.req.query("limit") || "50", 10),
    providers: c.req.query("provider")
      ? (c.req.query("provider")!.split(",") as ProviderId[])
      : undefined,
    messageType: c.req.query("type") as
      | "user"
      | "assistant"
      | "system"
      | undefined,
  });

  const results = await searchAllProviders(searchQuery, providers);
  return c.json(results);
});
