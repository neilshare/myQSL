import type { NodeV2 } from "@myqsl/domain";
import { createQrPrimitives } from "./qr";
import { compileTextNode } from "./text";
import type { BoundData, CardScene, FontRegistry, Issue, ScenePrimitive } from "./types";

function issue(code: string, elementId: string, message: string, level: "error" | "warning" = "error"): Issue {
  return { code, elementId, level, message };
}

function compileElement(node: NodeV2, data: BoundData, fonts: FontRegistry): { primitives: ScenePrimitive[]; issues: Issue[] } {
  if (!node.visible) return { primitives: [], issues: [] };
  if (node.type === "text") return compileTextNode(node, data.qso, fonts.get(node.font_id));
  if (node.type === "rect") return { primitives: [{ type: "rect", id: node.id, xMm: node.x_mm, yMm: node.y_mm, widthMm: node.width_mm, heightMm: node.height_mm, fill: node.fill }], issues: [] };
  if (node.type === "image") return { primitives: [{ type: "image", id: node.id, assetId: node.asset_id, xMm: node.x_mm, yMm: node.y_mm, widthMm: node.width_mm, heightMm: node.height_mm, crop: node.crop }], issues: [] };
  const value = data.publicUrl ?? (data.proof ? "https://example.invalid/qsl-proof" : null);
  if (!value) return { primitives: [], issues: [issue("QR_URL_MISSING", node.id, "A published public URL is required for a real card QR code")] };
  return { primitives: createQrPrimitives(node.id, node.x_mm, node.y_mm, node.width_mm, node.height_mm, value), issues: [] };
}

export function compileCardScene(doc: import("@myqsl/domain").TemplateV2, data: BoundData, fonts: FontRegistry): CardScene {
  const primitives: ScenePrimitive[] = [];
  const issues: Issue[] = [];
  doc.elements.forEach((node) => {
    const result = compileElement(node, data, fonts);
    primitives.push(...result.primitives);
    issues.push(...result.issues);
  });
  return { widthMm: 140, heightMm: 90, background: doc.background, primitives, issues, sourceElementCount: doc.elements.length };
}
