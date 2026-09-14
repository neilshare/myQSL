import type { TemplateV2 } from "@myqsl/domain";
import type { EditorCommand } from "../editor/commands";

export function QuickCustomizePanel({ document, onCommand, onPhotoUpload, disabled = false }: { document: TemplateV2; onCommand: (command: EditorCommand) => void; onPhotoUpload: (file: File) => void; disabled?: boolean }) {
  const image = document.elements.find((element) => element.type === "image");
  const updateCrop = (key: "x" | "y" | "width" | "height", value: number) => {
    if (!image || image.type !== "image") return;
    const crop = { ...image.crop, [key]: value };
    if (crop.x + crop.width > 1) crop.width = Math.max(0.05, 1 - crop.x);
    if (crop.y + crop.height > 1) crop.height = Math.max(0.05, 1 - crop.y);
    onCommand({ type: "replace-image", nodeId: image.id, assetId: image.asset_id, crop });
  };
  return <section aria-labelledby="quick-customize" style={{ display: "grid", gap: "0.75rem", padding: "1rem", border: "1px solid var(--border-subtle)", borderRadius: "8px" }}>
    <h3 id="quick-customize" style={{ margin: 0 }}>快速个性化</h3>
    <label>背景配色 <input aria-label="背景配色" type="color" value={document.background} onChange={(event) => onCommand({ type: "set-background", color: event.target.value })} disabled={disabled} /></label>
    <label>强调色 <input aria-label="强调色" type="color" defaultValue="#C96B3B" onChange={(event) => onCommand({ type: "set-accent", color: event.target.value })} disabled={disabled} /></label>
    <label>照片 <input aria-label="上传照片" type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhotoUpload(file); }} disabled={disabled} /></label>
    {image && <fieldset style={{ display: "grid", gap: "0.35rem" }}><legend>照片裁切</legend>
      {(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key} <input aria-label={`照片裁切 ${key}`} type="range" min="0" max="1" step="0.01" value={image.crop[key]} onChange={(event) => updateCrop(key, Number(event.target.value))} disabled={disabled} /></label>)}
    </fieldset>}
    <small style={{ color: "var(--text-muted)" }}>{image ? "裁切值按原图比例保存，不会把预览 QSO 写入模板。" : "上传后会在安全区创建照片框，不会把预览 QSO 写入模板。"}</small>
  </section>;
}
