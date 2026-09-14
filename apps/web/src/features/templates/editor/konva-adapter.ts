import Konva from "konva";
import type { CardScene } from "@myqsl/card-scene";
import { documentToScreen, screenToDocument, type PointMm, type Viewport } from "./geometry";
import type { StageEditorCommand } from "./commands";

export type StageRenderInput = { scene: CardScene; selectedIds: ReadonlySet<string>; viewport: Viewport; guides: { trim: boolean; safe: boolean; center: boolean; objects: boolean } };
export type TemplateStage = { render(input: StageRenderInput): void; resize(widthCssPx: number, heightCssPx: number, devicePixelRatio: number): void; fitToWindow(): void; screenToDocument(xCssPx: number, yCssPx: number): PointMm; destroy(): void };

const CSS_PX_PER_MM = 10;

function color(value: string): string { return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#000000"; }

export function mountTemplateStage(container: HTMLDivElement, events: { onSelect(ids: string[]): void; onCommand(command: StageEditorCommand): void; onViewportChange(viewport: Viewport): void }): TemplateStage {
  const width = container.clientWidth || 1400;
  const height = container.clientHeight || Math.round(width * 90 / 140);
  const stage = new Konva.Stage({ container, width, height, pixelRatio: window.devicePixelRatio || 1 });
  const layer = new Konva.Layer();
  stage.add(layer);
  let viewport: Viewport = { zoom: width / (140 * CSS_PX_PER_MM), panXCssPx: 0, panYCssPx: 0 };
  let destroyed = false;

  const render = (input: StageRenderInput): void => {
    if (destroyed) return;
    viewport = input.viewport;
    layer.destroyChildren();
    const scale = CSS_PX_PER_MM * viewport.zoom;
    for (const primitive of input.scene.primitives) {
      if (primitive.type === "rect") {
        const node = new Konva.Rect({ id: primitive.id, x: primitive.xMm * scale + viewport.panXCssPx, y: primitive.yMm * scale + viewport.panYCssPx, width: primitive.widthMm * scale, height: primitive.heightMm * scale, fill: color(primitive.fill), draggable: primitive.id !== "paper", listening: true, opacity: input.selectedIds.has(primitive.id) ? 0.85 : 1 });
        node.setAttr("originMm", { xMm: primitive.xMm, yMm: primitive.yMm });
        node.on("click tap", () => events.onSelect([primitive.id]));
        layer.add(node);
      } else if (primitive.type === "text") {
        const node = new Konva.Text({ id: primitive.id, x: primitive.xMm * scale + viewport.panXCssPx, y: (primitive.baselineMm - primitive.lineHeightMm) * scale + viewport.panYCssPx, width: primitive.widthMm * scale, text: primitive.text, fontSize: primitive.sizePt * 25.4 / 72 * scale, fill: color(primitive.color), align: primitive.align, listening: true, draggable: true });
        node.setAttr("originMm", { xMm: primitive.xMm, yMm: primitive.baselineMm - primitive.lineHeightMm });
        node.on("click tap", () => events.onSelect([primitive.id]));
        layer.add(node);
      }
    }
    layer.draw();
  };
  const onDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    const target = event.target;
    const id = target.id();
    if (!id) return;
    const point = screenToDocument(target.x(), target.y(), viewport, CSS_PX_PER_MM);
    const origin = target.getAttr("originMm") as PointMm | undefined;
    events.onCommand({ type: "move", ids: [id], delta: { xMm: point.xMm - (origin?.xMm ?? point.xMm), yMm: point.yMm - (origin?.yMm ?? point.yMm) } });
  };
  stage.on("dragend", onDragEnd);
  return {
    render,
    resize(widthCssPx, heightCssPx, devicePixelRatio) { stage.width(widthCssPx); stage.height(heightCssPx); stage.setAttr("pixelRatio", devicePixelRatio); stage.draw(); },
    fitToWindow() { const zoom = Math.min((container.clientWidth || width) / (140 * CSS_PX_PER_MM), (container.clientHeight || height) / (90 * CSS_PX_PER_MM)); viewport = { ...viewport, zoom, panXCssPx: 0, panYCssPx: 0 }; events.onViewportChange(viewport); },
    screenToDocument(xCssPx, yCssPx) { return screenToDocument(xCssPx, yCssPx, viewport, CSS_PX_PER_MM); },
    destroy() { destroyed = true; stage.off("dragend", onDragEnd); stage.destroy(); }
  };
}

export function stagePointToMm(xCssPx: number, yCssPx: number, viewport: Viewport): PointMm { return screenToDocument(xCssPx, yCssPx, viewport, CSS_PX_PER_MM); }
export function mmPointToStage(point: PointMm, viewport: Viewport): { xCssPx: number; yCssPx: number } { return documentToScreen(point, viewport, CSS_PX_PER_MM); }
