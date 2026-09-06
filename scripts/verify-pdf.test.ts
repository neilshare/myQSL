import { describe, expect, it } from "vitest";
import { layoutForProfile } from "../packages/card-pdf/src/layout";

describe("verify-pdf geometry contract", () => {
  it("uses A4 landscape and one 146x96 mm page for bleed profile", () => {
    const a4 = layoutForProfile("a4-four-up-v1"); const bleed = layoutForProfile("single-bleed-v1");
    expect(a4.page.width / (72 / 25.4)).toBeCloseTo(297, 3); expect(a4.slots).toHaveLength(4);
    expect(bleed.page.width / (72 / 25.4)).toBeCloseTo(146, 3); expect(bleed.slots[0].bleed / (72 / 25.4)).toBeCloseTo(3, 3);
  });
});
