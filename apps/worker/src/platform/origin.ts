import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { problem, Problems } from "./problem";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const requireSameOrigin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (MUTATING_METHODS.has(c.req.method)) {
    const origin = c.req.header("Origin");
    const marker = c.req.header("X-MYQSL-Request") ?? c.req.header("X-EQSR-Request");
    const isLocalEnv = c.env.APP_ENV === "local" || (c.env as any).APP_ENV === "test";
    const isAllowedOrigin =
      origin === c.env.PUBLIC_ORIGIN ||
      (isLocalEnv && (origin === "http://127.0.0.1:8787" || origin === "http://localhost:8787"));
    if (!isAllowedOrigin || marker !== "1") {
      return problem(
        403,
        Problems.originForbidden,
        "Cross-origin request blocked",
        "Mutating requests must originate from the configured application origin",
        c.req.path
      );
    }
  }
  await next();
};
