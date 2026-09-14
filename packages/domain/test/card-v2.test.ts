import { describe, expect, it } from "vitest";
import { AnyCardTemplateSchema, CardTemplateV2Schema, normalizeTemplateV2 } from "../src/card-v2";

const baseNode = { id: "node-1", name: "呼号", x_mm: 5, y_mm: 5, width_mm: 40, height_mm: 10, locked: false, visible: true };

function validV2(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    base_width: 1400,
    base_height: 900,
    trim: { width_mm: 140, height_mm: 90 },
    bleed_mm: 3,
    safe_mm: 5,
    background: "#FFFFFF",
    font_manifest_version: "fonts-2026-09-14",
    preset: null,
    elements: [
      { ...baseNode, type: "text", source: { kind: "qso", field: "call" }, font_id: "ibm-plex-mono-600", size_pt: 30, min_size_pt: 18, color: "#15344B", align: "left", fit: "shrink", required: true },
      { ...baseNode, id: "rect-1", name: "底色", type: "rect", x_mm: 0, y_mm: 0, width_mm: 140, height_mm: 90, fill: "#FFFFFF" },
      { ...baseNode, id: "image-1", name: "照片", type: "image", x_mm: 0, y_mm: 0, width_mm: 70, height_mm: 45, asset_id: "asset-1", crop: { x: 0, y: 0, width: 1, height: 1 } },
      { ...baseNode, id: "qr-1", name: "查验二维码", type: "qr", x_mm: 110, y_mm: 60, width_mm: 22, height_mm: 22, source: "public_url", quiet_modules: 4 }
    ],
    ...overrides
  };
}

describe("CardTemplateV2Schema", () => {
  it("parses a complete single-sided document without changing element order", () => {
    const input = validV2();
    const result = CardTemplateV2Schema.parse(input);
    expect(result.schema_version).toBe(2);
    expect(result.elements.map((element) => element.id)).toEqual(["node-1", "rect-1", "image-1", "qr-1"]);
    expect(result.elements[0]).toMatchObject({ name: "呼号", type: "text" });
  });

  it("accepts a typed literal text source and my_grid binding", () => {
    const result = CardTemplateV2Schema.parse(validV2({ elements: [
      { ...baseNode, type: "text", source: { kind: "literal", text: "CONFIRMING OUR QSO" }, font_id: "noto-sans-sc-400", size_pt: 9, min_size_pt: 7, color: "#15344B", align: "center", fit: "wrap", required: false },
      { ...baseNode, id: "grid", name: "本台网格", type: "text", source: { kind: "qso", field: "my_grid" }, font_id: "ibm-plex-mono-400", size_pt: 9, min_size_pt: 7, color: "#15344B", align: "left", fit: "shrink", required: false }
    ] }));
    expect(result.elements[0].type).toBe("text");
  });

  it("rejects malformed element identity, geometry and crop", () => {
    expect(() => CardTemplateV2Schema.parse(validV2({ elements: [{ ...baseNode, id: "", type: "rect", fill: "#FFFFFF" }] }))).toThrow();
    expect(() => CardTemplateV2Schema.parse(validV2({ elements: [{ ...baseNode, type: "image", asset_id: "asset-1", crop: { x: 0.8, y: 0, width: 0.4, height: 1 } }] }))).toThrow();
    expect(() => CardTemplateV2Schema.parse(validV2({ elements: [{ ...baseNode, type: "qr", width_mm: 22, height_mm: 21, source: "public_url", quiet_modules: 4 }] }))).toThrow();
    expect(() => CardTemplateV2Schema.parse(validV2({ elements: [{ ...baseNode, type: "rect", fill: "#FFF" }] }))).toThrow();
  });

  it("rejects duplicate ids, NaN coordinates and more than 80 elements", () => {
    expect(() => CardTemplateV2Schema.parse(validV2({ elements: [
      { ...baseNode, type: "rect", fill: "#FFFFFF" },
      { ...baseNode, type: "rect", fill: "#FFFFFF" }
    ] }))).toThrow();
    expect(() => CardTemplateV2Schema.parse(validV2({ elements: [{ ...baseNode, x_mm: Number.NaN, type: "rect", fill: "#FFFFFF" }] }))).toThrow();
    const elements = Array.from({ length: 81 }, (_, index) => ({ ...baseNode, id: `node-${index}`, name: `节点 ${index}`, type: "rect", fill: "#FFFFFF" }));
    expect(() => CardTemplateV2Schema.parse(validV2({ elements }))).toThrow();
  });

  it("rejects an oversized literal before it can enter the document", () => {
    const huge = validV2({ elements: [{ ...baseNode, type: "text", source: { kind: "literal", text: "x".repeat(260_000) }, font_id: "noto-sans-sc-400", size_pt: 9, min_size_pt: 7, color: "#15344B", align: "left", fit: "wrap", required: false }] });
    expect(() => normalizeTemplateV2(huge)).toThrow(/500/u);
  });
});

describe("AnyCardTemplateSchema", () => {
  it("keeps V1 parse output unchanged", () => {
    const old = { schema_version: 1, base_width: 1264, base_height: 848, elements: [] };
    expect(AnyCardTemplateSchema.parse(old)).toEqual(old);
  });

  it("rejects an unknown schema version instead of best-effort parsing", () => {
    expect(() => AnyCardTemplateSchema.parse({ schema_version: 3, base_width: 1400, base_height: 900, elements: [] })).toThrow();
  });
});
