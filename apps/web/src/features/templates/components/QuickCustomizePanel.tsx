import type { TemplateV2 } from "@myqsl/domain";
import type { EditorCommand } from "../editor/commands";

export function QuickCustomizePanel({ document, onCommand, onPhotoUpload, disabled = false }: { document: TemplateV2; onCommand: (command: EditorCommand) => void; onPhotoUpload: (file: File) => void; disabled?: boolean }) {
  return <section aria-labelledby="quick-customize" style={{ display: "grid", gap: "0.75rem", padding: "1rem", border: "1px solid var(--border-subtle)", borderRadius: "8px" }}>
    <h3 id="quick-customize" style={{ margin: 0 }}>快速个性化</h3>
    <label>背景配色 <input aria-label="背景配色" type="color" value={document.background} onChange={(event) => onCommand({ type: "set-background", color: event.target.value })} disabled={disabled} /></label>
    <label>强调色 <input aria-label="强调色" type="color" defaultValue="#C96B3B" onChange={(event) => onCommand({ type: "set-accent", color: event.target.value })} disabled={disabled} /></label>
    <label>照片 <input aria-label="上传照片" type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhotoUpload(file); }} disabled={disabled} /></label>
    <small style={{ color: "var(--text-muted)" }}>{document.elements.some((element) => element.type === "image") ? "拖动裁切将在高级编辑器中完成。" : "上传后会在安全区创建照片框，不会把预览 QSO 写入模板。"}</small>
  </section>;
}
