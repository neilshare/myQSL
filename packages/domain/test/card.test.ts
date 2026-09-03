import { describe, expect, it } from "vitest";
import { CardTemplateSchema } from "../src";

describe("v1 card template schema", () => {
  it("rejects absolute coordinates and unknown element types", () => {
    const result = CardTemplateSchema.safeParse({
      schema_version: 1,
      base_width: 1264,
      base_height: 848,
      elements: [{ type: "text", x: 120, y: 0.5, field: "call" }]
    });
    expect(result.success).toBe(false);
  });

  it("accepts normalized text and QR elements with safe defaults", () => {
    const result = CardTemplateSchema.parse({
      schema_version: 1,
      base_width: 1264,
      base_height: 848,
      elements: [
        { type: "text", x: 0.5, y: 0.5, field: "call" },
        { type: "qr", x: 0.8, y: 0.8, width: 0.15, height: 0.15 }
      ]
    });
    expect(result.elements[0]).toMatchObject({ font: "Inter", color: "#FFFFFF" });
  });
});
