import { POINT_TO_MM } from "./fonts";

export function ptToMm(points: number): number {
  return points * POINT_TO_MM;
}

export function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

export function pixelToMm(cssPixels: number, cssPixelsPerMm: number, zoom: number): number {
  if (!Number.isFinite(cssPixels) || !Number.isFinite(cssPixelsPerMm) || cssPixelsPerMm <= 0 || !Number.isFinite(zoom) || zoom <= 0) throw new Error("Invalid viewport geometry");
  return cssPixels / (cssPixelsPerMm * zoom);
}

export function mmToPixel(mm: number, cssPixelsPerMm: number, zoom: number): number {
  if (!Number.isFinite(mm) || !Number.isFinite(cssPixelsPerMm) || cssPixelsPerMm <= 0 || !Number.isFinite(zoom) || zoom <= 0) throw new Error("Invalid viewport geometry");
  return mm * cssPixelsPerMm * zoom;
}
