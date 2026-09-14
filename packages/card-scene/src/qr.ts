import QRCode from "qrcode";
import type { ScenePrimitive } from "./types";

type QrMatrix = { modules: { size: number; data: readonly number[] } };
type QrFactory = { create(value: string, options: { errorCorrectionLevel: "M" }): QrMatrix };
const qrFactory = QRCode as unknown as QrFactory;

export function createQrPrimitives(id: string, xMm: number, yMm: number, widthMm: number, heightMm: number, value: string): ScenePrimitive[] {
  const qr = qrFactory.create(value, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const moduleMm = widthMm / (size + 8);
  const primitives: ScenePrimitive[] = [{ type: "rect", id: `${id}:quiet`, xMm, yMm, widthMm, heightMm, fill: "#FFFFFF" }];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (qr.modules.data[row * size + column] !== 1) continue;
      primitives.push({ type: "rect", id: `${id}:module:${row}:${column}`, xMm: xMm + (column + 4) * moduleMm, yMm: yMm + (row + 4) * moduleMm, widthMm: moduleMm, heightMm: moduleMm, fill: "#000000" });
    }
  }
  return primitives;
}
