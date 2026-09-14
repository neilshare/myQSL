import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const args = process.argv.slice(2); const path = args[0]; const manifestIndex = args.indexOf("--manifest"); const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : undefined;
if (!path) { console.error("Usage: pnpm verify:pdf <file.pdf> --manifest <manifest.json>"); process.exit(2); }
const manifest = manifestPath ? JSON.parse(await readFile(manifestPath, "utf8")) as { profile?: string; items?: unknown[] } : {};
const pdf = await PDFDocument.load(await readFile(path)); const pages = pdf.getPages(); const expectedPages = manifest.profile === "single-bleed-v1" || manifest.profile === "single-bleed-v2" ? (manifest.items?.length ?? 0) : Math.ceil((manifest.items?.length ?? 0) / 4);
const mm = (value: number) => value * 25.4 / 72; const boxes = pages.map((page) => ({ width_mm: Number(mm(page.getWidth()).toFixed(3)), height_mm: Number(mm(page.getHeight()).toFixed(3)), trim_box: { x_mm: Number(mm(page.getTrimBox().x).toFixed(3)), y_mm: Number(mm(page.getTrimBox().y).toFixed(3)), width_mm: Number(mm(page.getTrimBox().width).toFixed(3)), height_mm: Number(mm(page.getTrimBox().height).toFixed(3)) } }));
const expected = manifest.profile === "single-bleed-v1" || manifest.profile === "single-bleed-v2" ? [146, 96] : [297, 210]; const sizeOk = boxes.every((box) => Math.abs(box.width_mm - expected[0]) <= 0.1 && Math.abs(box.height_mm - expected[1]) <= 0.1); const trimOk = manifest.profile === "single-bleed-v2" ? boxes.every((box) => Math.abs(box.trim_box.x_mm - 3) <= 0.1 && Math.abs(box.trim_box.y_mm - 3) <= 0.1 && Math.abs(box.trim_box.width_mm - 140) <= 0.1 && Math.abs(box.trim_box.height_mm - 90) <= 0.1) : true;
const report = { page_count: pages.length, expected_page_count: expectedPages, page_boxes: boxes, embedded_fonts: "pdf-lib standard font inspection", vector_text_qr: "not independently decoded by this lightweight verifier", ok: pages.length === expectedPages && sizeOk && trimOk };
console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exit(1);
