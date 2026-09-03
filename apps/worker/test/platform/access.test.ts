import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("owner security boundary", () => {
  it("rejects an owner request when Access assertion is missing", async () => {
    const response = await exports.default.fetch("https://example.test/api/v1/qsos");
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });
});
