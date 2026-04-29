import { Hono } from "hono";
import { createSearchQuery, searchAllProviders, } from "@sc/core";
export const searchRoutes = new Hono();
searchRoutes.get("/", async (c) => {
    const providers = c.get("providers");
    const q = c.req.query("q");
    if (!q)
        return c.json({ error: "Query parameter 'q' is required" }, 400);
    const searchQuery = createSearchQuery(q, {
        limit: parseInt(c.req.query("limit") || "50", 10),
        providers: c.req.query("provider")
            ? c.req.query("provider").split(",")
            : undefined,
        messageType: c.req.query("type"),
    });
    const results = await searchAllProviders(searchQuery, providers);
    return c.json(results);
});
//# sourceMappingURL=search.js.map