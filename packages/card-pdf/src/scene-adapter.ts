import type { CardScene, ScenePrimitive } from "@myqsl/card-scene";
import { PDFDocument, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { MM_TO_PT, toPdfY } from "./layout";

export type PdfSceneFont = { bytes?: Uint8Array; standard?: StandardFonts };
export type PdfSceneImage = { bytes: Uint8Array; mime: "image/png" | "image/jpeg" };
export type PdfSceneResources = { fonts: ReadonlyMap<string, PdfSceneFont>; images?: ReadonlyMap<string, PdfSceneImage> };
export type PdfSceneRenderOptions = { profile?: "proof" | "single-bleed-v2" };

function color(value: string) {
  const hex = /^#[0-9a-f]{6}$/iu.test(value) ? value.slice(1) : "000000";
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

function assertRenderable(scene: CardScene): void {
  const errors = scene.issues.filter((issue) => issue.level === "error");
  if (errors.length) throw new Error(`Card scene has ${errors.length} blocking issue(s): ${errors.map((issue) => issue.code).join(", ")}`);
}

async function embedFonts(pdf: PDFDocument, primitives: ScenePrimitive[], resources: PdfSceneResources): Promise<Map<string, PDFFont>> {
  const fonts = new Map<string, PDFFont>();
  const needed = new Set(primitives.filter((primitive): primitive is Extract<ScenePrimitive, { type: "text" }> => primitive.type === "text").map((primitive) => primitive.fontId));
  for (const id of needed) {
    const source = resources.fonts.get(id);
    if (!source) throw new Error(`PDF font ${id} is unavailable`);
    if (source.bytes) {
      pdf.registerFontkit(fontkit);
      fonts.set(id, await pdf.embedFont(source.bytes, { subset: true }));
    } else if (source.standard) fonts.set(id, await pdf.embedFont(source.standard));
    else throw new Error(`PDF font ${id} has no source`);
  }
  return fonts;
}

async function drawImage(page: ReturnType<PDFDocument["addPage"]>, primitive: Extract<ScenePrimitive, { type: "image" }>, resources: PdfSceneResources, offsetMm: number): Promise<void> {
  const asset = resources.images?.get(primitive.assetId);
  if (!asset) throw new Error(`Scene image asset ${primitive.assetId} is unavailable`);
  const image = asset.mime === "image/png" ? await page.doc.embedPng(asset.bytes) : await page.doc.embedJpg(asset.bytes);
  const pageHeight = page.getHeight();
  const x = (primitive.xMm + offsetMm) * MM_TO_PT;
  const y = toPdfY(pageHeight, (primitive.yMm + offsetMm) * MM_TO_PT, primitive.heightMm * MM_TO_PT);
  const width = primitive.widthMm * MM_TO_PT;
  const height = primitive.heightMm * MM_TO_PT;
  const expandedWidth = width / primitive.crop.width;
  const expandedHeight = height / primitive.crop.height;
  const expandedX = x - primitive.crop.x * expandedWidth;
  const expandedY = y - (1 - primitive.crop.y - primitive.crop.height) * expandedHeight;
  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
  page.drawImage(image, { x: expandedX, y: expandedY, width: expandedWidth, height: expandedHeight });
  page.pushOperators(popGraphicsState());
}

export async function renderScenePdf(scene: CardScene, resources: PdfSceneResources, options: PdfSceneRenderOptions = {}): Promise<Uint8Array> {
  assertRenderable(scene);
  const pdf = await PDFDocument.create();
  const print = options.profile === "single-bleed-v2";
  const offsetMm = print ? 3 : 0;
  const page = pdf.addPage([(scene.widthMm + offsetMm * 2) * MM_TO_PT, (scene.heightMm + offsetMm * 2) * MM_TO_PT]);
  if (print) {
    page.setBleedBox(0, 0, page.getWidth(), page.getHeight());
    page.setTrimBox(offsetMm * MM_TO_PT, offsetMm * MM_TO_PT, scene.widthMm * MM_TO_PT, scene.heightMm * MM_TO_PT);
  }
  const fonts = await embedFonts(pdf, scene.primitives, resources);
  page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: color(scene.background) });
  for (const primitive of scene.primitives) {
    if (primitive.type === "rect") {
      page.drawRectangle({ x: (primitive.xMm + offsetMm) * MM_TO_PT, y: toPdfY(page.getHeight(), (primitive.yMm + offsetMm) * MM_TO_PT, primitive.heightMm * MM_TO_PT), width: primitive.widthMm * MM_TO_PT, height: primitive.heightMm * MM_TO_PT, color: color(primitive.fill) });
    } else if (primitive.type === "text") {
      const font = fonts.get(primitive.fontId);
      if (!font) throw new Error(`PDF font ${primitive.fontId} is unavailable`);
      const textWidth = font.widthOfTextAtSize(primitive.text, primitive.sizePt);
      const boxX = (primitive.xMm + offsetMm) * MM_TO_PT;
      const width = primitive.widthMm * MM_TO_PT;
      const x = primitive.align === "left" ? boxX : primitive.align === "center" ? boxX + (width - textWidth) / 2 : boxX + width - textWidth;
      page.drawText(primitive.text, { x, y: toPdfY(page.getHeight(), (primitive.baselineMm + offsetMm) * MM_TO_PT), size: primitive.sizePt, font, color: color(primitive.color) });
    } else await drawImage(page, primitive, resources, offsetMm);
  }
  return pdf.save({ useObjectStreams: true });
}
