import { describe, expect, it } from "vitest";
import { getPresets } from "@myqsl/card-presets";
import { applyEditorCommand, applyStageCommand } from "./commands";

describe("template editor commands", () => {
  it("changes theme without changing bound QSO fields", () => {
    const document = getPresets()[0].layout;
    const changed = applyEditorCommand(document, { type: "set-background", color: "#FFFFFF" });
    expect(changed.background).toBe("#FFFFFF");
    expect(JSON.stringify(changed)).not.toContain("JA1ABC");
    expect(document.background).toBe("#F4EBDD");
  });

  it("adds or replaces an image by immutable asset id and preserves crop", () => {
    const document = getPresets()[1].layout;
    const added = applyEditorCommand(document, { type: "add-image", assetId: "asset-1" });
    expect(added.elements.find((element) => element.id === "user-photo")).toMatchObject({ type: "image", asset_id: "asset-1" });
    const replaced = applyEditorCommand(added, { type: "replace-image", assetId: "asset-2", nodeId: "user-photo", crop: { x: 0.1, y: 0, width: 0.8, height: 1 } });
    expect(replaced.elements.find((element) => element.id === "user-photo")).toMatchObject({ type: "image", asset_id: "asset-2", crop: { x: 0.1, y: 0, width: 0.8, height: 1 } });
  });

  it("normalizes one drag to millimetres and never persists Konva nodes", () => {
    const document = getPresets()[0].layout;
    const moved = applyStageCommand(document, { type: "move", ids: ["call"], delta: { xMm: 1.234, yMm: -0.26 } });
    const call = moved.elements.find((element) => element.id === "call");
    expect(call).toMatchObject({ x_mm: 16.2, y_mm: 32.7 });
    expect(JSON.stringify(moved)).not.toContain("Konva");
  });
});
