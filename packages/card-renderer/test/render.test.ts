import { describe, expect, it } from "vitest";
import { renderCard } from "../src";

const qso = { call: "BG4YYY", station_callsign: "BA4RC", qso_date: "20260903", time_on: "143000", band: "40M", mode: "SSB" };
const template = { schema_version: 1 as const, base_width: 1264, base_height: 848, elements: [{ type: "text" as const, x: 0.5, y: 0.5, field: "call" as const, font: "Inter" as const, font_size: 32, color: "#FFFFFF", align: "left" as const }] };

describe("deterministic card renderer", () => {
  it("scales normalized coordinates to the target canvas", async () => {
    const calls: unknown[] = [];
    const canvas = { width: 2528, height: 1696, getContext: () => ({ fillText: (...args: unknown[]) => calls.push(["fillText", ...args]), measureText: () => ({ width: 10 }), font: "", fillStyle: "", textAlign: "" }) } as unknown as HTMLCanvasElement;
    await renderCard(canvas, template, qso);
    expect(calls).toContainEqual(["fillText", "BG4YYY", 1264, 848]);
  });

  it("rejects an unsafe template before touching the canvas", async () => {
    await expect(renderCard({} as HTMLCanvasElement, { ...template, elements: [{ ...template.elements[0], x: 120 }] }, qso)).rejects.toThrow();
  });
});
