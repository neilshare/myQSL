import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const headers = { "Content-Type": "application/json", "X-EQSR-Test-Actor": "owner", Origin: "http://localhost:8787", "X-EQSR-Request": "1" };
const layout = {
  schema_version: 2, base_width: 1400, base_height: 900, trim: { width_mm: 140, height_mm: 90 }, bleed_mm: 3, safe_mm: 5, background: "#F4EBDD", font_manifest_version: "fonts-2026-09-14", preset: { id: "classic-dx", version: 1 }, elements: [
    { type: "text", id: "call", name: "Call", x_mm: 15, y_mm: 33, width_mm: 75, height_mm: 18, locked: false, visible: true, source: { kind: "qso", field: "call" }, font_id: "ibm-plex-mono-600", size_pt: 32, min_size_pt: 24, color: "#15344B", align: "left", fit: "shrink", required: true },
    { type: "qr", id: "qr", name: "QR", x_mm: 111, y_mm: 61, width_mm: 24, height_mm: 24, locked: true, visible: true, source: "public_url", quiet_modules: 4 }
  ]
};

async function owner(path: string, init: RequestInit = {}) { return exports.default.fetch(`https://example.test${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } }); }

describe("V2 card snapshot freeze", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM template_asset_refs; DELETE FROM qsl_cards; DELETE FROM card_batches; DELETE FROM qsos; DELETE FROM stations; DELETE FROM card_templates;");
    await env.DB.prepare("INSERT INTO stations(id,callsign,is_default,created_at,updated_at) VALUES(?,?,?,?,?)").bind(1, "BI1ABC", 1, 1, 1).run();
    await env.DB.prepare("INSERT INTO qsos(id,station_id,station_callsign,call,qso_date,time_on,qso_at,band,mode,adif_extra_json,dedupe_key,duplicate_ordinal,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(1, 1, "BI1ABC", "JA1ABC", "20260914", "083000", 1, "20M", "FT8", "{}", "snapshot-v2", 0, "manual", 1, 1).run();
    await env.DB.prepare("INSERT INTO card_templates(id,name,schema_version,base_width,base_height,layout_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(1, "v2", 2, 1400, 900, JSON.stringify(layout), 1, 1, 1).run();
  });

  it("freezes the V2 layout, QSO and renderer before source records change", async () => {
    const created = await owner("/api/v1/cards", { method: "POST", body: JSON.stringify({ qso_id: 1, template_id: 1 }) });
    expect(created.status).toBe(201);
    const card = ((await created.json()) as { data: { id: string; render_version: string; template_snapshot_json: string; qso_snapshot_json: string } }).data;
    expect(card.render_version).toBe("canvas-v2");
    await env.DB.prepare("UPDATE card_templates SET layout_json=?,version=version+1 WHERE id=1").bind(JSON.stringify({ ...layout, background: "#000000" })).run();
    await env.DB.prepare("UPDATE qsos SET call=? WHERE id=1").bind("CHANGED").run();
    const fetched = await owner(`/api/v1/cards/${card.id}`);
    const frozen = ((await fetched.json()) as { data: typeof card }).data;
    expect(frozen.template_snapshot_json).toContain("#F4EBDD");
    expect(frozen.qso_snapshot_json).toContain("JA1ABC");
    expect(frozen.qso_snapshot_json).not.toContain("CHANGED");
  });

  it("freezes V2 snapshots for batch cards", async () => {
    const response = await owner("/api/v1/card-batches", { method: "POST", headers: { ...headers, "Idempotency-Key": "batch-v2" }, body: JSON.stringify({ qso_ids: [1], template_id: 1, template_version: 1 }) });
    expect(response.status).toBe(201);
    const batch = ((await response.json()) as { data: { card_ids: string[] } }).data;
    const card = await env.DB.prepare("SELECT render_version,template_snapshot_json FROM qsl_cards WHERE id=?").bind(batch.card_ids[0]).first<{ render_version: string; template_snapshot_json: string }>();
    expect(card?.render_version).toBe("canvas-v2");
    expect(card?.template_snapshot_json).toContain("fonts-2026-09-14");
  });
});
