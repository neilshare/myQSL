import type { TemplateV2 } from "@myqsl/domain";
import type { StageEditorCommand } from "../editor/commands";

export function PropertyPanel({ document, onCommand }: { document: TemplateV2; onCommand: (command: StageEditorCommand) => void }) {
  const selected = document.elements[0];
  if (!selected) return <section aria-label="属性面板"><h3>属性</h3><p>暂无元素</p></section>;
  return <section aria-label="属性面板"><h3>属性</h3><label>名称<input aria-label="图层名称" value={selected.name} onChange={(event) => onCommand({ type: "rename", id: selected.id, name: event.target.value })} /></label></section>;
}
