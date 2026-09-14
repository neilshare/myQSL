import { describe, expect, it } from "vitest";
import { preflightScene, type SceneAssetMetadata } from "../src/preflight";
import type { CardScene } from "../src/types";

const asset = (overrides: Partial<SceneAssetMetadata> = {}): SceneAssetMetadata => ({
  id: "photo-1",
  widthPx: 1654,
  heightPx: 1063,
  sha256: "a".repeat(64),
  expectedSha256: "a".repeat(64),
  ...overrides
});

const scene = (overrides: Partial<CardScene> = {}): CardScene => ({
  widthMm: 140,
  heightMm: 90,
  background: "#FFFFFF",
  sourceElementCount: 2,
  issues: [],
  primitives: [
    { type: "text", id: "call", text: "JA1ABC", fontId: "ibm-plex-mono-600", sizePt: 18, color: "#15344B", xMm: 5, baselineMm: 15, widthMm: 45, align: "left", lineHeightMm: 6 },
    { type: "image", id: "photo", assetId: "photo-1", xMm: 60, yMm: 5, widthMm: 70, heightMm: 55, crop: { x: 0, y: 0, width: 1, height: 1 } }
  ],
  ...overrides
});

describe("V2 scene print preflight", () => {
  it("accepts a 300 DPI asset and matching hash inside the safe area", () => {
    const report = preflightScene(scene(), new Map([["photo-1", asset()]]), "single-bleed-v2");
    expect(report.filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("blocks unsafe content, low DPI and hash drift", () => {
    const report = preflightScene(scene({ primitives: [
      { type: "text", id: "call", text: "JA1ABC", fontId: "ibm-plex-mono-600", sizePt: 18, color: "#15344B", xMm: 1, baselineMm: 15, widthMm: 45, align: "left", lineHeightMm: 6 },
      { type: "image", id: "photo", assetId: "photo-1", xMm: 60, yMm: 5, widthMm: 70, heightMm: 55, crop: { x: 0, y: 0, width: 1, height: 1 } }
    ] }), new Map([["photo-1", asset({ widthPx: 600, heightPx: 400, sha256: "b".repeat(64) })]]), "single-bleed-v2");
    expect(report.map((issue) => issue.code)).toEqual(expect.arrayContaining(["SAFE_AREA", "IMAGE_DPI_LOW", "ASSET_HASH_MISMATCH"]));
  });

  it("checks QR quiet zone and minimum module size", () => {
    const report = preflightScene(scene({ primitives: [
      { type: "rect", id: "qr:quiet", xMm: 5, yMm: 60, widthMm: 12, heightMm: 12, fill: "#FFFFFF" },
      { type: "rect", id: "qr:module:0:0", xMm: 9, yMm: 64, widthMm: 0.15, heightMm: 0.15, fill: "#000000" }
    ] }), new Map(), "single-bleed-v2");
    expect(report.some((issue) => issue.code === "QR_TOO_DENSE")).toBe(true);
  });

  it("promotes scene compiler errors into blocking preflight issues", () => {
    const report = preflightScene(scene({ issues: [{ code: "FONT_MISSING_GLYPH", elementId: "call", level: "error", message: "missing 字" }] }), new Map([["photo-1", asset()]]), "single-bleed-v2");
    expect(report).toEqual(expect.arrayContaining([{ code: "FONT_MISSING_GLYPH", elementId: "call", level: "error", message: "missing 字" }]));
  });
});
