import { describe, expect, it, vi } from "vitest";
import { getEffectiveRateLimitSalt, enforceLookupLimit, enforcePublicLimit } from "../../src/platform/rate-limit";
import type { Env } from "../../src/env";

describe("Rate limit and salt fail-closed security", () => {
  it("getEffectiveRateLimitSalt returns salt when configured", () => {
    const env = { RATE_LIMIT_SALT: "custom-secret-salt", APP_ENV: "production" } as Env;
    expect(getEffectiveRateLimitSalt(env)).toBe("custom-secret-salt");
  });

  it("getEffectiveRateLimitSalt returns null (fail-closed) in production when missing or empty", () => {
    expect(getEffectiveRateLimitSalt({ APP_ENV: "production" } as Env)).toBeNull();
    expect(getEffectiveRateLimitSalt({ APP_ENV: "production", RATE_LIMIT_SALT: "   " } as Env)).toBeNull();
    expect(getEffectiveRateLimitSalt({ APP_ENV: "staging" } as Env)).toBeNull();
  });

  it("getEffectiveRateLimitSalt falls back to default in local dev only", () => {
    expect(getEffectiveRateLimitSalt({ APP_ENV: "local" } as Env)).toBe("myqsl-salt-default");
    expect(getEffectiveRateLimitSalt({} as Env)).toBe("myqsl-salt-default");
  });

  it("enforceLookupLimit returns 503 when salt is missing in production", async () => {
    const fakeContext = {
      env: { APP_ENV: "production" } as Env,
      req: {
        path: "/api/v1/public/card-lookup",
        header: () => "1.2.3.4"
      }
    };
    const res = await enforceLookupLimit(fakeContext as any, "BA4RC");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const body = await res!.json();
    expect(body.title).toBe("Service Unavailable");
  });

  it("enforcePublicLimit returns 503 when salt is missing in production", async () => {
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };
    const fakeContext = {
      env: { APP_ENV: "production" } as Env,
      req: {
        path: "/api/v1/public/cards/abc/image",
        header: () => "1.2.3.4"
      }
    };
    const res = await enforcePublicLimit(fakeContext as any, next);
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    expect(res!.status).toBe(503);
  });

  it("enforcePublicLimit returns 429 when rate limit is exceeded", async () => {
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };
    const fakeContext = {
      env: {
        APP_ENV: "local",
        RATE_LIMIT_SALT: "salt",
        PUBLIC_RATE_LIMITER: {
          limit: async () => ({ success: false })
        }
      } as unknown as Env,
      req: {
        path: "/api/v1/public/cards/abc",
        header: () => "1.2.3.4"
      }
    };
    const res = await enforcePublicLimit(fakeContext as any, next);
    expect(nextCalled).toBe(false);
    expect(res).toBeDefined();
    expect(res!.status).toBe(429);
    const body = await res!.json();
    expect(body.status).toBe(429);
  });
});
