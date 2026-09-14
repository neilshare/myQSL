import type { PrintableQsoField } from "@myqsl/domain";
import { hasGlyphs, POINT_TO_MM } from "./fonts";
import type { FontMetrics, Issue, ScenePrimitive } from "./types";

export function formatQsoField(qso: Record<string, unknown>, field: PrintableQsoField | "my_grid"): string {
  const value = field === "freq_mhz" && qso.freq_mhz == null && typeof qso.freq_hz === "number" ? qso.freq_hz / 1_000_000 : qso[field];
  if (value === null || value === undefined || value === "") return "";
  if (field === "freq_mhz" && typeof value === "number") return value.toFixed(3);
  if (field === "qso_date" && typeof value === "string" && /^\d{8}$/u.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (field === "time_on" && typeof value === "string" && /^\d{4}(\d{2})?$/u.test(value)) return `${value.slice(0, 2)}:${value.slice(2, 4)}${value.length === 6 ? `:${value.slice(4, 6)}` : ""}`;
  return String(value);
}

function wrapText(text: string, widthMm: number, sizePt: number, font: FontMetrics): string[] {
  const lines: string[] = [];
  let line = "";
  for (const character of [...text]) {
    const candidate = line + character;
    if (line && font.width(candidate, sizePt) * POINT_TO_MM > widthMm) {
      lines.push(line);
      line = character;
    } else line = candidate;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

export function compileTextNode(node: Extract<import("@myqsl/domain").NodeV2, { type: "text" }>, qso: Record<string, unknown>, font: FontMetrics | undefined): { primitives: ScenePrimitive[]; issues: Issue[] } {
  if (!font) return { primitives: [], issues: [{ code: "FONT_MISSING", elementId: node.id, level: "error", message: `Font ${node.font_id} is not available` }] };
  const text = node.source.kind === "literal" ? node.source.text : formatQsoField(qso, node.source.field);
  if (!text) {
    return node.required ? { primitives: [], issues: [{ code: "MISSING_FIELD", elementId: node.id, level: "error", message: `${node.name} has no printable value` }] } : { primitives: [], issues: [] };
  }
  const missing = hasGlyphs(text, font);
  if (missing.length) return { primitives: [], issues: [{ code: "FONT_MISSING_GLYPH", elementId: node.id, level: "error", message: `Font ${node.font_id} is missing: ${missing.join("")}` }] };

  let sizePt = node.size_pt;
  if (node.fit === "shrink") {
    while (sizePt > node.min_size_pt && font.width(text, sizePt) * POINT_TO_MM > node.width_mm) sizePt = Math.max(node.min_size_pt, sizePt - 0.5);
    if (font.width(text, sizePt) * POINT_TO_MM > node.width_mm) return { primitives: [], issues: [{ code: "TEXT_OVERFLOW", elementId: node.id, level: "error", message: `${node.name} exceeds its width at the minimum font size` }] };
  }
  const lines = node.fit === "wrap" ? wrapText(text, node.width_mm, sizePt, font) : [text];
  const lineHeightMm = sizePt * POINT_TO_MM * 1.2;
  const textHeightMm = lines.length * lineHeightMm;
  if (textHeightMm > node.height_mm + 0.0001) return { primitives: [], issues: [{ code: "TEXT_OVERFLOW", elementId: node.id, level: "error", message: `${node.name} exceeds its height` }] };
  const primitives = lines.map((line, index) => ({ type: "text" as const, id: lines.length === 1 ? node.id : `${node.id}:line:${index}`, text: line, fontId: node.font_id, sizePt, color: node.color, xMm: node.x_mm, baselineMm: node.y_mm + font.ascent(sizePt) * POINT_TO_MM + index * lineHeightMm, widthMm: node.width_mm, align: node.align, lineHeightMm }));
  return { primitives, issues: [] };
}
