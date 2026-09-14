import { describe, expect, it } from "vitest";
import { documentToScreen, screenToDocument, snapMm } from "./geometry";
import { History } from "./history";

describe("template editor geometry and history", () => {
  it.each([0.25, 1, 4])( "round-trips document coordinates at %s zoom", (zoom) => {
    const viewport = { zoom, panXCssPx: 17.5, panYCssPx: -3.25 };
    const screen = documentToScreen({ xMm: 48.2, yMm: 17.4 }, viewport);
    expect(screenToDocument(screen.xCssPx, screen.yCssPx, viewport).xMm).toBeCloseTo(48.2, 8);
    expect(screenToDocument(screen.xCssPx, screen.yCssPx, viewport).yMm).toBeCloseTo(17.4, 8);
  });
  it("uses a six CSS pixel snap threshold and keeps one history entry per drag", () => {
    expect(snapMm(20.55, 20, 1)).toBe(20);
    expect(snapMm(20.7, 20, 1)).toBe(20.7);
    const history = new History<number>();
    for (let index = 0; index < 120; index += 1) history.push(index);
    expect(history.size).toBe(100);
    expect(history.undo(120)).toBe(119);
    expect(history.redo(119)).toBe(120);
  });
});
