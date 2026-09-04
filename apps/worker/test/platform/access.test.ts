import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("owner security boundary", () => {
  it("rejects an owner request when Access assertion is missing", async () => {
    const response = await exports.default.fetch("https://example.test/api/v1/qsos");
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("strictly rejects X-EQSR-Test-Actor when APP_ENV is production", async () => {
    const originalEnv = env.APP_ENV;
    try {
      (env as any).APP_ENV = "production";
      const response = await exports.default.fetch("http://localhost:8787/api/v1/qsos", {
        headers: {
          "Content-Type": "application/json",
          "X-EQSR-Test-Actor": "attacker",
          "X-EQSR-Request": "1"
        }
      });
      expect(response.status).toBe(401);
    } finally {
      (env as any).APP_ENV = originalEnv;
    }
  });
});
