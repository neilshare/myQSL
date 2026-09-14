import type { TemplateV2 } from "@myqsl/domain";

export type EditorCommand =
  | { type: "set-background"; color: string }
  | { type: "set-accent"; color: string }
  | { type: "replace-image"; assetId: string; nodeId?: string; crop?: { x: number; y: number; width: number; height: number } }
  | { type: "add-image"; assetId: string; nodeId?: string };
export type StageEditorCommand =
  | { type: "move"; ids: string[]; delta: { xMm: number; yMm: number } }
  | { type: "resize"; id: string; bounds: { xMm: number; yMm: number; widthMm: number; heightMm: number } }
  | { type: "rename"; id: string; name: string }
  | { type: "set-locked"; ids: string[]; locked: boolean }
  | { type: "set-visible"; ids: string[]; visible: boolean }
  | { type: "reorder"; id: string; beforeId: string | null }
  | { type: "duplicate"; ids: string[] }
  | { type: "delete"; ids: string[] };

export function applyEditorCommand(document: TemplateV2, command: EditorCommand): TemplateV2 {
  if (command.type === "set-background") return { ...document, background: command.color };
  if (command.type === "set-accent") {
    const index = document.elements.findIndex((element) => element.type === "rect" && element.width_mm < 30 && element.height_mm > 30);
    if (index < 0) return document;
    const elements = document.elements.slice();
    const element = elements[index];
    if (element.type === "rect") elements[index] = { ...element, fill: command.color };
    return { ...document, elements };
  }
  if (command.type === "replace-image") {
    const elements = document.elements.map((element) => element.type === "image" && (!command.nodeId || element.id === command.nodeId) ? { ...element, asset_id: command.assetId, crop: command.crop ?? element.crop } : element);
    return { ...document, elements };
  }
  const nodeId = command.nodeId ?? "user-photo";
  if (document.elements.some((element) => element.id === nodeId)) return document;
  return {
    ...document,
    elements: [...document.elements, { type: "image", id: nodeId, name: "Uploaded photo", x_mm: 8, y_mm: 8, width_mm: 64, height_mm: 55, locked: false, visible: true, asset_id: command.assetId, crop: { x: 0, y: 0, width: 1, height: 1 } }]
  };
}

export function applyStageCommand(document: TemplateV2, command: StageEditorCommand): TemplateV2 {
  const round = (value: number) => Math.round(value * 10) / 10;
  if (command.type === "move") return { ...document, elements: document.elements.map((element) => command.ids.includes(element.id) ? { ...element, x_mm: round(element.x_mm + command.delta.xMm), y_mm: round(element.y_mm + command.delta.yMm) } : element) };
  if (command.type === "resize") return { ...document, elements: document.elements.map((element) => element.id === command.id ? { ...element, x_mm: round(command.bounds.xMm), y_mm: round(command.bounds.yMm), width_mm: round(command.bounds.widthMm), height_mm: round(command.bounds.heightMm) } : element) };
  if (command.type === "rename") return { ...document, elements: document.elements.map((element) => element.id === command.id ? { ...element, name: command.name.trim().slice(0, 80) || element.name } : element) };
  if (command.type === "set-locked") return { ...document, elements: document.elements.map((element) => command.ids.includes(element.id) ? { ...element, locked: command.locked } : element) };
  if (command.type === "set-visible") return { ...document, elements: document.elements.map((element) => command.ids.includes(element.id) ? { ...element, visible: command.visible } : element) };
  if (command.type === "delete") return { ...document, elements: document.elements.filter((element) => !command.ids.includes(element.id)) };
  if (command.type === "reorder") {
    const selected = document.elements.find((element) => element.id === command.id);
    if (!selected) return document;
    const without = document.elements.filter((element) => element.id !== command.id);
    const index = command.beforeId ? without.findIndex((element) => element.id === command.beforeId) : without.length;
    without.splice(index < 0 ? without.length : index, 0, selected);
    return { ...document, elements: without };
  }
  const selected = document.elements.filter((element) => command.ids.includes(element.id));
  const copies = selected.map((element, index) => ({ ...element, id: `${element.id}-copy-${index + 1}`, name: `${element.name} copy`, x_mm: round(element.x_mm + 2), y_mm: round(element.y_mm + 2) }));
  return { ...document, elements: [...document.elements, ...copies].slice(0, 80) };
}
