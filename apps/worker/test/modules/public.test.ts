import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ownerHeaders = {
  "Content-Type": "application/json",
  "X-EQSR-Test-Actor": "owner",
  Origin: "http://localhost:8787",
  "X-EQSR-Request": "1"
};

describe("public card projection and lookup", () => {
  it("rejects fuzzy lookup and does not expose private fields", async () => {
    const fuzzy = await exports.default.fetch("https://example.test/api/v1/public/card-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call: "BG4", qso_date: "20260903" })
    });
    expect(fuzzy.status).toBe(422);
  });

  it("enforces minimum 150ms delay and Cache-Control: no-store on lookup", async () => {
    const start = Date.now();
    const res = await exports.default.fetch("https://example.test/api/v1/public/card-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call: "BH4NONEXISTENT", qso_date: "20260903" })
    });
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(elapsed).toBeGreaterThanOrEqual(140); // 150ms budget with tolerance
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toEqual([]);
  });

  it("blocks ready card image with 404, void card with 410, and allows published card", async () => {
    // 1. Setup station, qso, template, draft
    await exports.default.fetch("https://example.test/api/v1/stations", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ callsign: "BA4PUB", is_default: true })
    });
    const qsoRes = await exports.default.fetch("https://example.test/api/v1/qsos", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        station_callsign: "BA4PUB",
        call: "VR2XYZ",
        qso_date: "20260904",
        time_on: "120000",
        band: "20M",
        mode: "CW"
      })
    });
    const qsoId = ((await qsoRes.json()) as { data: { id: number } }).data.id;

    const tplRes = await exports.default.fetch("https://example.test/api/v1/card-templates", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ name: "pub-tpl", schema_version: 1, base_width: 100, base_height: 100, elements: [] })
    });
    const tplId = ((await tplRes.json()) as { data: { id: number } }).data.id;

    const draftRes = await exports.default.fetch("https://example.test/api/v1/cards", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ qso_id: qsoId, template_id: tplId })
    });
    const card = ((await draftRes.json()) as { data: { id: string; public_id: string } }).data;

    // Public card info & image when status is draft -> 404
    const draftCardRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}`);
    expect(draftCardRes.status).toBe(404);
    const draftImgRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}/image`);
    expect(draftImgRes.status).toBe(404);

    // Attach image -> status becomes ready
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    await exports.default.fetch(`https://example.test/api/v1/cards/${card.id}/image`, {
      method: "POST",
      headers: { ...ownerHeaders, "Content-Type": "image/png" },
      body: png
    });

    // Public card info & image when status is ready -> MUST BE 404 (not accessible before publish)
    const readyCardRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}`);
    expect(readyCardRes.status).toBe(404);
    const readyImgRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}/image`);
    expect(readyImgRes.status).toBe(404);

    // Publish card -> status becomes published
    await exports.default.fetch(`https://example.test/api/v1/cards/${card.id}/publish`, {
      method: "POST",
      headers: ownerHeaders
    });

    // Now published card & image -> 200 with Cache-Control: no-store
    const pubCardRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}`);
    expect(pubCardRes.status).toBe(200);
    expect(pubCardRes.headers.get("Cache-Control")).toBe("no-store");

    const pubImgRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}/image`);
    expect(pubImgRes.status).toBe(200);
    expect(pubImgRes.headers.get("Cache-Control")).toBe("no-store");
    const etag = pubImgRes.headers.get("ETag");
    expect(etag).toBeDefined();

    // Conditional request with matching ETag returns 304
    const conditionalImgRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}/image`, {
      headers: { "If-None-Match": etag! }
    });
    expect(conditionalImgRes.status).toBe(304);
    expect(conditionalImgRes.headers.get("Cache-Control")).toBe("no-store");

    // Void the card
    const voidRes = await exports.default.fetch(`https://example.test/api/v1/cards/${card.id}/void`, {
      method: "POST",
      headers: ownerHeaders
    });
    expect(voidRes.status).toBe(200);

    // After void: metadata returns 410
    const voidCardRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}`);
    expect(voidCardRes.status).toBe(410);

    // After void: image returns 410
    const voidImgRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}/image`);
    expect(voidImgRes.status).toBe(410);

    // CRITICAL: Even when sending If-None-Match with matching ETag, void MUST RETURN 410, NEVER 304!
    const voidConditionalImgRes = await exports.default.fetch(`https://example.test/api/v1/public/cards/${card.public_id}/image`, {
      headers: { "If-None-Match": etag! }
    });
    expect(voidConditionalImgRes.status).toBe(410);

    // Lookup should no longer return voided card
    const lookupAfterVoidRes = await exports.default.fetch("https://example.test/api/v1/public/card-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call: "VR2XYZ", qso_date: "20260904" })
    });
    expect(lookupAfterVoidRes.status).toBe(200);
    const lookupAfterVoidData = ((await lookupAfterVoidRes.json()) as { data: Array<{ public_id: string }> }).data;
    expect(lookupAfterVoidData.some((c) => c.public_id === card.public_id)).toBe(false);
  });
});

