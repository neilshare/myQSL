import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { problem, Problems } from "./problem";

async function digest(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const enforcePublicLimit: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const call = (await c.req.query("call"))?.trim().toUpperCase() ?? "";
  const key = await digest(`${ip}|${call}`);
  const result = await c.env.PUBLIC_RATE_LIMITER.limit({ key });
  if (!result.success) {
    return problem(429, Problems.rateLimited, "Too many requests", "Public lookup rate limit exceeded", c.req.path);
  }
  await next();
};
