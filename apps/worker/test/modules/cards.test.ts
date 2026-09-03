import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const headers = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };

async function owner(path: string, init: RequestInit = {}) { return exports.default.fetch(`https://example.test${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } }); }

describe("card lifecycle", () => {
  it("creates a snapshot, attaches immutable PNG and publishes it", async () => {
    await owner("/api/v1/stations", { method: "POST", body: JSON.stringify({ callsign: "BA4RC", is_default: true }) });
    const qso = await owner("/api/v1/qsos", { method: "POST", body: JSON.stringify({ station_callsign: "BA4RC", call: "BG4YYY", qso_date: "20260903", time_on: "1430", band: "40M", mode: "SSB", comment: "private" }) });
    const qsoId = (await qso.json() as { data: { id: number } }).data.id;
    const template = await owner("/api/v1/templates", { method: "POST", body: JSON.stringify({ name: "test", schema_version: 1, base_width: 100, base_height: 100, elements: [] }) });
    const templateId = (await template.json() as { data: { id: number } }).data.id;
    const draft = await owner("/api/v1/cards", { method: "POST", body: JSON.stringify({ qso_id: qsoId, template_id: templateId }) });
    expect(draft.status).toBe(201);
    const card = (await draft.json() as { data: { id: string; public_id: string } }).data;
    const png = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
    const attached = await owner(`/api/v1/cards/${card.id}/image`, { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
    expect(attached.status).toBe(200);
    const published = await owner(`/api/v1/cards/${card.id}/publish`, { method: "POST" });
    expect(published.status).toBe(200);
  });
});
