import { describe, expect, it } from "vitest";
import { renderSceneToCanvas } from "../src/scene-adapter";
import type { CardScene } from "@myqsl/card-scene";

const scene: CardScene = {
  widthMm: 140,
  heightMm: 90,
  background: "#FFFFFF",
  sourceElementCount: 2,
  issues: [],
  primitives: [
    { type: "rect", id: "bg", xMm: 0, yMm: 0, widthMm: 140, heightMm: 90, fill: "#FFFFFF" },
    { type: "text", id: "call", text: "JA1ABC", fontId: "ibm-plex-mono-600", sizePt: 18, color: "#15344B", xMm: 5, baselineMm: 15, widthMm: 40, align: "left", lineHeightMm: 6 },
    { type: "image", id: "photo", assetId: "asset-1", xMm: 60, yMm: 5, widthMm: 40, heightMm: 30, crop: { x: 0, y: 0, width: 1, height: 1 } }
  ]
};

describe("V2 Canvas scene adapter", () => {
  it("draws scene primitives without reading QSO data", async () => {
    const calls: string[] = [];
    const context = {
      fillStyle: "",
      font: "",
      textAlign: "left",
      clearRect: () => calls.push("clear"),
      fillRect: () => calls.push("rect"),
      fillText: (text: string) => calls.push(`text:${text}`),
      drawImage: () => calls.push("image")
    } as unknown as CanvasRenderingContext2D;
    const canvas = { width: 1400, height: 900, getContext: () => context } as unknown as HTMLCanvasElement;
    await renderSceneToCanvas(canvas, scene, { images: new Map([["asset-1", { image: {} as CanvasImageSource, width: 100, height: 75 }]]) });
    expect(calls).toEqual(["clear", "rect", "rect", "text:JA1ABC", "image"]);
  });
});
