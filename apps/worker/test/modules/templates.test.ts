import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const headers = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };

describe("template API", () => {
  it("rejects absolute coordinates and stores a valid template", async () => {
    const invalid = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers, body: JSON.stringify({ name: "bad", schema_version: 1, base_width: 1264, base_height: 848, elements: [{ type: "text", x: 120, y: 0.5, field: "call" }] }) });
    expect(invalid.status).toBe(422);
    const valid = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers, body: JSON.stringify({ name: "clean", schema_version: 1, base_width: 1264, base_height: 848, elements: [{ type: "text", x: 0.5, y: 0.5, field: "call" }] }) });
    expect(valid.status).toBe(201);
  });
});
