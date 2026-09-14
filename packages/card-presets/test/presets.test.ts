import { describe, expect, it } from "vitest";
import { CardTemplateV2Schema } from "@myqsl/domain";
import { getPresets } from "../src";

describe("first-party card presets", () => {
  it("returns three independent schema-valid presets", () => {
    const presets = getPresets();
    expect(presets.map((preset) => preset.id)).toEqual(["classic-dx", "photo-journal", "minimal-grid"]);
    for (const preset of presets) {
      expect(CardTemplateV2Schema.safeParse(preset.layout).success).toBe(true);
      expect(new Set(preset.layout.elements.map((element) => element.id)).size).toBe(preset.layout.elements.length);
      expect(preset.layout.elements.some((element) => element.type === "qr")).toBe(true);
    }
    const first = getPresets();
    first[0].layout.elements[0] = { ...first[0].layout.elements[0], visible: false };
    expect(getPresets()[0].layout.elements[0].visible).toBe(true);
  });

  it("keeps all content inside the trim and uses the controlled font manifest", () => {
    for (const preset of getPresets()) {
      expect(preset.layout.font_manifest_version).toBe("fonts-2026-09-14");
      for (const element of preset.layout.elements) {
        expect(element.x_mm).toBeGreaterThanOrEqual(0);
        expect(element.y_mm).toBeGreaterThanOrEqual(0);
        expect(element.x_mm + element.width_mm).toBeLessThanOrEqual(140);
        expect(element.y_mm + element.height_mm).toBeLessThanOrEqual(90);
      }
    }
  });
});
