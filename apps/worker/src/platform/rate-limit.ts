import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { problem, Problems } from "./problem";

async function digest(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getEffectiveRateLimitSalt(env: Env): string | null {
  if (env.RATE_LIMIT_SALT && env.RATE_LIMIT_SALT.trim() !== "") {
    return env.RATE_LIMIT_SALT.trim();
  }
  // Fail closed in production or staging if secret is missing
  if (env.APP_ENV === "production" || env.APP_ENV === "staging") {
    return null;
  }
  // Local development fallback
  return "myqsl-salt-default";
}

export async function enforceLookupLimit(c: Context<any>, call: string): Promise<Response | null> {
  const salt = getEffectiveRateLimitSalt(c.env);
  if (!salt) {
    return problem(
      503,
      Problems.serviceUnavailable,
      "Service Unavailable",
      "Rate limit service configuration unavailable",
      c.req.path
    );
  }

  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = await digest(`${salt}|${day}|${ip}`);
  const callHash = await digest(`${salt}|${call.trim().toUpperCase()}`);
  const key = await digest(`/api/v1/public/card-lookup|${ipHash}|${callHash}`);
  if (c.env.PUBLIC_RATE_LIMITER) {
    const result = await c.env.PUBLIC_RATE_LIMITER.limit({ key });
    if (!result.success) {
      return problem(429, Problems.rateLimited, "Too many requests", "Public lookup rate limit exceeded", c.req.path);
    }
  }
  return null;
}

export const enforcePublicLimit: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const salt = getEffectiveRateLimitSalt(c.env);
  if (!salt) {
    return problem(
      503,
      Problems.serviceUnavailable,
      "Service Unavailable",
      "Rate limit service configuration unavailable",
      c.req.path
    );
  }

  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const key = await digest(`${salt}|${ip}`);
  if (c.env.PUBLIC_RATE_LIMITER) {
    const result = await c.env.PUBLIC_RATE_LIMITER.limit({ key });
    if (!result.success) {
      return problem(429, Problems.rateLimited, "Too many requests", "Public rate limit exceeded", c.req.path);
    }
  }
  await next();
};

