import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import type { PrintManifestV1 } from "@myqsl/domain";
import type { CardScene, FontRegistry, ScenePrimitive } from "@myqsl/card-scene";
import { CardTemplateV2Schema, type TemplateV2 } from "@myqsl/domain";
import { compileCardScene } from "@myqsl/card-scene";
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

function v2Fonts(): FontRegistry {
  return new Map(["barlow-condensed-600", "ibm-plex-mono-400", "ibm-plex-mono-600", "noto-sans-sc-400"].map((id) => [id, { width: (value, sizePt) => value.length * sizePt * 0.55, ascent: (sizePt) => sizePt * 0.8, hasGlyph: () => true }]));
}

function drawSceneRect(page: PDFPage, primitive: Extract<ScenePrimitive, { type: "rect" }>, originX: number, originY: number): void {
  page.drawRectangle({ x: originX + primitive.xMm * MM_TO_PT, y: originY - (primitive.yMm + primitive.heightMm) * MM_TO_PT, width: primitive.widthMm * MM_TO_PT, height: primitive.heightMm * MM_TO_PT, color: parseColor(primitive.fill) });
}

async function drawV2Scene(page: PDFPage, pdf: PDFDocument, scene: CardScene, assets: Map<string, PrintAsset>, originX: number, originYTop: number, images: Map<string, PDFImage>): Promise<void> {
  const originY = page.getHeight() - originYTop * MM_TO_PT;
  page.drawRectangle({ x: originX, y: originY - scene.heightMm * MM_TO_PT, width: scene.widthMm * MM_TO_PT, height: scene.heightMm * MM_TO_PT, color: parseColor(scene.background) });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const primitive of scene.primitives) {
    if (primitive.type === "rect") { drawSceneRect(page, primitive, originX, originY); continue; }
    if (primitive.type === "text") {
      page.drawText(primitive.text, { x: originX + primitive.xMm * MM_TO_PT, y: originY - primitive.baselineMm * MM_TO_PT, size: primitive.sizePt, font, color: parseColor(primitive.color), maxWidth: primitive.widthMm * MM_TO_PT });
      continue;
    }
    const asset = assets.get(primitive.assetId);
    if (!asset) throw new Error(`V2 print asset ${primitive.assetId} is unavailable`);
    let image = images.get(primitive.assetId);
    if (!image) {
      image = asset.mime === "image/png" ? await pdf.embedPng(asset.bytes) : await pdf.embedJpg(asset.bytes);
      images.set(primitive.assetId, image);
    }
    const x = originX + primitive.xMm * MM_TO_PT;
    const y = originY - (primitive.yMm + primitive.heightMm) * MM_TO_PT;
    page.drawImage(image, { x, y, width: primitive.widthMm * MM_TO_PT, height: primitive.heightMm * MM_TO_PT });
  }
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
      if ((template as { schema_version?: number }).schema_version === 2) {
        const parsed = CardTemplateV2Schema.parse(template) as TemplateV2;
        const scene = compileCardScene(parsed, { qso, publicUrl: item.public_url, proof: item.qr_omitted }, v2Fonts());
        const sceneErrors = scene.issues.filter((issue) => issue.level === "error");
        if (sceneErrors.length) throw new Error(`V2 scene blocked: ${sceneErrors.map((issue) => issue.code).join(", ")}`);
        const originX = x + (manifest.profile === "single-bleed-v1" ? 3 * MM_TO_PT : 0);
        const originTop = yTop + (manifest.profile === "single-bleed-v1" ? 3 : 0);
        await drawV2Scene(page, pdf, scene, assets, originX, originTop, images);
        completed += 1;
        options.onProgress?.({ completed, total: manifest.items.length, page: pageIndex + 1 });
        continue;
      }
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
