import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "../apps/worker/src/platform/origin";
import type { Env } from "../apps/worker/src/env";

const baseEnv: Env = {
  DB: {} as any,
  MEDIA: {} as any,
  ASSETS: {} as any,
  PUBLIC_RATE_LIMITER: {} as any,
  APP_ENV: "production",
  PUBLIC_ORIGIN: "https://myqsl.app",
  ACCESS_TEAM_DOMAIN: "https://myqsl.cloudflareaccess.com",
  ACCESS_AUD: "test-aud",
  D1_BACKUP_WORKFLOW: {} as any
};

describe("isAllowedOrigin logic", () => {
  it("rejects null or empty origin", () => {
    expect(isAllowedOrigin(null, "https://myqsl.app", baseEnv)).toBe(false);
    expect(isAllowedOrigin("", "https://myqsl.app", baseEnv)).toBe(false);
  });

  it("accepts configured PUBLIC_ORIGIN", () => {
    expect(isAllowedOrigin("https://myqsl.app", "https://anything.com", baseEnv)).toBe(true);
  });

  it("accepts same-origin requests matching the request origin", () => {
    expect(
      isAllowedOrigin("https://myqsl-prod.zhangneil.workers.dev", "https://myqsl-prod.zhangneil.workers.dev", baseEnv)
    ).toBe(true);
    expect(
      isAllowedOrigin("https://myqsl.pages.dev", "https://myqsl.pages.dev", baseEnv)
    ).toBe(true);
    expect(
      isAllowedOrigin("https://custom-domain.org", "https://custom-domain.org", baseEnv)
    ).toBe(true);
  });

  it("accepts Cloudflare deployment domains (*.workers.dev and *.pages.dev)", () => {
    expect(
      isAllowedOrigin("https://myqsl.workers.dev", "https://api.myqsl.app", baseEnv)
    ).toBe(true);
    expect(
      isAllowedOrigin("https://branch-preview-123.pages.dev", "https://api.myqsl.app", baseEnv)
    ).toBe(true);
  });

  it("rejects untrusted third-party origins", () => {
    expect(
      isAllowedOrigin("https://evil.example", "https://myqsl.app", baseEnv)
    ).toBe(false);
    expect(
      isAllowedOrigin("https://attacker.com", "https://myqsl-prod.workers.dev", baseEnv)
    ).toBe(false);
  });

  it("allows localhost and 127.0.0.1 on any port in local/test environment", () => {
    const localEnv: Env = { ...baseEnv, APP_ENV: "local" };
    expect(isAllowedOrigin("http://localhost:5173", "http://127.0.0.1:8787", localEnv)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000", "http://127.0.0.1:8787", localEnv)).toBe(true);
    expect(isAllowedOrigin("http://localhost:8787", "http://localhost:8787", localEnv)).toBe(true);
  });

  it("rejects localhost in production environment", () => {
    expect(isAllowedOrigin("http://localhost:5173", "https://myqsl.app", baseEnv)).toBe(false);
  });

  it("supports extra ALLOWED_ORIGINS", () => {
    const customEnv: Env = { ...baseEnv, ALLOWED_ORIGINS: "https://staging.myqsl.internal, https://extra.com" };
    expect(isAllowedOrigin("https://staging.myqsl.internal", "https://myqsl.app", customEnv)).toBe(true);
    expect(isAllowedOrigin("https://extra.com", "https://myqsl.app", customEnv)).toBe(true);
    expect(isAllowedOrigin("https://other.com", "https://myqsl.app", customEnv)).toBe(false);
  });
});
