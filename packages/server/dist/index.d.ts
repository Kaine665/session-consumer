import type { SessionProvider } from "@sc/core";
export interface AppVariables {
    providers: SessionProvider[];
}
declare const _default: {
    port: number;
    fetch: (request: Request, Env?: unknown, executionCtx?: import("hono").ExecutionContext) => Response | Promise<Response>;
};
export default _default;
//# sourceMappingURL=index.d.ts.map