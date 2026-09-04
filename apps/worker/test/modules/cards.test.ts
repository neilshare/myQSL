import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const headers = {
  "Content-Type": "application/json",
  "X-EQSR-Test-Actor": "owner",
  Origin: "http://localhost:8787",
  "X-EQSR-Request": "1"
};

async function owner(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`https://example.test${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) }
  });
}

describe("card lifecycle and state machine", () => {
  it("enforces strict four-state transition, idempotency, and voiding", async () => {
    await owner("/api/v1/stations", {
      method: "POST",
      body: JSON.stringify({ callsign: "BA4SM", is_default: true })
    });
    const qso = await owner("/api/v1/qsos", {
      method: "POST",
      body: JSON.stringify({
        station_callsign: "BA4SM",
        call: "BD4ZZZ",
        qso_date: "20260904",
        time_on: "1500",
        band: "20M",
        mode: "FT8"
      })
    });
    const qsoId = ((await qso.json()) as { data: { id: number } }).data.id;
    const template = await owner("/api/v1/card-templates", {
      method: "POST",
      body: JSON.stringify({ name: "sm-tpl", schema_version: 1, base_width: 100, base_height: 100, elements: [] })
    });
    const templateId = ((await template.json()) as { data: { id: number } }).data.id;

    // 1. Create Draft
    const draftRes = await owner("/api/v1/cards", {
      method: "POST",
      body: JSON.stringify({ qso_id: qsoId, template_id: templateId })
    });
    expect(draftRes.status).toBe(201);
    const card = ((await draftRes.json()) as { data: { id: string; status: string } }).data;
    expect(card.status).toBe("draft");

    // Invalid transition: draft -> publish directly must return 409
    const directPublish = await owner(`/api/v1/cards/${card.id}/publish`, { method: "POST" });
    expect(directPublish.status).toBe(409);

    // Invalid transition: draft -> void directly must return 409
    const directVoid = await owner(`/api/v1/cards/${card.id}/void`, { method: "POST" });
    expect(directVoid.status).toBe(409);

    // 2. Attach Image -> ready
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const attachRes = await owner(`/api/v1/cards/${card.id}/image`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png
    });
    expect(attachRes.status).toBe(200);
    const readyCard = ((await attachRes.json()) as { data: { status: string } }).data;
    expect(readyCard.status).toBe("ready");

    // Invalid transition: ready -> void directly must return 409
    const readyVoid = await owner(`/api/v1/cards/${card.id}/void`, { method: "POST" });
    expect(readyVoid.status).toBe(409);

    // 3. Publish -> published
    const pubRes = await owner(`/api/v1/cards/${card.id}/publish`, { method: "POST" });
    expect(pubRes.status).toBe(200);
    const pubCard = ((await pubRes.json()) as { data: { status: string } }).data;
    expect(pubCard.status).toBe("published");

    // Idempotent publish: published -> publish must return 200
    const rePubRes = await owner(`/api/v1/cards/${card.id}/publish`, { method: "POST" });
    expect(rePubRes.status).toBe(200);

    // 4. Void -> void
    const voidRes = await owner(`/api/v1/cards/${card.id}/void`, { method: "POST" });
    expect(voidRes.status).toBe(200);
    const voidCard = ((await voidRes.json()) as { data: { status: string } }).data;
    expect(voidCard.status).toBe("void");

    // Idempotent void: void -> void must return 200
    const reVoidRes = await owner(`/api/v1/cards/${card.id}/void`, { method: "POST" });
    expect(reVoidRes.status).toBe(200);
  });

  it("lists cards with cursor pagination", async () => {
    const listRes = await owner("/api/v1/cards?limit=5");
    expect(listRes.status).toBe(200);
    const json = (await listRes.json()) as { data: unknown[]; next_cursor: string | null };
    expect(Array.isArray(json.data)).toBe(true);
  });
});
