import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { problem, Problems } from "./problem";

async function digest(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceLookupLimit(c: Context<any>, call: string): Promise<Response | null> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const salt = c.env.RATE_LIMIT_SALT ?? "myqsl-salt-default";
  const ipHash = await digest(`${salt}|${day}|${ip}`);
  const callHash = await digest(`${salt}|${call.trim().toUpperCase()}`);
  const key = await digest(`/api/v1/public/card-lookup|${ipHash}|${callHash}`);
  const result = await c.env.PUBLIC_RATE_LIMITER.limit({ key });
  if (!result.success) {
    return problem(429, Problems.rateLimited, "Too many requests", "Public lookup rate limit exceeded", c.req.path);
  }
  return null;
}

export const enforcePublicLimit: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const salt = c.env.RATE_LIMIT_SALT ?? "myqsl-salt-default";
  const key = await digest(`${salt}|${ip}`);
  const result = await c.env.PUBLIC_RATE_LIMITER.limit({ key });
  if (!result.success) {
    return problem(429, Problems.rateLimited, "Too many requests", "Public lookup rate limit exceeded", c.req.path);
  }
  await next();
};
