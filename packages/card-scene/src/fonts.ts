export type { FontMetrics, FontRegistry } from "./types";

export const POINT_TO_MM = 25.4 / 72;

export function hasGlyphs(text: string, font: { hasGlyph(codePoint: number): boolean }): string[] {
  return [...new Set([...text].filter((character) => !font.hasGlyph(character.codePointAt(0) ?? 0)))];
}
