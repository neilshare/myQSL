import { describe, expect, it } from "vitest";
import { compileCardScene, type BoundData, type FontMetrics, type FontRegistry } from "../src";
import type { TemplateV2 } from "@myqsl/domain";

const fonts: FontRegistry = new Map<string, FontMetrics>([
  ["ibm-plex-mono-600", { width: (text, size) => text.length * size * 0.55, ascent: (size) => size * 0.75, hasGlyph: (codePoint) => codePoint !== "□".codePointAt(0) }],
  ["ibm-plex-mono-400", { width: (text, size) => text.length * size * 0.55, ascent: (size) => size * 0.75, hasGlyph: () => true }],
  ["noto-sans-sc-400", { width: (text, size) => text.length * size, ascent: (size) => size * 0.8, hasGlyph: () => true }]
]);

const data: BoundData = {
  qso: { station_callsign: "BH1AAA", call: "JA1ABC", qso_date: "20260914", time_on: "0830", band: "20M", freq_hz: 14074000, mode: "FT8", submode: "", rst_sent: "-10", rst_rcvd: "-08", my_grid: "OM89", public_id: "card-1" },
  publicUrl: "https://myqsl.example/c/card-1",
  proof: false
};

function template(elements: TemplateV2["elements"]): TemplateV2 {
  return { schema_version: 2, base_width: 1400, base_height: 900, trim: { width_mm: 140, height_mm: 90 }, bleed_mm: 3, safe_mm: 5, background: "#FFFFFF", font_manifest_version: "test-fonts", preset: null, elements };
}

const node = { id: "base", name: "元素", x_mm: 5, y_mm: 5, width_mm: 40, height_mm: 10, locked: false, visible: true };

describe("compileCardScene", () => {
  it("compiles text, rect, image and QR into backend-neutral primitives", () => {
    const scene = compileCardScene(template([
      { ...node, type: "rect", fill: "#E8EFF3" },
      { ...node, id: "call", name: "对方呼号", type: "text", source: { kind: "qso", field: "call" }, font_id: "ibm-plex-mono-600", size_pt: 18, min_size_pt: 12, color: "#15344B", align: "left", fit: "shrink", required: true },
      { ...node, id: "photo", name: "照片", type: "image", asset_id: "asset-1", crop: { x: 0, y: 0, width: 1, height: 1 } },
      { ...node, id: "qr", name: "二维码", type: "qr", x_mm: 110, y_mm: 60, width_mm: 22, height_mm: 22, source: "public_url", quiet_modules: 4 }
    ]), data, fonts);
    expect(scene.primitives.some((primitive) => primitive.type === "rect" && primitive.id === "base")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.type === "text" && primitive.text === "JA1ABC")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.type === "image" && primitive.assetId === "asset-1")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.id === "qr:quiet" && primitive.type === "rect")).toBe(true);
    expect(scene.primitives.some((primitive) => primitive.id.startsWith("qr:module:") && primitive.type === "rect")).toBe(true);
    expect(scene.issues).toEqual([]);
  });

  it("formats FT8 data and frequency without changing the QSO", () => {
    const scene = compileCardScene(template([{ ...node, type: "text", source: { kind: "qso", field: "freq_mhz" }, font_id: "ibm-plex-mono-400", size_pt: 9, min_size_pt: 7, color: "#15344B", align: "left", fit: "shrink", required: true }, { ...node, id: "mode", name: "模式", type: "text", source: { kind: "qso", field: "mode" }, font_id: "ibm-plex-mono-400", size_pt: 9, min_size_pt: 7, color: "#15344B", align: "left", fit: "shrink", required: true }]), data, fonts);
    expect(scene.primitives.filter((primitive) => primitive.type === "text").map((primitive) => primitive.text)).toEqual(["14.074", "FT8"]);
  });

  it("shrinks long callsigns, wraps Chinese text and reports missing glyphs", () => {
    const long = compileCardScene(template([{ ...node, width_mm: 10, type: "text", source: { kind: "qso", field: "call" }, font_id: "ibm-plex-mono-600", size_pt: 18, min_size_pt: 12, color: "#15344B", align: "left", fit: "shrink", required: true }]), { ...data, qso: { ...data.qso, call: "LONGCALLSIGN" } }, fonts);
    expect(long.issues.some((issue) => issue.code === "TEXT_OVERFLOW")).toBe(true);
    const wrapped = compileCardScene(template([{ ...node, id: "cn", name: "中文", width_mm: 15, height_mm: 12, type: "text", source: { kind: "literal", text: "北京无线电台" }, font_id: "noto-sans-sc-400", size_pt: 9, min_size_pt: 7, color: "#15344B", align: "left", fit: "wrap", required: false }]), data, fonts);
    expect(wrapped.primitives.filter((primitive) => primitive.type === "text").length).toBeGreaterThan(1);
    const missing = compileCardScene(template([{ ...node, id: "missing", name: "缺字", type: "text", source: { kind: "literal", text: "□" }, font_id: "ibm-plex-mono-600", size_pt: 9, min_size_pt: 7, color: "#15344B", align: "left", fit: "shrink", required: true }]), data, fonts);
    expect(missing.issues.some((issue) => issue.code === "FONT_MISSING_GLYPH")).toBe(true);
  });

  it("blocks a real card QR when public URL is missing, but permits a marked proof", () => {
    const noUrl = compileCardScene(template([{ ...node, type: "qr", source: "public_url", quiet_modules: 4 }]), { ...data, publicUrl: null }, fonts);
    expect(noUrl.issues.some((issue) => issue.code === "QR_URL_MISSING" && issue.level === "error")).toBe(true);
    const proof = compileCardScene(template([{ ...node, type: "qr", source: "public_url", quiet_modules: 4 }]), { ...data, publicUrl: null, proof: true }, fonts);
    expect(proof.issues.filter((issue) => issue.level === "error")).toEqual([]);
  });
});
