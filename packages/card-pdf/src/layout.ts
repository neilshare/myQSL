import type { PrintProfile } from "@myqsl/domain";

export const MM_TO_PT = 72 / 25.4;
export const A4_LANDSCAPE = { width: 297 * MM_TO_PT, height: 210 * MM_TO_PT };
export const CARD_TRIM = { width: 140 * MM_TO_PT, height: 90 * MM_TO_PT };

export type Slot = { x: number; y: number; width: number; height: number; trimX: number; trimY: number; bleed: number };

export function layoutForProfile(profile: PrintProfile): { page: { width: number; height: number }; slots: Slot[] } {
  if (profile === "single-bleed-v1") {
    const bleed = 3 * MM_TO_PT;
    return { page: { width: 146 * MM_TO_PT, height: 96 * MM_TO_PT }, slots: [{ x: 0, y: 0, width: 146 * MM_TO_PT, height: 96 * MM_TO_PT, trimX: bleed, trimY: bleed, bleed }] };
  }
  const slots = [
    { x: 6.5, y: 13 }, { x: 150.5, y: 13 }, { x: 6.5, y: 107 }, { x: 150.5, y: 107 }
  ].map(({ x, y }) => ({ x: x * MM_TO_PT, y: y * MM_TO_PT, width: CARD_TRIM.width, height: CARD_TRIM.height, trimX: 0, trimY: 0, bleed: 0 }));
  return { page: A4_LANDSCAPE, slots };
}

export function toPdfY(pageHeight: number, top: number, height = 0): number {
  return pageHeight - top - height;
}
