import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderScenePdf } from "../src/scene-adapter";
import type { CardScene } from "@myqsl/card-scene";

const scene: CardScene = {
  widthMm: 140,
  heightMm: 90,
  background: "#FFFFFF",
  sourceElementCount: 2,
  issues: [],
  primitives: [
    { type: "rect", id: "bg", xMm: 0, yMm: 0, widthMm: 140, heightMm: 90, fill: "#FFFFFF" },
    { type: "text", id: "call", text: "JA1ABC", fontId: "test-font", sizePt: 18, color: "#15344B", xMm: 5, baselineMm: 15, widthMm: 40, align: "left", lineHeightMm: 6 }
  ]
};

describe("V2 PDF scene adapter", () => {
  it("exports a physical 140x90mm page and vector text", async () => {
    const result = await renderScenePdf(scene, { fonts: new Map([["test-font", { standard: StandardFonts.Helvetica }]]) });
    const document = await PDFDocument.load(result);
    const page = document.getPage(0);
    expect(page.getWidth()).toBeCloseTo((140 / 25.4) * 72, 4);
    expect(page.getHeight()).toBeCloseTo((90 / 25.4) * 72, 4);
    expect(result.byteLength).toBeGreaterThan(500);
  });

  it("writes the 146x96mm media box and 140x90mm trim box for print", async () => {
    const result = await renderScenePdf(scene, { fonts: new Map([["test-font", { standard: StandardFonts.Helvetica }]]) }, { profile: "single-bleed-v2" });
    const document = await PDFDocument.load(result);
    const page = document.getPage(0);
    const mm = (value: number) => value * 25.4 / 72;
    expect(mm(page.getWidth())).toBeCloseTo(146, 3);
    expect(mm(page.getHeight())).toBeCloseTo(96, 3);
    const trim = page.getTrimBox();
    expect(mm(trim.x)).toBeCloseTo(3, 3);
    expect(mm(trim.y)).toBeCloseTo(3, 3);
    expect(mm(trim.width)).toBeCloseTo(140, 3);
    expect(mm(trim.height)).toBeCloseTo(90, 3);
  });
});
