import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { PrintPreflightError, preflight, renderPdf } from "../src";
import type { PrintManifestV1 } from "@myqsl/domain";

const template = { schema_version: 1, base_width: 1264, base_height: 848, elements: [{ type: "text", x: 0.1, y: 0.2, field: "call", font: "Inter", font_size: 32, color: "#000000", align: "left" }] };
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
});
