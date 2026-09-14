export type Viewport = { zoom: number; panXCssPx: number; panYCssPx: number };
export type PointMm = { xMm: number; yMm: number };

export function screenToDocument(xCssPx: number, yCssPx: number, viewport: Viewport, cssPxPerMmAt100 = 10): PointMm {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) throw new Error("Invalid zoom");
  return { xMm: (xCssPx - viewport.panXCssPx) / (cssPxPerMmAt100 * viewport.zoom), yMm: (yCssPx - viewport.panYCssPx) / (cssPxPerMmAt100 * viewport.zoom) };
}
export function documentToScreen(point: PointMm, viewport: Viewport, cssPxPerMmAt100 = 10): { xCssPx: number; yCssPx: number } {
  return { xCssPx: point.xMm * cssPxPerMmAt100 * viewport.zoom + viewport.panXCssPx, yCssPx: point.yMm * cssPxPerMmAt100 * viewport.zoom + viewport.panYCssPx };
}
export function snapMm(valueMm: number, targetMm: number, zoom: number, thresholdCssPx = 6, cssPxPerMmAt100 = 10): number {
  return Math.abs((valueMm - targetMm) * cssPxPerMmAt100 * zoom) <= thresholdCssPx ? targetMm : valueMm;
}
