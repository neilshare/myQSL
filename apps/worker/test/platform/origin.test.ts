import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("same-origin mutation guard", () => {
  it("rejects a mutable cross-origin request", async () => {
    const response = await exports.default.fetch("https://example.test/api/v1/qsos", {
      method: "POST",
      headers: { Origin: "https://evil.example", "X-EQSR-Request": "1" },
      body: "{}"
    });
    expect(response.status).toBe(403);
  });
});
