import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const headers = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };

describe("public card projection", () => {
  it("rejects fuzzy lookup and does not expose private fields", async () => {
    const fuzzy = await exports.default.fetch("https://example.test/api/v1/public/lookup", { method: "POST", headers, body: JSON.stringify({ call: "BG4", qso_date: "20260903" }) });
    expect(fuzzy.status).toBe(422);
  });
});
