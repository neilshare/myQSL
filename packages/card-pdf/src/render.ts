import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import type { PrintManifestV1 } from "@myqsl/domain";
import { layoutForProfile, toPdfY, MM_TO_PT } from "./layout";
import { preflight, readSnapshot, type PreflightReport, type PrintAsset } from "./preflight";

export class PrintPreflightError extends Error {
  constructor(readonly report: PreflightReport) { super("Print preflight failed"); }
}

export type RenderOptions = { onProgress?: (progress: { completed: number; total: number; page: number }) => void; signal?: AbortSignal; now?: number };

function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException("Print generation cancelled", "AbortError"); }

function parseColor(value: unknown) {
  const hex = typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value) ? value.slice(1) : "000000";
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

function qrValue(element: Record<string, unknown>, qso: Record<string, unknown>, publicUrl: string | null): string {
  return element.value === "card_token" ? String(qso.public_id ?? "") : String(publicUrl ?? "");
}

function drawQr(page: PDFPage, value: string, x: number, y: number, width: number, height: number): void {
  const matrix = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
  const size = matrix.size;
  const module = Math.min(width, height) / size;
  const offsetX = x + (width - module * size) / 2;
  const offsetY = y + (height - module * size) / 2;
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    if (matrix.get(row, col)) page.drawRectangle({ x: offsetX + col * module, y: offsetY + (size - row - 1) * module, width: module + 0.02, height: module + 0.02, color: rgb(0, 0, 0) });
  }
}

function drawBackground(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number): void {
  page.drawImage(image, { x, y, width, height });
}

export async function renderPdf(manifest: PrintManifestV1, assets: Map<string, PrintAsset>, options: RenderOptions = {}): Promise<{ bytes: Uint8Array; report: PreflightReport }> {
  const report = preflight(manifest, assets, options.now);
  if (!report.ok) throw new PrintPreflightError(report);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const layout = layoutForProfile(manifest.profile);
  const images = new Map<string, PDFImage>();
  let completed = 0;
  for (let pageIndex = 0; pageIndex < report.page_count; pageIndex++) {
    checkAbort(options.signal);
    const page = pdf.addPage([layout.page.width, layout.page.height]);
    const pageItems = manifest.items.slice(pageIndex * layout.slots.length, (pageIndex + 1) * layout.slots.length);
    for (let slotIndex = 0; slotIndex < pageItems.length; slotIndex++) {
      checkAbort(options.signal);
      const item = pageItems[slotIndex];
      const slot = layout.slots[slotIndex];
      const x = slot.x;
      const yTop = slot.y;
      const y = toPdfY(layout.page.height, yTop, slot.height);
      if (manifest.profile === "single-bleed-v1") {
        page.drawRectangle({ x: 3 * MM_TO_PT, y: 3 * MM_TO_PT, width: 140 * MM_TO_PT, height: 90 * MM_TO_PT, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.3, opacity: 0.5 });
      }
      if (item.background_asset_id) {
        let image = images.get(item.background_asset_id);
        if (!image) {
          const asset = assets.get(item.background_asset_id);
          if (!asset) throw new Error("Background asset disappeared after preflight");
          image = asset.mime === "image/png" ? await pdf.embedPng(asset.bytes) : await pdf.embedJpg(asset.bytes);
          images.set(item.background_asset_id, image);
        }
        drawBackground(page, image, x, y, slot.width, slot.height);
      }
      const { qso, template } = readSnapshot(item.snapshot_json);
      const scaleX = slot.width / template.base_width;
      const scaleY = slot.height / template.base_height;
      for (const element of template.elements) {
        const ex = x + Number(element.x) * slot.width;
        const eyTop = yTop + Number(element.y) * slot.height;
        if (element.type === "text") {
          const text = String(qso[String(element.field)] ?? "");
          if (!text) continue;
          const size = Number(element.font_size ?? 32) * Math.min(scaleX, scaleY);
          page.drawText(text, { x: ex, y: toPdfY(layout.page.height, eyTop, size), size, font, color: parseColor(element.color), maxWidth: element.max_width == null ? undefined : Number(element.max_width) * slot.width });
        } else if (element.type === "qr" && !item.qr_omitted) {
          const value = qrValue(element, qso, item.public_url);
          if (!value) throw new Error(`QR value missing at position ${item.position}`);
          const width = Number(element.width) * slot.width;
          const height = Number(element.height) * slot.height;
          drawQr(page, value, ex, toPdfY(layout.page.height, eyTop, height), width, height);
        }
      }
      completed += 1;
      options.onProgress?.({ completed, total: manifest.items.length, page: pageIndex + 1 });
    }
    if (manifest.profile === "a4-four-up-v1") {
      for (const slot of layout.slots) {
        const sx = slot.x + slot.width;
        const sy = toPdfY(layout.page.height, slot.y, slot.height);
        page.drawLine({ start: { x: sx + 0.5 * MM_TO_PT, y: sy + slot.height / 2 }, end: { x: sx + 1.5 * MM_TO_PT, y: sy + slot.height / 2 }, thickness: 0.15 * MM_TO_PT, color: rgb(0, 0, 0) });
      }
    }
  }
  const bytes = await pdf.save({ useObjectStreams: true });
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error("Generated PDF exceeds 50 MiB");
  return { bytes, report };
}
