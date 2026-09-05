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

  it("verifies all canonical OpenAPI routes are mounted and active (no 404 route drift)", async () => {
    // List of canonical endpoints with test parameters
    const routesToTest = [
      { path: "/api/v1/qsos", method: "GET", auth: true },
      { path: "/api/v1/qsos/999999", method: "PATCH", auth: true, body: { version: 1 } },
      { path: "/api/v1/qsos/999999/restore", method: "POST", auth: true },
      { path: "/api/v1/stations", method: "GET", auth: true },
      { path: "/api/v1/card-templates", method: "GET", auth: true },
      { path: "/api/v1/card-templates/999999", method: "GET", auth: true },
      { path: "/api/v1/card-templates/999999", method: "PATCH", auth: true, body: { version: 1 } },
      { path: "/api/v1/card-templates/999999/background", method: "GET", auth: true },
      { path: "/api/v1/cards", method: "GET", auth: true },
      { path: "/api/v1/cards/nonexistent/image", method: "POST", auth: true },
      { path: "/api/v1/cards/nonexistent/publish", method: "POST", auth: true },
      { path: "/api/v1/cards/nonexistent/void", method: "POST", auth: true },
      { path: "/api/v1/public/card-lookup", method: "POST", auth: false, body: { call: "VR2XYZ", qso_date: "20260904" } },
      { path: "/api/v1/public/cards/nonexistent", method: "GET", auth: false },
      { path: "/api/v1/public/cards/nonexistent/image", method: "GET", auth: false },
      { path: "/api/v1/backups", method: "GET", auth: true },
      { path: "/api/v1/backups/run", method: "POST", auth: true }
    ];

    for (const r of routesToTest) {
      const res = await exports.default.fetch(`https://example.test${r.path}`, {
        method: r.method,
        headers: r.auth ? ownerHeaders : { "Content-Type": "application/json" },
        body: r.body ? JSON.stringify(r.body) : undefined
      });

      // Assert that route was recognized: NOT 404 (Route not found / problem: Problems.notFound)
      // Note: non-existent entity may return 404 "Not found", but NOT route-level 404 "API route not found"
      if (res.status === 404) {
        const body = (await res.json().catch(() => ({}))) as any;
        expect(body.detail).not.toBe("API route not found");
      }
    }
  });
});

