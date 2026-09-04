import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ownerHeaders = {
  "Content-Type": "application/json",
  "X-EQSR-Test-Actor": "owner",
  Origin: "http://localhost:8787",
  "X-EQSR-Request": "1"
};

describe("Canonical API Contracts", () => {
  it("rejects legacy drifted routes with 404", async () => {
    const oldLookup = await exports.default.fetch("https://example.test/api/v1/public/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call: "BG4YYY", qso_date: "20260903" })
    });
    expect(oldLookup.status).toBe(404);

    const oldTemplatesGet = await exports.default.fetch("https://example.test/api/v1/templates", {
      method: "GET",
      headers: ownerHeaders
    });
    expect(oldTemplatesGet.status).toBe(404);

    const oldTemplatesPost = await exports.default.fetch("https://example.test/api/v1/templates", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ name: "legacy", schema_version: 1, base_width: 100, base_height: 100, elements: [] })
    });
    expect(oldTemplatesPost.status).toBe(404);
  });

  it("requires authentication for canonical protected routes", async () => {
    const unauthTemplates = await exports.default.fetch("https://example.test/api/v1/card-templates", {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    expect(unauthTemplates.status).toBe(401);

    const unauthCards = await exports.default.fetch("https://example.test/api/v1/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qso_id: 1, template_id: 1 })
    });
    expect(unauthCards.status).toBe(401);
  });

  it("exposes canonical public lookup route without auth", async () => {
    const invalidBody = await exports.default.fetch("https://example.test/api/v1/public/card-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call: "bad" })
    });
    // Should be 422 (validation error), NOT 401 (auth) and NOT 404 (not found)
    expect(invalidBody.status).toBe(422);
  });
});
