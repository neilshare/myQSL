import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { problem, Problems } from "./problem";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isAllowedOrigin(origin: string | null, requestOrigin: string | null, env: Env): boolean {
  if (!origin) return false;

  // 1. Configured public origin (e.g. https://myqsl.app)
  if (env.PUBLIC_ORIGIN && origin === env.PUBLIC_ORIGIN) {
    return true;
  }

  // 2. Exact same origin as current request URL (same scheme + host + port)
  if (requestOrigin && origin === requestOrigin) {
    return true;
  }

  // 3. Optional comma-separated list of additional allowed origins via env
  const extraOrigins = (env as any).ALLOWED_ORIGINS;
  if (typeof extraOrigins === "string") {
    const list = extraOrigins.split(",").map((s) => s.trim());
    if (list.includes(origin)) return true;
  }

  // 4. Cloudflare deployment domains (*.workers.dev and *.pages.dev)
  try {
    const parsed = new URL(origin);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname.endsWith(".workers.dev") || parsed.hostname.endsWith(".pages.dev"))
    ) {
      return true;
    }
  } catch {}

  // 5. Local development and testing (localhost and 127.0.0.1 on any port)
  const isLocalEnv = env.APP_ENV === "local" || (env as any).APP_ENV === "test";
  if (isLocalEnv) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  return false;
}

export const requireSameOrigin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (MUTATING_METHODS.has(c.req.method)) {
    const rawOrigin = c.req.header("Origin");
    let origin = rawOrigin ?? null;
    if (!origin) {
      const referer = c.req.header("Referer");
      if (referer) {
        try {
          origin = new URL(referer).origin;
        } catch {}
      }
    }

    let requestOrigin: string | null = null;
    try {
      requestOrigin = new URL(c.req.url).origin;
    } catch {}

    const marker = c.req.header("X-MYQSL-Request") ?? c.req.header("X-EQSR-Request");
    const allowed = isAllowedOrigin(origin, requestOrigin, c.env);

    if (!allowed || marker !== "1") {
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

