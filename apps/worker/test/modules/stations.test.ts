import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ownerHeaders = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };

describe("station management", () => {
  it("allows only one default station", async () => {
    const first = await exports.default.fetch("https://example.test/api/v1/stations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ callsign: "BA4RC", is_default: true })
    });
    const second = await exports.default.fetch("https://example.test/api/v1/stations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ callsign: "BG4YYY", is_default: true })
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const list = await exports.default.fetch("https://example.test/api/v1/stations", { headers: ownerHeaders });
    const rows = (await list.json()) as { data: Array<{ is_default: boolean }> };
    expect(rows.data.filter((row) => row.is_default)).toHaveLength(1);
  });
});
