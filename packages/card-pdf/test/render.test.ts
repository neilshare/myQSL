import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { PrintPreflightError, preflight, renderPdf } from "../src";
import type { PrintManifestV1 } from "@myqsl/domain";

const template = { schema_version: 1, base_width: 1264, base_height: 848, elements: [{ type: "text", x: 0.1, y: 0.2, field: "call", font: "Inter", font_size: 32, color: "#000000", align: "left" }] };
const templateV2 = { schema_version: 2, base_width: 1400, base_height: 900, trim: { width_mm: 140, height_mm: 90 }, bleed_mm: 3, safe_mm: 5, background: "#F4EBDD", font_manifest_version: "fonts-2026-09-14", preset: { id: "classic-dx", version: 1 }, elements: [{ type: "text", id: "call", name: "Call", x_mm: 15, y_mm: 33, width_mm: 75, height_mm: 18, locked: false, visible: true, source: { kind: "qso", field: "call" }, font_id: "ibm-plex-mono-600", size_pt: 32, min_size_pt: 24, color: "#15344B", align: "left", fit: "shrink", required: true }] };
const manifest = (count = 5, profile: PrintManifestV1["profile"] = "a4-four-up-v1"): PrintManifestV1 => ({ schema_version: 1, batch_id: "batch-1", kind: "qso", profile, renderer_version: "pdf-v1", font_manifest_version: "fonts-v1", items: Array.from({ length: count }, (_, position) => ({ position, qso_id: position + 1, card_id: null, snapshot_json: JSON.stringify({ qso: { call: `K1ABC${position}` }, template }), snapshot_hash: "a".repeat(64), background_asset_id: null, background_sha256: null, public_url: null, qr_omitted: true })), manifest_hash: "b".repeat(64), created_at: 1, expires_at: Date.now() + 60_000 });

describe("vector card PDF", () => {
  it("lays out four cards per landscape A4 and carries remaining cards to the next page", async () => {
    const result = await renderPdf(manifest(), new Map());
    expect(result.report.page_count).toBe(2);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(297 * 72 / 25.4, 3);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(210 * 72 / 25.4, 3);
  });

  it("creates the single-card bleed page and reports cancellation", async () => {
    const bleed = await renderPdf(manifest(1, "single-bleed-v1"), new Map());
    const pdf = await PDFDocument.load(bleed.bytes);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(146 * 72 / 25.4, 3);
    const controller = new AbortController();
    controller.abort();
    await expect(renderPdf(manifest(1), new Map(), { signal: controller.signal })).rejects.toThrow(/cancel/i);
  });

  it("blocks expired manifests and limits oversized background sets", () => {
    const expired = manifest(1); expired.expires_at = 1;
    expect(preflight(expired, new Map()).ok).toBe(false);
    const tooMany = manifest(1); tooMany.items[0].background_asset_id = "missing";
    expect(() => { if (!preflight(tooMany, new Map()).ok) throw new PrintPreflightError(preflight(tooMany, new Map())); }).toThrow(PrintPreflightError);
  });

  it("renders a frozen V2 scene from the manifest snapshot", async () => {
    const input = manifest(1, "single-bleed-v1");
    input.renderer_version = "pdf-v2";
    input.font_manifest_version = "fonts-2026-09-14";
    input.items[0].snapshot_json = JSON.stringify({ qso: { call: "JA1ABC" }, template: templateV2 });
    input.items[0].template_schema_version = 2;
    const result = await renderPdf(input, new Map());
    expect(result.report.ok).toBe(true);
    expect((await PDFDocument.load(result.bytes)).getPage(0).getWidth()).toBeCloseTo(146 * 72 / 25.4, 3);
  });
});
