import type { NodeV2, TemplateV2 } from "@myqsl/domain";

export type FontMetrics = {
  width(text: string, sizePt: number): number;
  ascent(sizePt: number): number;
  hasGlyph(codePoint: number): boolean;
};
export type FontRegistry = ReadonlyMap<string, FontMetrics>;
export type BoundData = { qso: Record<string, unknown>; publicUrl: string | null; proof: boolean };
export type Issue = { code: string; elementId: string; level: "error" | "warning"; message: string };

export type ScenePrimitive =
  | { type: "text"; id: string; text: string; fontId: string; sizePt: number; color: string; xMm: number; baselineMm: number; widthMm: number; align: "left" | "center" | "right"; lineHeightMm: number }
  | { type: "rect"; id: string; xMm: number; yMm: number; widthMm: number; heightMm: number; fill: string }
  | { type: "image"; id: string; assetId: string; xMm: number; yMm: number; widthMm: number; heightMm: number; crop: { x: number; y: number; width: number; height: number } };

export type CardScene = { widthMm: 140; heightMm: 90; background: string; primitives: ScenePrimitive[]; issues: Issue[]; sourceElementCount: number };
export type SceneNode = NodeV2;
export type SceneDocument = TemplateV2;
