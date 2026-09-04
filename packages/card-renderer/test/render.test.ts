import { describe, expect, it, vi } from "vitest";
import { renderCard, type RenderInput } from "../src";

const qso = { call: "BG4YYY", station_callsign: "BA4RC", qso_date: "20260903", time_on: "143000", band: "40M", mode: "SSB" };
const template = { schema_version: 1 as const, base_width: 1264, base_height: 848, elements: [{ type: "text" as const, x: 0.5, y: 0.5, field: "call" as const, font: "Inter" as const, font_size: 32, color: "#FFFFFF", align: "left" as const }] };

describe("deterministic card renderer", () => {
  it("scales normalized coordinates to the target canvas and clears canvas first", async () => {
    const calls: unknown[] = [];
    const canvas = {
      width: 2528,
      height: 1696,
      getContext: () => ({
        clearRect: (...args: unknown[]) => calls.push(["clearRect", ...args]),
        fillText: (...args: unknown[]) => calls.push(["fillText", ...args]),
        measureText: () => ({ width: 10 }),
        font: "",
        fillStyle: "",
        textAlign: ""
      })
    } as unknown as HTMLCanvasElement;

    await renderCard(canvas, template, qso);
    expect(calls[0]).toEqual(["clearRect", 0, 0, 2528, 1696]);
    expect(calls).toContainEqual(["fillText", "BG4YYY", 1264, 848]);
  });

  it("rejects an unsafe template before touching the canvas", async () => {
    await expect(renderCard({} as HTMLCanvasElement, { ...template, elements: [{ ...template.elements[0], x: 120 }] }, qso)).rejects.toThrow();
  });

  it("draws background image when backgroundUrl is provided", async () => {
    const calls: unknown[] = [];
    const mockContext = {
      clearRect: (...args: unknown[]) => calls.push(["clearRect", ...args]),
      drawImage: (...args: unknown[]) => calls.push(["drawImage", ...args]),
      fillText: (...args: unknown[]) => calls.push(["fillText", ...args]),
      measureText: () => ({ width: 10 }),
      font: "",
      fillStyle: "",
      textAlign: ""
    };
    const canvas = {
      width: 1264,
      height: 848,
      getContext: () => mockContext
    } as unknown as HTMLCanvasElement;

    // Mock global Image
    class MockImage {
      src = "";
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        setTimeout(() => {
          if (this.src.includes("fail")) {
            this.onerror?.();
          } else {
            this.onload?.();
          }
        }, 5);
      }
    }
    const origImage = globalThis.Image;
    globalThis.Image = MockImage as unknown as typeof Image;

    try {
      const input: RenderInput = { layout: template, backgroundUrl: "https://example.com/bg.png" };
      await renderCard(canvas, input, qso);
      expect(calls[0]).toEqual(["clearRect", 0, 0, 1264, 848]);
      expect(calls[1][0]).toBe("drawImage");
      expect(calls[1][1]).toBeInstanceOf(MockImage);
      expect(calls[1][2]).toBe(0);
      expect(calls[1][3]).toBe(0);
      expect(calls[1][4]).toBe(1264);
      expect(calls[1][5]).toBe(848);

      // Should fail if background fails to load
      await expect(
        renderCard(canvas, { layout: template, backgroundUrl: "https://example.com/fail.png" }, qso)
      ).rejects.toThrow(/background/i);
    } finally {
      globalThis.Image = origImage;
    }
  });
});
