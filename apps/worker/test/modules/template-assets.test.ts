import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const jsonHeaders = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };
const png1x1 = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (value) => value.charCodeAt(0));

const v2Layout = (assetId: string) => ({
  schema_version: 2,
  base_width: 1400,
  base_height: 900,
  trim: { width_mm: 140, height_mm: 90 },
  bleed_mm: 3,
  safe_mm: 5,
  background: "#FFFFFF",
  font_manifest_version: "test-fonts",
  preset: null,
  elements: [{ id: "photo", name: "照片", type: "image", x_mm: 5, y_mm: 5, width_mm: 40, height_mm: 30, locked: false, visible: true, asset_id: assetId, crop: { x: 0, y: 0, width: 1, height: 1 } }]
});

describe("template asset API", () => {
  it("stores a validated immutable image without changing template version", async () => {
    const createRes = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name: "asset-owner", schema_version: 1, base_width: 1264, base_height: 848, elements: [] }) });
    expect(createRes.status).toBe(201);
    const created = ((await createRes.json()) as { data: { id: number; version: number } }).data;

    const upload = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}/assets`, {
      method: "POST",
      headers: { "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1", "Content-Type": "image/png" },
      body: png1x1
    });
    expect(upload.status).toBe(201);
    const asset = ((await upload.json()) as { data: { asset_id: string; template_id: number; mime: string; width: number; height: number; sha256: string } }).data;
    expect(asset.template_id).toBe(created.id);
    expect(asset.mime).toBe("image/png");
    expect(asset.width).toBe(1);
    expect(asset.height).toBe(1);
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u);

    const current = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}`, { method: "GET", headers: jsonHeaders });
    expect(((await current.json()) as { data: { version: number } }).data.version).toBe(created.version);
  });

  it("rejects a fake image and a reference to an asset owned by another template", async () => {
    const first = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name: "asset-first", schema_version: 1, base_width: 1264, base_height: 848, elements: [] }) });
    const second = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name: "asset-second", schema_version: 1, base_width: 1264, base_height: 848, elements: [] }) });
    const firstId = ((await first.json()) as { data: { id: number } }).data.id;
    const secondId = ((await second.json()) as { data: { id: number; version: number } }).data.id;

    const fake = await exports.default.fetch(`https://example.test/api/v1/card-templates/${firstId}/assets`, { method: "POST", headers: { "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "Content-Type": "image/png" }, body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) });
    expect(fake.status).toBe(422);

    const upload = await exports.default.fetch(`https://example.test/api/v1/card-templates/${firstId}/assets`, { method: "POST", headers: { "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "Content-Type": "image/png" }, body: png1x1 });
    const assetId = ((await upload.json()) as { data: { asset_id: string } }).data.asset_id;
    const patch = await exports.default.fetch(`https://example.test/api/v1/card-templates/${secondId}`, { method: "PATCH", headers: { ...jsonHeaders, "If-Match": '"1"' }, body: JSON.stringify({ layout: v2Layout(assetId) }) });
    expect(patch.status).toBe(422);
  });

  it("atomically saves a V2 layout and its template asset reference", async () => {
    const create = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name: "v2-asset-template", schema_version: 1, base_width: 1264, base_height: 848, elements: [] }) });
    const created = ((await create.json()) as { data: { id: number; version: number } }).data;
    const upload = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}/assets`, { method: "POST", headers: { "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1", "Content-Type": "image/png" }, body: png1x1 });
    const assetId = ((await upload.json()) as { data: { asset_id: string } }).data.asset_id;

    const patch = await exports.default.fetch(`https://example.test/api/v1/card-templates/${created.id}`, { method: "PATCH", headers: { ...jsonHeaders, "If-Match": '"1"' }, body: JSON.stringify({ layout: v2Layout(assetId) }) });
    expect(patch.status).toBe(200);
    const updated = ((await patch.json()) as { data: { version: number; schema_version: number; layout_json: string } }).data;
    expect(updated.version).toBe(2);
    expect(updated.schema_version).toBe(2);
    expect(JSON.parse(updated.layout_json).elements[0].asset_id).toBe(assetId);

    const reference = await env.DB.prepare("SELECT owner_kind, owner_id, asset_id FROM template_asset_refs WHERE owner_kind = 'template' AND owner_id = ? AND asset_id = ?").bind(String(created.id), assetId).first();
    expect(reference).toMatchObject({ owner_kind: "template", owner_id: String(created.id), asset_id: assetId });
  });

  it("replays an idempotent create and rejects the same key with a different request", async () => {
    const key = "template-create-idempotency-1";
    const body = JSON.stringify({ name: "same-template", schema_version: 1, base_width: 1264, base_height: 848, elements: [] });
    const first = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers: { ...jsonHeaders, "Idempotency-Key": key }, body });
    const second = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers: { ...jsonHeaders, "Idempotency-Key": key }, body });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(((await first.json()) as { data: { id: number } }).data.id).toBe(((await second.json()) as { data: { id: number } }).data.id);

    const conflict = await exports.default.fetch("https://example.test/api/v1/card-templates", { method: "POST", headers: { ...jsonHeaders, "Idempotency-Key": key }, body: JSON.stringify({ name: "different", schema_version: 1, base_width: 1264, base_height: 848, elements: [] }) });
    expect(conflict.status).toBe(409);
  });
});
